// ============================================
// MARKET BOOKING - CUSTOMER SIDE
// ============================================

var todayBookings = {};
var activePrice = { price_per_day: 5.00, currency: 'USD', zwg_rate: null };
var HOLD_MINUTES = 10;
var realtimeChannel = null;
var realtimeReportChannel = null;
var reportsCache = {};

// --------------------------------------------
// BOOT
// --------------------------------------------
async function marketBoot() {
  MarketUtils.initSupabase();
  MarketUtils.injectGridCSS();

  document.getElementById('todayLabel').textContent = MarketUtils.todayLong();

  await MarketUtils.expireOldBookings();

  activePrice = await MarketUtils.fetchActivePrice();
  updatePriceDisplay();

  await refreshGrid();
  await refreshReports();

  realtimeChannel = MarketUtils.subscribeToBookings(function() {
    refreshGrid().then(refreshReports);
  });

  realtimeReportChannel = MarketUtils.subscribeToReports(function() {
    refreshReports();
  });

  setInterval(async function() {
    await MarketUtils.expireOldBookings();
    await refreshGrid();
    await refreshReports();
  }, 60000);
}

function updatePriceDisplay() {
  var el = document.getElementById('priceValue');
  var subEl = document.getElementById('priceSub');
  if (el) {
    el.textContent = MarketUtils.formatMoney(activePrice.price_per_day, 'USD');
  }
  if (subEl) {
    if (activePrice.zwg_rate) {
      var zwg = MarketUtils.computeZwg(activePrice.price_per_day, activePrice.zwg_rate);
      subEl.textContent = 'Approximately ZWG ' + Number(zwg).toFixed(2) +
        ' at rate ' + Number(activePrice.zwg_rate).toFixed(4) + ' per USD';
    } else {
      subEl.textContent = 'ZWG equivalent will be shown once today\'s rate is set.';
    }
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
// REFRESH REPORTS CACHE
// Adds an orange dot to any stand with open reports.
// --------------------------------------------
async function refreshReports() {
  reportsCache = await MarketUtils.fetchOpenReportCounts();
  var cells = document.querySelectorAll('.market-stand');
  cells.forEach(function(cell) {
    var n = parseInt(cell.getAttribute('data-stand'), 10);
    if (reportsCache[n]) {
      cell.classList.add('has-report');
      var baseTitle = cell.getAttribute('title') || ('Stand ' + n);
      if (baseTitle.indexOf('open report') === -1) {
        cell.setAttribute('title', baseTitle + ' - ' + reportsCache[n] + ' open report(s)');
      }
    } else {
      cell.classList.remove('has-report');
    }
  });
}

// --------------------------------------------
// STAND CLICK
// --------------------------------------------
function onStandClick(standNumber, booking) {
  if (booking && booking.status === 'confirmed') {
    openOccupiedStandModal(standNumber, booking);
    return;
  }
  if (booking && booking.status === 'pending_payment') {
    openOccupiedStandModal(standNumber, booking);
    return;
  }
  openBookingModal(standNumber);
}

function openOccupiedStandModal(standNumber, booking) {
  document.getElementById('modalTitle').textContent = 'Stand ' + standNumber;
  var statusText = booking.status === 'confirmed'
    ? 'This stand is already booked for today.'
    : 'This stand is currently being paid for by another customer.';
  document.getElementById('modalBody').innerHTML = ''
    + '<div class="modal-summary">'
    +   '<div class="row"><span class="label">Stand Number</span><span class="value">' + standNumber + '</span></div>'
    +   '<div class="row"><span class="label">Date</span><span class="value">' + MarketUtils.escapeHtml(MarketUtils.todayLong()) + '</span></div>'
    + '</div>'
    + '<p style="color:#666;font-size:14px;margin-bottom:14px;">' + statusText + '</p>'
    + '<button class="btn btn-report" onclick="openReportModal(' + standNumber + ')">Report this stand user</button>'
    + '<button class="btn btn-secondary" onclick="closeModal()">Close</button>';
  document.getElementById('bookingModal').classList.add('show');
}

// --------------------------------------------
// BOOKING MODAL (available stand)
// --------------------------------------------
function openBookingModal(standNumber) {
  var usdStr = MarketUtils.formatMoney(activePrice.price_per_day, 'USD');
  var zwgStr = activePrice.zwg_rate
    ? 'ZWG ' + Number(MarketUtils.computeZwg(activePrice.price_per_day, activePrice.zwg_rate)).toFixed(2)
    : 'ZWG rate not yet set';
  var todayStr = MarketUtils.todayLong();

  document.getElementById('modalTitle').textContent = 'Book Stand ' + standNumber;

  document.getElementById('modalBody').innerHTML = ''
    + '<div class="modal-summary">'
    +   '<div class="row"><span class="label">Stand Number</span><span class="value">' + standNumber + '</span></div>'
    +   '<div class="row"><span class="label">Date</span><span class="value">' + MarketUtils.escapeHtml(todayStr) + '</span></div>'
    +   '<div class="row"><span class="label">Price (USD)</span><span class="value">' + usdStr + '</span></div>'
    +   '<div class="row"><span class="label">Price (ZWG)</span><span class="value">' + zwgStr + '</span></div>'
    + '</div>'
    + '<div class="form-group">'
    +   '<label>Full Name <span class="required-star">*</span></label>'
    +   '<input type="text" id="custName" placeholder="Enter your full name" required>'
    + '</div>'
    + '<div class="form-group">'
    +   '<label>Phone Number <span class="required-star">*</span></label>'
    +   '<input type="tel" id="custPhone" placeholder="e.g., 0771 234 567" required>'
    +   '<div class="hint">Only one stand per phone or email per day, unless you have a council-approved quota.</div>'
    + '</div>'
    + '<div class="form-group">'
    +   '<label>Email <span class="required-star">*</span></label>'
    +   '<input type="email" id="custEmail" placeholder="you@example.com" required>'
    +   '<div class="hint">Your booking reference and QR code will be sent to this email.</div>'
    + '</div>'
    + '<div id="modalError" class="error hidden" style="margin-top:0;margin-bottom:14px;"></div>'
    + '<button class="btn btn-paynow" id="payBtn" onclick="submitBooking(' + standNumber + ')">Reserve Stand</button>'
    + '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>'
    + '<button class="btn btn-report" onclick="openReportModal(' + standNumber + ')">Report this stand</button>';

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

  if (!name) { errBox.textContent = 'Please enter your full name.'; errBox.classList.remove('hidden'); return; }
  if (!phone) { errBox.textContent = 'Please enter your phone number.'; errBox.classList.remove('hidden'); return; }
  if (!email) { errBox.textContent = 'Please enter your email address so we can send your confirmation and QR code.'; errBox.classList.remove('hidden'); return; }

  var client = MarketUtils.getClient();
  if (!client) {
    errBox.textContent = 'Connection error. Please refresh and try again.';
    errBox.classList.remove('hidden');
    return;
  }

  var btn = document.getElementById('payBtn');
  btn.disabled = true;
  btn.textContent = 'Checking availability...';

  try {
    var today = MarketUtils.todayIso();

    // 1. Stand availability check
    var { data: clash, error: clashError } = await client
      .from('market_bookings')
      .select('id,status')
      .eq('stand_number', standNumber)
      .eq('booking_date', today)
      .in('status', ['pending_payment', 'confirmed'])
      .maybeSingle();

    if (clashError && clashError.code !== 'PGRST116') throw clashError;
    if (clash) {
      throw new Error('This stand was just taken by another customer. Please choose a different stand.');
    }

    // 2. One-booking-per-customer check (with quota bypass)
    btn.textContent = 'Checking your bookings...';

    var quota = await MarketUtils.findActiveQuota(phone, email, today);
    var existing = await MarketUtils.countActiveBookingsForCustomer(phone, email, today, null);
    var allowed = quota ? Number(quota.max_stands_per_day) : 1;

    if (existing >= allowed) {
      if (quota) {
        throw new Error('You already have ' + existing + ' active bookings today. Your current quota allows ' + allowed + ' stands per day. Please release a booking or contact the council for a larger quota.');
      } else {
        throw new Error('You already have a stand booked for today. Only one stand per phone or email is allowed. If you are a large-scale farmer who needs multiple stands, please contact the council to request a multi-stand quota.');
      }
    }

    // 3. Reserve
    btn.textContent = 'Reserving stand...';
    var now = new Date();
    var expires = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);
    var reference = MarketUtils.generateBookingReference();

    var zwgAmount = activePrice.zwg_rate
      ? MarketUtils.computeZwg(activePrice.price_per_day, activePrice.zwg_rate)
      : null;

    var newBooking = {
      stand_number: standNumber,
      booking_date: today,
      customer_name: name,
      customer_phone: phone,
      customer_email: email,
      amount_paid: activePrice.price_per_day,
      currency: 'USD',
      status: 'pending_payment',
      paynow_status: 'pending',
      booking_reference: reference,
      booked_at: now.toISOString(),
      expires_at: expires.toISOString(),
      zwg_amount: zwgAmount,
      zwg_rate_used: activePrice.zwg_rate || null,
      quota_id: quota ? quota.id : null
    };

    var { data: inserted, error: insertError } = await client
      .from('market_bookings')
      .insert([newBooking])
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        throw new Error('This stand was just taken by another customer. Please choose a different stand.');
      }
      throw insertError;
    }

    showPendingPaymentScreen(inserted);

  } catch (err) {
    console.error('Booking error:', err);
    errBox.textContent = err.message || 'Could not reserve stand. Please try again.';
    errBox.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Reserve Stand';
  }
}

function showPendingPaymentScreen(booking) {
  document.getElementById('modalTitle').textContent = 'Stand Reserved';
  document.getElementById('modalBody').innerHTML = ''
    + '<div class="confirmation-box">'
    +   '<div class="tick" style="background:#ffc107;color:#333;">!</div>'
    +   '<h3 style="color:#856404;margin-bottom:8px;">Stand Held For You</h3>'
    +   '<p style="color:#666;font-size:14px;margin-bottom:12px;">'
    +     'Stand <strong>' + booking.stand_number + '</strong> is reserved for the next '
    +     HOLD_MINUTES + ' minutes.'
    +   '</p>'
    +   '<div class="ref">' + MarketUtils.escapeHtml(booking.booking_reference) + '</div>'
    +   '<p style="color:#666;font-size:13px;">'
    +     'Please complete your payment at the council offices within ' + HOLD_MINUTES +
    +     ' minutes and quote this reference. If payment is not received, the stand will be released back to the market.'
    +   '</p>'
    +   '<div style="background:#cce5ff;color:#004085;padding:12px;border-radius:8px;margin-top:16px;font-size:13px;text-align:left;">'
    +     '<strong>Email confirmation</strong><br>'
    +     'Once the council confirms your payment, your booking confirmation with the QR code will be sent to ' +
    +     MarketUtils.escapeHtml(booking.customer_email) + '.'
    +   '</div>'
    +   '<button class="btn btn-secondary" style="margin-top:16px;" onclick="closeModalAndRefresh()">Close</button>'
    + '</div>';
}

function closeModalAndRefresh() {
  closeModal();
  refreshGrid();
  refreshReports();
}

// ============================================
// REPORT A STAND USER
// ============================================
async function openReportModal(standNumber) {
  document.getElementById('bookingModal').classList.remove('show');

  document.getElementById('reportModalTitle').textContent = 'Report Stand ' + standNumber;

  var booking = todayBookings[standNumber] || null;
  var reports = await MarketUtils.fetchReportsForStand(standNumber);

  var bookingHtml = '';
  if (booking) {
    bookingHtml = ''
      + '<div class="modal-summary">'
      +   '<div class="row"><span class="label">Booked By</span><span class="value">' + MarketUtils.escapeHtml(booking.customer_name) + '</span></div>'
      +   '<div class="row"><span class="label">Date</span><span class="value">' + MarketUtils.escapeHtml(MarketUtils.todayLong()) + '</span></div>'
      + '</div>';
  } else {
    bookingHtml = ''
      + '<div class="modal-summary">'
      +   '<div class="row"><span class="label">Stand</span><span class="value">' + standNumber + '</span></div>'
      +   '<div class="row"><span class="label">Status</span><span class="value">Not booked today</span></div>'
      + '</div>';
  }

  var existingHtml = '';
  if (reports && reports.length > 0) {
    existingHtml = '<div style="margin:14px 0 8px 0;font-weight:bold;color:#1e3c72;font-size:13px;">Previous reports for this stand</div>';
    existingHtml += '<div class="report-history">';
    reports.forEach(function(r) {
      var statusColors = {
        'open': '#fd7e14',
        'reviewed': '#17a2b8',
        'resolved': '#28a745',
        'dismissed': '#6c757d'
      };
      var color = statusColors[r.status] || '#6c757d';
      existingHtml += ''
        + '<div class="report-item">'
        +   '<div class="report-item-head">'
        +     '<strong>' + MarketUtils.escapeHtml(r.reason) + '</strong>'
        +     '<span class="report-status-pill" style="background:' + color + ';">' + r.status.toUpperCase() + '</span>'
        +   '</div>'
        +   (r.details ? '<div class="report-item-body">' + MarketUtils.escapeHtml(r.details) + '</div>' : '')
        +   '<div class="report-item-meta">' + new Date(r.created_at).toLocaleString() + '</div>'
        + '</div>';
    });
    existingHtml += '</div>';
  }

  document.getElementById('reportModalBody').innerHTML = ''
    + bookingHtml
    + existingHtml
    + '<div style="margin-top:16px;border-top:1px solid #e9ecef;padding-top:16px;">'
    +   '<div style="font-weight:bold;color:#1e3c72;font-size:13px;margin-bottom:10px;">File a new report</div>'
    +   '<div class="form-group">'
    +     '<label>Your Name <span class="required-star">*</span></label>'
    +     '<input type="text" id="reportName" placeholder="Enter your full name">'
    +   '</div>'
    +   '<div class="form-group">'
    +     '<label>Your Phone <span class="required-star">*</span></label>'
    +     '<input type="tel" id="reportPhone" placeholder="e.g., 0771 234 567">'
    +   '</div>'
    +   '<div class="form-group">'
    +     '<label>Reason <span class="required-star">*</span></label>'
    +     '<select id="reportReason">'
    +       '<option value="">-- Select a reason --</option>'
    +       '<option value="Standing outside assigned stand">Standing outside assigned stand</option>'
    +       '<option value="Blocking walkway or aisle">Blocking walkway or aisle</option>'
    +       '<option value="Selling unauthorized goods">Selling unauthorized goods</option>'
    +       '<option value="Noise or nuisance">Noise or nuisance</option>'
    +       '<option value="Waste or poor hygiene">Waste or poor hygiene</option>'
    +       '<option value="Harassment or abuse">Harassment or abuse</option>'
    +       '<option value="Subletting the stand">Subletting the stand</option>'
    +       '<option value="Other">Other</option>'
    +     '</select>'
    +   '</div>'
    +   '<div class="form-group">'
    +     '<label>Details (optional)</label>'
    +     '<textarea id="reportDetails" rows="3" placeholder="Add anything the council should know..."></textarea>'
    +   '</div>'
    +   '<div id="reportError" class="error hidden" style="margin-top:0;margin-bottom:14px;"></div>'
    +   '<button class="btn btn-report" id="submitReportBtn" onclick="submitReport(' + standNumber + ')">Submit Report</button>'
    +   '<button class="btn btn-secondary" onclick="closeReportModal()">Cancel</button>'
    + '</div>';

  document.getElementById('reportModal').classList.add('show');
}

function closeReportModal() {
  document.getElementById('reportModal').classList.remove('show');
}

async function submitReport(standNumber) {
  var name = (document.getElementById('reportName').value || '').trim();
  var phone = (document.getElementById('reportPhone').value || '').trim();
  var reason = document.getElementById('reportReason').value;
  var details = (document.getElementById('reportDetails').value || '').trim();
  var errBox = document.getElementById('reportError');

  errBox.classList.add('hidden');
  errBox.textContent = '';

  if (!name) { errBox.textContent = 'Please enter your name.'; errBox.classList.remove('hidden'); return; }
  if (!phone) { errBox.textContent = 'Please enter your phone number.'; errBox.classList.remove('hidden'); return; }
  if (!reason) { errBox.textContent = 'Please select a reason for the report.'; errBox.classList.remove('hidden'); return; }

  var btn = document.getElementById('submitReportBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  var booking = todayBookings[standNumber] || null;

  try {
    await MarketUtils.submitReport({
      stand_number: standNumber,
      booking_id: booking ? booking.id : null,
      reported_by_name: name,
      reported_by_phone: phone,
      reason: reason,
      details: details || null,
      status: 'open'
    });

    document.getElementById('reportModalTitle').textContent = 'Report Submitted';
    document.getElementById('reportModalBody').innerHTML = ''
      + '<div class="confirmation-box">'
      +   '<div class="tick" style="background:#fd7e14;color:white;">!</div>'
      +   '<h3 style="color:#856404;margin-bottom:8px;">Report Received</h3>'
      +   '<p style="color:#666;font-size:14px;">'
      +     'Thank you. The council has received your report for stand ' + standNumber +
      +     '. They will review it and take any necessary action.'
      +   '</p>'
      +   '<button class="btn btn-secondary" style="margin-top:16px;" onclick="closeReportModalAndRefresh()">Close</button>'
      + '</div>';

    await refreshReports();

  } catch (err) {
    console.error('Submit report error:', err);
    errBox.textContent = err.message || 'Could not submit report. Please try again.';
    errBox.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Submit Report';
  }
}

function closeReportModalAndRefresh() {
  closeReportModal();
  refreshReports();
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
  }, 5000);
}

// --------------------------------------------
// GO
// --------------------------------------------
marketBoot();
