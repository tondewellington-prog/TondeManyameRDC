// ============================================
// MARKET ADMIN - COUNCIL SIDE
// ============================================

var currentStaffUser = sessionStorage.getItem('staffEmail');
var currentStaffName = sessionStorage.getItem('staffDisplayName');
var currentStaffRole = sessionStorage.getItem('staffRole') || 'building_inspector';

var todayBookings = {};
var activePrice = { price_per_day: 5.00, currency: 'USD' };
var realtimeChannel = null;

// --------------------------------------------
// BOOT
// --------------------------------------------
async function adminBoot() {
  MarketUtils.initSupabase();
  MarketUtils.injectGridCSS();

  document.getElementById('todayLabel').textContent = MarketUtils.todayLong();

  // Access check
  if (!currentStaffUser || !currentStaffName) {
    showAccessDenied('Please login first.');
    return;
  }
  if (currentStaffRole !== 'district_planner') {
    showAccessDenied('Only the District Planner can manage the market.');
    return;
  }

  document.getElementById('adminBody').classList.remove('hidden');
  document.getElementById('staffName').textContent = currentStaffName;

  // Tab switching
  bindTabs();

  // Expire stale holds
  await MarketUtils.expireOldBookings();

  // Price
  activePrice = await MarketUtils.fetchActivePrice();
  document.getElementById('newPrice').value = activePrice.price_per_day;
  document.getElementById('newCurrency').value = activePrice.currency || 'USD';

  // Initial load
  await refreshAll();

  // Real-time
  realtimeChannel = MarketUtils.subscribeToBookings(function() {
    refreshAll();
  });

  // Periodic hold expiry
  setInterval(async function() {
    await MarketUtils.expireOldBookings();
    refreshAll();
  }, 60000);
}

function bindTabs() {
  var tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(function(btn) {
    btn.addEventListener('click', function() {
      tabs.forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function(p) {
        p.classList.remove('active');
      });
      this.classList.add('active');
      var tab = this.getAttribute('data-tab');
      var panel = document.getElementById('panel-' + tab);
      if (panel) panel.classList.add('active');
    });
  });
}

function showAccessDenied(msg) {
  var el = document.getElementById('accessDenied');
  el.innerHTML = '<strong>Access Denied</strong><br>' + MarketUtils.escapeHtml(msg)
    + '<br><br><a href="index.html">Return to Dashboard</a>';
  el.classList.remove('hidden');
}

// --------------------------------------------
// REFRESH ALL
// --------------------------------------------
async function refreshAll() {
  await refreshGrid();
  await refreshBookingsTable();
  await refreshPricingHistory();
}

async function refreshGrid() {
  todayBookings = await MarketUtils.fetchTodayBookings();
  MarketUtils.renderMarketGrid('marketContainer', todayBookings, onStandClick);
  updateStats();
}

function updateStats() {
  var totalStands = 100;
  var booked = 0;
  var pending = 0;
  var revenue = 0;

  for (var n = 1; n <= totalStands; n++) {
    var b = todayBookings[n];
    if (!b) continue;
    if (b.status === 'confirmed') {
      booked++;
      revenue += Number(b.amount_paid || 0);
    } else if (b.status === 'pending_payment') {
      pending++;
    }
  }

  document.getElementById('statAvailable').textContent = (totalStands - booked - pending);
  document.getElementById('statBooked').textContent = booked;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statRevenue').textContent =
    MarketUtils.formatMoney(revenue, activePrice.currency);
}

// --------------------------------------------
// STAND CLICK
// --------------------------------------------
function onStandClick(standNumber, booking) {
  openStandModal(standNumber, booking);
}

function openStandModal(standNumber, booking) {
  document.getElementById('standModalTitle').textContent = 'Stand ' + standNumber;

  var body = document.getElementById('standModalBody');

  if (!booking) {
    body.innerHTML = ''
      + '<div class="info-row"><span class="label">Status</span><span class="value" style="color:#28a745;">Available</span></div>'
      + '<p style="color:#666;font-size:14px;margin-top:14px;">No booking for today.</p>'
      + '<div class="modal-actions">'
      +   '<button class="btn btn-secondary" onclick="closeStandModal()">Close</button>'
      + '</div>';
    document.getElementById('standModal').classList.add('show');
    return;
  }

  var statusLabel = booking.status === 'confirmed' ? 'Booked and Paid'
                  : booking.status === 'pending_payment' ? 'Payment Pending'
                  : booking.status;

  var html = ''
    + '<div class="info-row"><span class="label">Status</span><span class="value">' + MarketUtils.escapeHtml(statusLabel) + '</span></div>'
    + '<div class="info-row"><span class="label">Reference</span><span class="value">' + MarketUtils.escapeHtml(booking.booking_reference) + '</span></div>'
    + '<div class="info-row"><span class="label">Customer</span><span class="value">' + MarketUtils.escapeHtml(booking.customer_name) + '</span></div>'
    + '<div class="info-row"><span class="label">Phone</span><span class="value">' + MarketUtils.escapeHtml(booking.customer_phone) + '</span></div>';

  if (booking.customer_email) {
    html += '<div class="info-row"><span class="label">Email</span><span class="value">' + MarketUtils.escapeHtml(booking.customer_email) + '</span></div>';
  }

  html += ''
    + '<div class="info-row"><span class="label">Amount</span><span class="value">' + MarketUtils.formatMoney(booking.amount_paid, booking.currency) + '</span></div>'
    + '<div class="info-row"><span class="label">Booked At</span><span class="value">' + MarketUtils.formatTime(booking.booked_at) + '</span></div>';

  if (booking.status === 'pending_payment' && booking.expires_at) {
    var remaining = Math.max(0, Math.round((new Date(booking.expires_at) - new Date()) / 60000));
    html += '<div class="info-row"><span class="label">Hold Expires</span><span class="value">' + remaining + ' min</span></div>';
  }

  html += '<div class="modal-actions">';

  if (booking.status === 'pending_payment') {
    html += '<button class="btn btn-success" onclick="markAsPaid(\'' + booking.id + '\')">Mark as Paid</button>';
    html += '<button class="btn btn-danger" onclick="releaseBooking(\'' + booking.id + '\')">Release Stand</button>';
  } else if (booking.status === 'confirmed') {
    html += '<button class="btn btn-danger" onclick="releaseBooking(\'' + booking.id + '\')">Release Stand</button>';
  }

  html += '<button class="btn btn-secondary" onclick="closeStandModal()">Close</button>';
  html += '</div>';

  body.innerHTML = html;
  document.getElementById('standModal').classList.add('show');
}

function closeStandModal() {
  document.getElementById('standModal').classList.remove('show');
}

// --------------------------------------------
// MARK AS PAID
// --------------------------------------------
async function markAsPaid(bookingId) {
  var client = MarketUtils.getClient();
  if (!client) return;

  if (!confirm('Mark this booking as paid? The stand will become permanently booked for today.')) return;

  try {
    var { error } = await client
      .from('market_bookings')
      .update({
        status: 'confirmed',
        paynow_status: 'paid',
        confirmed_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (error) throw error;

    await client.from('market_audit_log').insert([{
      action: 'marked_paid',
      booking_id: bookingId,
      performed_by: currentStaffName,
      details: {}
    }]);

    showSuccess('Booking confirmed.');
    closeStandModal();
    refreshAll();
  } catch (err) {
    console.error('Mark paid error:', err);
    showError('Failed to confirm booking: ' + err.message);
  }
}

// --------------------------------------------
// RELEASE BOOKING
// --------------------------------------------
async function releaseBooking(bookingId) {
  var client = MarketUtils.getClient();
  if (!client) return;

  var reason = prompt('Reason for releasing this stand (optional):');
  if (reason === null) return;

  if (!confirm('Release this stand back to the market? The customer will lose their booking.')) return;

  try {
    var { error } = await client
      .from('market_bookings')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        released_by: currentStaffName,
        release_reason: reason || 'Released by council'
      })
      .eq('id', bookingId);

    if (error) throw error;

    await client.from('market_audit_log').insert([{
      action: 'released',
      booking_id: bookingId,
      performed_by: currentStaffName,
      details: { reason: reason || '' }
    }]);

    showSuccess('Stand released. It is now available for booking.');
    closeStandModal();
    refreshAll();
  } catch (err) {
    console.error('Release error:', err);
    showError('Failed to release stand: ' + err.message);
  }
}

// --------------------------------------------
// BOOKINGS TABLE
// --------------------------------------------
async function refreshBookingsTable() {
  var client = MarketUtils.getClient();
  if (!client) return;

  var tbody = document.getElementById('bookingsBody');
  var today = MarketUtils.todayIso();

  var { data, error } = await client
    .from('market_bookings')
    .select('*')
    .eq('booking_date', today)
    .order('booked_at', { ascending: false });

  if (error) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Error loading bookings.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No bookings for today.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(function(b) {
    var statusCls = 'status-' + b.status;
    var statusLabel = b.status === 'pending_payment' ? 'Pending'
                    : b.status === 'confirmed' ? 'Paid'
                    : b.status.charAt(0).toUpperCase() + b.status.slice(1);

    return '<tr>'
      + '<td><strong>' + b.stand_number + '</strong></td>'
      + '<td style="font-size:11px;">' + MarketUtils.escapeHtml(b.booking_reference) + '</td>'
      + '<td>' + MarketUtils.escapeHtml(b.customer_name) + '</td>'
      + '<td>' + MarketUtils.escapeHtml(b.customer_phone) + '</td>'
      + '<td>' + MarketUtils.formatMoney(b.amount_paid, b.currency) + '</td>'
      + '<td><span class="status-badge ' + statusCls + '">' + statusLabel + '</span></td>'
      + '<td>' + MarketUtils.formatTime(b.booked_at) + '</td>'
      + '<td>'
      +   '<button class="btn btn-primary btn-small" onclick="openStandModalFromTable(' + b.stand_number + ')">View</button>'
      + '</td>'
      + '</tr>';
  }).join('');
}

function openStandModalFromTable(standNumber) {
  var booking = todayBookings[standNumber];
  if (booking) openStandModal(standNumber, booking);
}

// --------------------------------------------
// PRICING
// --------------------------------------------
async function saveNewPrice() {
  var priceVal = parseFloat(document.getElementById('newPrice').value);
  var currency = document.getElementById('newCurrency').value;

  if (isNaN(priceVal) || priceVal < 0) {
    showError('Please enter a valid price.');
    return;
  }

  var client = MarketUtils.getClient();
  if (!client) return;

  if (!confirm('Set price to ' + currency + ' ' + priceVal.toFixed(2) + ' per stand per day?')) return;

  try {
    // Deactivate current prices
    await client
      .from('market_pricing')
      .update({ is_active: false })
      .eq('is_active', true);

    // Insert new active row
    var { error } = await client
      .from('market_pricing')
      .insert([{
        price_per_day: priceVal,
        currency: currency,
        effective_from: MarketUtils.todayIso(),
        is_active: true,
        updated_by: currentStaffName,
        updated_at: new Date().toISOString()
      }]);

    if (error) throw error;

    await client.from('market_audit_log').insert([{
      action: 'price_changed',
      performed_by: currentStaffName,
      details: { price: priceVal, currency: currency }
    }]);

    activePrice = { price_per_day: priceVal, currency: currency };
    updateStats();
    showSuccess('Price updated.');
    refreshPricingHistory();
  } catch (err) {
    console.error('Price save error:', err);
    showError('Failed to save price: ' + err.message);
  }
}

async function refreshPricingHistory() {
  var client = MarketUtils.getClient();
  if (!client) return;
  var tbody = document.getElementById('pricingHistoryBody');

  var { data, error } = await client
    .from('market_pricing')
    .select('*')
    .order('effective_from', { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No pricing history.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(function(p) {
    return '<tr>'
      + '<td><strong>' + Number(p.price_per_day).toFixed(2) + '</strong></td>'
      + '<td>' + MarketUtils.escapeHtml(p.currency) + '</td>'
      + '<td>' + MarketUtils.escapeHtml(p.effective_from) + '</td>'
      + '<td>' + (p.is_active ? '<span class="status-badge status-confirmed">Active</span>' : '<span class="status-badge status-released">Old</span>') + '</td>'
      + '<td>' + MarketUtils.escapeHtml(p.updated_by || '-') + '</td>'
      + '<td>' + (p.updated_at ? new Date(p.updated_at).toLocaleString() : '-') + '</td>'
      + '</tr>';
  }).join('');
}

// --------------------------------------------
// CSV EXPORT
// --------------------------------------------
function exportBookingsCsv() {
  var today = MarketUtils.todayIso();
  var rows = [['Stand', 'Reference', 'Customer', 'Phone', 'Email', 'Amount', 'Currency', 'Status', 'Booked At']];

  Object.keys(todayBookings).sort(function(a,b){return a-b;}).forEach(function(k) {
    var b = todayBookings[k];
    rows.push([
      b.stand_number,
      b.booking_reference,
      b.customer_name,
      b.customer_phone,
      b.customer_email || '',
      Number(b.amount_paid).toFixed(2),
      b.currency,
      b.status,
      b.booked_at || ''
    ]);
  });

  var csv = rows.map(function(r) {
    return r.map(function(c) {
      var s = String(c === null || c === undefined ? '' : c);
      if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  }).join('\n');

  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'market-bookings-' + today + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --------------------------------------------
// LOGOUT
// --------------------------------------------
function staffLogout() {
  var client = MarketUtils.getClient();
  if (client) client.auth.signOut();
  sessionStorage.removeItem('staffEmail');
  sessionStorage.removeItem('staffDisplayName');
  sessionStorage.removeItem('staffRole');
  sessionStorage.removeItem('staffUserId');
  window.location.href = 'index.html';
}

// --------------------------------------------
// FLASH
// --------------------------------------------
function showError(msg) {
  var el = document.getElementById('errorDisplay');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(function() { el.classList.add('hidden'); }, 8000);
}

function showSuccess(msg) {
  var el = document.getElementById('successDisplay');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(function() { el.classList.add('hidden'); }, 4000);
}

// --------------------------------------------
// GO
// --------------------------------------------
adminBoot();
