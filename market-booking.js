// ============================================
// MARKET BOOKING - CUSTOMER SIDE
// ============================================

var todayBookings = {};
var activePrice = { price_per_day: 5.00, currency: 'USD' };
var HOLD_MINUTES = 10;
var realtimeChannel = null;

// --------------------------------------------
// BOOT
// --------------------------------------------
async function marketBoot() {
  MarketUtils.initSupabase();
  MarketUtils.injectGridCSS();

  document.getElementById('todayLabel').textContent = MarketUtils.todayLong();

  // Expire any stale holds from earlier visitors
  await MarketUtils.expireOldBookings();

  // Load price
  activePrice = await MarketUtils.fetchActivePrice();
  updatePriceDisplay();

  // Load bookings
  await refreshGrid();

  // Real-time updates
  realtimeChannel = MarketUtils.subscribeToBookings(function() {
    refreshGrid();
  });

  // Periodic hold expiry check (every 60s)
  setInterval(async function() {
    await MarketUtils.expireOldBookings();
    refreshGrid();
  }, 60000);
}

function updatePriceDisplay() {
  var el = document.getElementById('priceValue');
  if (el) {
    el.textContent = MarketUtils.formatMoney(activePrice.price_per_day, activePrice.currency);
  }
}

// --------------------------------------------
// REFRESH GRID
// --------------------------------------------
async function refreshGrid() {
  todayBookings = await MarketUtils.fetchTodayBookings();
  MarketUtils.renderMarketGrid('marketContainer', todayBookings, onStandClick);
}

// --------------------------------------------
// STAND CLICK
// --------------------------------------------
function onStandClick(standNumber, booking) {
  if (booking && booking.status === 'confirmed') {
    showInfo('Stand ' + standNumber + ' is already booked for today.');
    return;
  }
  if (booking && booking.status === 'pending_payment') {
    showInfo('Stand ' + standNumber + ' is currently being paid for by another customer. Please choose another stand.');
    return;
  }
  openBookingModal(standNumber);
}

// --------------------------------------------
// BOOKING MODAL
// --------------------------------------------
function openBookingModal(standNumber) {
  var priceStr = MarketUtils.formatMoney(activePrice.price_per_day, activePrice.currency);
  var todayStr = MarketUtils.todayLong();

  document.getElementById('modalTitle').textContent = 'Book Stand ' + standNumber;

  document.getElementById('modalBody').innerHTML = ''
    + '<div class="modal-summary">'
    +   '<div class="row"><span class="label">Stand Number</span><span class="value">' + standNumber + '</span></div>'
    +   '<div class="row"><span class="label">Date</span><span class="value">' + MarketUtils.escapeHtml(todayStr) + '</span></div>'
    +   '<div class="row"><span class="label">Price</span><span class="value">' + priceStr + '</span></div>'
    + '</div>'
    + '<div class="form-group">'
    +   '<label>Full Name <span class="required-star">*</span></label>'
    +   '<input type="text" id="custName" placeholder="Enter your full name" required>'
    + '</div>'
    + '<div class="form-group">'
    +   '<label>Phone Number <span class="required-star">*</span></label>'
    +   '<input type="tel" id="custPhone" placeholder="e.g., 0771 234 567" required>'
    +   '<div class="hint">Used by the council to contact you about this booking.</div>'
    + '</div>'
    + '<div class="form-group">'
    +   '<label>Email (optional)</label>'
    +   '<input type="email" id="custEmail" placeholder="you@example.com">'
    + '</div>'
    + '<div id="modalError" class="error hidden" style="margin-top:0;margin-bottom:14px;"></div>'
    + '<button class="btn btn-paynow" id="payBtn" onclick="submitBooking(' + standNumber + ')">Pay with PayNow</button>'
    + '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>';

  document.getElementById('bookingModal').classList.add('show');
}

function closeModal() {
  document.getElementById('bookingModal').classList.remove('show');
}

// --------------------------------------------
// SUBMIT BOOKING
// --------------------------------------------
async function submitBooking(standNumber) {
  var name = (document.getElementById('custName').value || '').trim();
  var phone = (document.getElementById('custPhone').value || '').trim();
  var email = (document.getElementById('custEmail').value || '').trim();
  var errBox = document.getElementById('modalError');

  errBox.classList.add('hidden');
  errBox.textContent = '';

  if (!name) {
    errBox.textContent = 'Please enter your full name.';
    errBox.classList.remove('hidden');
    return;
  }
  if (!phone) {
    errBox.textContent = 'Please enter your phone number.';
    errBox.classList.remove('hidden');
    return;
  }

  var client = MarketUtils.getClient();
  if (!client) {
    errBox.textContent = 'Connection error. Please refresh and try again.';
    errBox.classList.remove('hidden');
    return;
  }

  var btn = document.getElementById('payBtn');
  btn.disabled = true;
  btn.textContent = 'Reserving stand...';

  try {
    // Re-check availability with fresh data
    var today = MarketUtils.todayIso();
    var { data: clash, error: clashError } = await client
      .from('market_bookings')
      .select('id,status')
      .eq('stand_number', standNumber)
      .eq('booking_date', today)
      .in('status', ['pending_payment', 'confirmed'])
      .maybeSingle();

    if (clashError && clashError.code !== 'PGRST116') {
      throw clashError;
    }

    if (clash) {
      throw new Error('This stand was just taken by another customer. Please choose a different stand.');
    }

    // Create the hold
    var now = new Date();
    var expires = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);
    var reference = MarketUtils.generateBookingReference();

    var newBooking = {
      stand_number: standNumber,
      booking_date: today,
      customer_name: name,
      customer_phone: phone,
      customer_email: email || null,
      amount_paid: activePrice.price_per_day,
      currency: activePrice.currency,
      status: 'pending_payment',
      paynow_status: 'pending',
      booking_reference: reference,
      booked_at: now.toISOString(),
      expires_at: expires.toISOString()
    };

    var { data: inserted, error: insertError } = await client
      .from('market_bookings')
      .insert([newBooking])
      .select()
      .single();

    if (insertError) {
      // Unique constraint means someone beat us to it
      if (insertError.code === '23505') {
        throw new Error('This stand was just taken by another customer. Please choose a different stand.');
      }
      throw insertError;
    }

    // Hand off to PayNow
    await initiatePayNowPayment(inserted);

  } catch (err) {
    console.error('Booking error:', err);
    errBox.textContent = err.message || 'Could not reserve stand. Please try again.';
    errBox.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Pay with PayNow';
  }
}

// ============================================
// PAYNOW INTEGRATION HOOK
// ============================================
// Replace the body of this function with your
// real PayNow integration when ready.
//
// Your PayNow handler should:
//   1. Take the booking record (with reference,
//      amount, currency, customer details).
//   2. Call PayNow initiate-transaction from a
//      secure server side (Supabase Edge Function).
//   3. Redirect the customer to the returned
//      browser URL, OR present the returned
//      pollUrl for mobile push.
//
// When PayNow confirms payment (via your webhook),
// the webhook should:
//   UPDATE market_bookings
//   SET status='confirmed',
//       paynow_status='paid',
//       paynow_reference='<paynow ref>',
//       confirmed_at=NOW()
//   WHERE id=<booking id> AND status='pending_payment';
//
// Then real-time updates the grid automatically.
// ============================================
async function initiatePayNowPayment(booking) {
  console.log('PayNow hook invoked for booking:', booking.booking_reference);

  // ---- PLACEHOLDER BEHAVIOUR ----
  // Until PayNow is wired up, we show the customer
  // a "pending payment" screen. The stand is now
  // held for HOLD_MINUTES minutes. Council admin
  // can manually mark it paid in the admin page.
  showPendingPaymentScreen(booking);
}

function showPendingPaymentScreen(booking) {
  document.getElementById('modalTitle').textContent = 'Payment Pending';
  document.getElementById('modalBody').innerHTML = ''
    + '<div class="confirmation-box">'
    +   '<div class="tick" style="background:#ffc107;color:#333;">!</div>'
    +   '<h3 style="color:#856404;margin-bottom:8px;">Stand Reserved</h3>'
    +   '<p style="color:#666;font-size:14px;margin-bottom:12px;">'
    +     'Stand <strong>' + booking.stand_number + '</strong> is held for you for the next '
    +     HOLD_MINUTES + ' minutes.'
    +   '</p>'
    +   '<div class="ref">' + MarketUtils.escapeHtml(booking.booking_reference) + '</div>'
    +   '<p style="color:#666;font-size:13px;">'
    +     'Complete your PayNow payment to confirm the booking. If payment is not received in '
    +     HOLD_MINUTES + ' minutes, the stand will be released back to the market.'
    +   '</p>'
    +   '<div style="background:#fff3cd;color:#856404;padding:12px;border-radius:8px;margin-top:16px;font-size:13px;text-align:left;">'
    +     '<strong>PayNow integration is being configured.</strong> '
    +     'Please present this reference at the council offices, or wait for the payment prompt on your phone.'
    +   '</div>'
    +   '<button class="btn btn-secondary" style="margin-top:16px;" onclick="closeModalAndRefresh()">Close</button>'
    + '</div>';
}

function closeModalAndRefresh() {
  closeModal();
  refreshGrid();
}

// --------------------------------------------
// FLASH MESSAGES
// --------------------------------------------
function showInfo(msg) {
  var el = document.getElementById('successDisplay');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.background = '#cce5ff';
  el.style.color = '#004085';
  el.style.borderLeftColor = '#007bff';
  setTimeout(function() {
    el.classList.add('hidden');
    el.style.background = '';
    el.style.color = '';
    el.style.borderLeftColor = '';
  }, 4000);
}

// --------------------------------------------
// GO
// --------------------------------------------
marketBoot();
