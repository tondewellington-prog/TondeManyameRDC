// ============================================
// MARKET ADMIN - COUNCIL SIDE
// ============================================

var SUPABASE_FUNCTIONS_URL = 'https://ocojsigqagaehlebubdw.supabase.co/functions/v1';
var SUPABASE_ANON_KEY = 'sb_publishable_njwmRaZK-bnzut7bZPDpNQ_0VolCv-C';

var currentStaffUser = sessionStorage.getItem('staffEmail');
var currentStaffName = sessionStorage.getItem('staffDisplayName');
var currentStaffRole = sessionStorage.getItem('staffRole') || 'building_inspector';

var todayBookings = {};
var activePrice = { price_per_day: 5.00, currency: 'USD', zwg_rate: null };
var realtimeBookingChannel = null;
var realtimeReportChannel = null;
var realtimeQuotaChannel = null;
var reportCount = 0;

// --------------------------------------------
// EDGE FUNCTION CALL HELPER
// Supabase's new gateway requires the "apikey"
// header, not "Authorization: Bearer".
// --------------------------------------------
async function callEdgeFunction(path, body) {
  var res = await fetch(SUPABASE_FUNCTIONS_URL + '/' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify(body || {})
  });
  return res;
}

// --------------------------------------------
// BOOT
// --------------------------------------------
async function adminBoot() {
  MarketUtils.initSupabase();
  MarketUtils.injectGridCSS();

  document.getElementById('todayLabel').textContent = MarketUtils.todayLong();

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

  bindTabs();
  setDefaultHistoryDates();

  await MarketUtils.expireOldBookings();

  activePrice = await MarketUtils.fetchActivePrice();
  updateRateBox();

  await refreshAll();

  realtimeBookingChannel = MarketUtils.subscribeToBookings(function() { refreshAll(); });
  realtimeReportChannel = MarketUtils.subscribeToReports(function() { refreshReportsTable(); refreshReportCountBadge(); });
  realtimeQuotaChannel = MarketUtils.subscribeToQuotas(function() { refreshQuotasTable(); });

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
      document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
      this.classList.add('active');
      var tab = this.getAttribute('data-tab');
      var panel = document.getElementById('panel-' + tab);
      if (panel) panel.classList.add('active');
    });
  });
}

function showAccessDenied(msg) {
  var el = document.getElementById('accessDenied');
  el.innerHTML = '<strong>Access Denied</strong><br>' + MarketUtils.escapeHtml(msg) +
    '<br><br><a href="index.html">Return to Dashboard</a>';
  el.classList.remove('hidden');
}

// --------------------------------------------
// REFRESH
// --------------------------------------------
async function refreshAll() {
  await refreshGrid();
  await refreshBookingsTable();
  await refreshPricingHistory();
  await refreshReportsTable();
  await refreshReportCountBadge();
  await refreshQuotasTable();
}

async function refreshGrid() {
  todayBookings = await MarketUtils.fetchTodayBookings();
  MarketUtils.renderMarketGrid('marketContainer', todayBookings, onStandClick);
  updateStats();
  await applyReportDotsToGrid();
}

async function applyReportDotsToGrid() {
  var counts = await MarketUtils.fetchOpenReportCounts();
  var cells = document.querySelectorAll('.market-stand');
  cells.forEach(function(cell) {
    var n = parseInt(cell.getAttribute('data-stand'), 10);
    if (counts[n]) {
      cell.classList.add('has-report');
    } else {
      cell.classList.remove('has-report');
    }
  });
}

function updateStats() {
  var totalStands = 100;
  var booked = 0, pending = 0, revenue = 0;
  for (var n = 1; n <= totalStands; n++) {
    var b = todayBookings[n];
    if (!b) continue;
    if (b.status === 'confirmed') { booked++; revenue += Number(b.amount_paid || 0); }
    else if (b.status === 'pending_payment') { pending++; }
  }
  document.getElementById('statAvailable').textContent = (totalStands - booked - pending);
  document.getElementById('statBooked').textContent = booked;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statRevenue').textContent = MarketUtils.formatMoney(revenue, 'USD');
}

// --------------------------------------------
// STAND MODAL
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
      + '<div class="modal-actions"><button class="btn btn-secondary" onclick="closeStandModal()">Close</button></div>';
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

  html += '<div class="info-row"><span class="label">Amount (USD)</span><span class="value">' + MarketUtils.formatMoney(booking.amount_paid, 'USD') + '</span></div>';

  if (booking.zwg_amount) {
    html += '<div class="info-row"><span class="label">Amount (ZWG)</span><span class="value">ZWG ' + Number(booking.zwg_amount).toFixed(2) + '</span></div>';
  }

  html += '<div class="info-row"><span class="label">Booked At</span><span class="value">' + MarketUtils.formatTime(booking.booked_at) + '</span></div>';

  if (booking.status === 'pending_payment' && booking.expires_at) {
    var remaining = Math.max(0, Math.round((new Date(booking.expires_at) - new Date()) / 60000));
    html += '<div class="info-row"><span class="label">Hold Expires</span><span class="value">' + remaining + ' min</span></div>';
  }

  if (booking.email_sent_at) {
    html += '<div class="info-row"><span class="label">Email Sent</span><span class="value">' + new Date(booking.email_sent_at).toLocaleString() + '</span></div>';
  }

  html += '<div class="modal-actions">';

  if (booking.status === 'pending_payment') {
    html += '<button class="btn btn-success" onclick="markAsPaid(\'' + booking.id + '\')">Mark as Paid & Send Email</button>';
    html += '<button class="btn btn-danger" onclick="releaseBooking(\'' + booking.id + '\')">Release Stand</button>';
  } else if (booking.status === 'confirmed') {
    if (!booking.email_sent_at) {
      html += '<button class="btn btn-success" onclick="resendEmail(\'' + booking.id + '\')">Resend Confirmation Email</button>';
    }
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
// MARK AS PAID + SEND EMAIL
// --------------------------------------------
async function markAsPaid(bookingId) {
  var client = MarketUtils.getClient();
  if (!client) return;

  if (!confirm('Mark this booking as paid? The customer will receive their confirmation email with QR code.')) return;

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

    try {
      var emailRes = await callEdgeFunction('send-booking-email', { booking_id: bookingId });
      console.log('Email function status:', emailRes.status);
      if (!emailRes.ok) {
        var text = await emailRes.text();
        console.warn('Email function response:', text);
      }
    } catch (e) {
      console.warn('Email call failed:', e);
    }

    showSuccess('Booking confirmed and confirmation email sent.');
    closeStandModal();
    refreshAll();
  } catch (err) {
    console.error('Mark paid error:', err);
    showError('Failed to confirm booking: ' + err.message);
  }
}

async function resendEmail(bookingId) {
  try {
    var res = await callEdgeFunction('send-booking-email', { booking_id: bookingId });
    if (!res.ok) throw new Error('Email function returned ' + res.status);
    showSuccess('Confirmation email resent.');
    closeStandModal();
    refreshAll();
  } catch (e) {
    showError('Failed to resend email: ' + e.message);
  }
}

// --------------------------------------------
// RELEASE
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

    showSuccess('Stand released.');
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
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Error loading bookings.</td></tr>';
    return;
  }
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No bookings for today.</td></tr>';
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
      + '<td>' + MarketUtils.escapeHtml(b.customer_email || '-') + '</td>'
      + '<td>' + MarketUtils.formatMoney(b.amount_paid, 'USD') + '</td>'
      + '<td><span class="status-badge ' + statusCls + '">' + statusLabel + '</span></td>'
      + '<td>' + MarketUtils.formatTime(b.booked_at) + '</td>'
      + '<td><button class="btn btn-primary btn-small" onclick="openStandModalFromTable(' + b.stand_number + ')">View</button></td>'
      + '</tr>';
  }).join('');
}

function openStandModalFromTable(standNumber) {
  var booking = todayBookings[standNumber];
  if (booking) openStandModal(standNumber, booking);
}

// --------------------------------------------
// REPORTS TABLE
// --------------------------------------------
async function refreshReportCountBadge() {
  var client = MarketUtils.getClient();
  if (!client) return;
  var badge = document.getElementById('reportCountBadge');
  var { count } = await client
    .from('market_reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open');
  reportCount = count || 0;
  if (badge) {
    if (reportCount > 0) { badge.textContent = reportCount; badge.classList.remove('hidden'); }
    else { badge.classList.add('hidden'); }
  }
}

async function refreshReportsTable() {
  var client = MarketUtils.getClient();
  if (!client) return;
  var tbody = document.getElementById('reportsBody');
  if (!tbody) return;

  var filterEl = document.getElementById('reportStatusFilter');
  var filter = filterEl ? filterEl.value : '';

  var q = client.from('market_reports').select('*').order('created_at', { ascending: false }).limit(200);
  if (filter) q = q.eq('status', filter);

  var { data, error } = await q;

  if (error) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Error loading reports.</td></tr>';
    return;
  }
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No reports found.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(function(r) {
    var statusColors = {
      'open': 'status-pending',
      'reviewed': 'status-inprogress',
      'resolved': 'status-confirmed',
      'dismissed': 'status-released'
    };
    var statusCls = statusColors[r.status] || 'status-pending';
    var details = r.details ? MarketUtils.escapeHtml(r.details) : '-';
    if (details.length > 50) details = details.substring(0, 50) + '...';

    return '<tr>'
      + '<td><strong>' + r.stand_number + '</strong></td>'
      + '<td>' + MarketUtils.escapeHtml(r.reason) + '</td>'
      + '<td>' + MarketUtils.escapeHtml(r.reported_by_name) + '</td>'
      + '<td>' + MarketUtils.escapeHtml(r.reported_by_phone) + '</td>'
      + '<td title="' + MarketUtils.escapeHtml(r.details || '') + '">' + details + '</td>'
      + '<td><span class="status-badge ' + statusCls + '">' + r.status.toUpperCase() + '</span></td>'
      + '<td>' + new Date(r.created_at).toLocaleString() + '</td>'
      + '<td><button class="btn btn-primary btn-small" onclick="viewReport(\'' + r.id + '\')">View</button></td>'
      + '</tr>';
  }).join('');
}

async function viewReport(reportId) {
  var client = MarketUtils.getClient();
  if (!client) return;

  var { data: r, error } = await client
    .from('market_reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (error || !r) { showError('Could not load report.'); return; }

  document.getElementById('reportModalTitle').textContent = 'Report - Stand ' + r.stand_number;

  var statusOptions = ['open', 'reviewed', 'resolved', 'dismissed'].map(function(s) {
    return '<option value="' + s + '"' + (r.status === s ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
  }).join('');

  document.getElementById('reportModalBody').innerHTML = ''
    + '<div class="info-row"><span class="label">Stand</span><span class="value">' + r.stand_number + '</span></div>'
    + '<div class="info-row"><span class="label">Reason</span><span class="value">' + MarketUtils.escapeHtml(r.reason) + '</span></div>'
    + '<div class="info-row"><span class="label">Reported By</span><span class="value">' + MarketUtils.escapeHtml(r.reported_by_name) + '</span></div>'
    + '<div class="info-row"><span class="label">Phone</span><span class="value">' + MarketUtils.escapeHtml(r.reported_by_phone) + '</span></div>'
    + '<div class="info-row"><span class="label">Submitted</span><span class="value">' + new Date(r.created_at).toLocaleString() + '</span></div>'
    + (r.details
        ? '<div style="margin-top:12px;"><div style="font-weight:bold;color:#1e3c72;font-size:13px;margin-bottom:6px;">Details</div>'
          + '<div style="background:#f8f9fa;border-radius:8px;padding:12px;font-size:13px;color:#333;white-space:pre-wrap;">' + MarketUtils.escapeHtml(r.details) + '</div></div>'
        : '')
    + '<div style="margin-top:16px;"><label style="display:block;font-weight:600;margin-bottom:6px;color:#333;font-size:13px;">Status</label>'
    + '<select id="reportStatusSelect" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">' + statusOptions + '</select></div>'
    + '<div style="margin-top:12px;"><label style="display:block;font-weight:600;margin-bottom:6px;color:#333;font-size:13px;">Admin Notes (optional)</label>'
    + '<textarea id="reportAdminNotes" rows="3" style="width:100%;padding:11px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;" placeholder="Notes visible to council staff only">' + MarketUtils.escapeHtml(r.admin_notes || '') + '</textarea></div>'
    + '<div class="modal-actions">'
    +   '<button class="btn btn-primary" onclick="saveReportUpdate(\'' + r.id + '\')">Save Update</button>'
    +   '<button class="btn btn-secondary" onclick="closeReportModal()">Close</button>'
    + '</div>';

  document.getElementById('reportModal').classList.add('show');
}

function closeReportModal() {
  document.getElementById('reportModal').classList.remove('show');
}

async function saveReportUpdate(reportId) {
  var client = MarketUtils.getClient();
  if (!client) return;

  var status = document.getElementById('reportStatusSelect').value;
  var notes = document.getElementById('reportAdminNotes').value.trim();

  try {
    var { error } = await client
      .from('market_reports')
      .update({
        status: status,
        admin_notes: notes || null,
        reviewed_by: currentStaffName,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (error) throw error;

    await client.from('market_audit_log').insert([{
      action: 'report_updated',
      performed_by: currentStaffName,
      details: { report_id: reportId, status: status }
    }]);

    showSuccess('Report updated.');
    closeReportModal();
    refreshReportsTable();
    refreshReportCountBadge();
    applyReportDotsToGrid();
  } catch (err) {
    console.error('Update report error:', err);
    showError('Failed to update report: ' + err.message);
  }
}

// --------------------------------------------
// QUOTAS
// --------------------------------------------
async function refreshQuotasTable() {
  var client = MarketUtils.getClient();
  if (!client) return;
  var tbody = document.getElementById('quotasBody');
  if (!tbody) return;

  var { data, error } = await client
    .from('market_quotas')
    .select('*')
    .order('approved_at', { ascending: false })
    .limit(200);

  if (error) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Error loading quotas.</td></tr>';
    return;
  }
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No quotas yet.</td></tr>';
    return;
  }

  var today = MarketUtils.todayIso();

  tbody.innerHTML = data.map(function(q) {
    var active = !q.revoked && q.valid_from <= today && q.valid_to >= today;
    var statusCls = q.revoked ? 'status-released' : (active ? 'status-confirmed' : 'status-pending');
    var statusLabel = q.revoked ? 'Revoked' : (active ? 'Active' : 'Inactive');
    var emailDisplay = q.email ? MarketUtils.escapeHtml(q.email) : '-';

    return '<tr>'
      + '<td><strong>' + MarketUtils.escapeHtml(q.farmer_name) + '</strong></td>'
      + '<td>' + MarketUtils.escapeHtml(q.phone) + '</td>'
      + '<td>' + emailDisplay + '</td>'
      + '<td>' + q.max_stands_per_day + '</td>'
      + '<td>' + q.valid_from + '</td>'
      + '<td>' + q.valid_to + '</td>'
      + '<td><span class="status-badge ' + statusCls + '">' + statusLabel + '</span></td>'
      + '<td>' + MarketUtils.escapeHtml(q.approved_by || '-') + '</td>'
      + '<td>'
      +   (q.revoked
          ? '<button class="btn btn-primary btn-small" onclick="viewQuota(\'' + q.id + '\')">View</button>'
          : '<button class="btn btn-primary btn-small" onclick="viewQuota(\'' + q.id + '\')">Edit</button> '
            + '<button class="btn btn-danger btn-small" onclick="revokeQuota(\'' + q.id + '\')">Revoke</button>')
      + '</td>'
      + '</tr>';
  }).join('');
}

function openQuotaModal(quota) {
  var isEdit = !!quota;
  document.getElementById('quotaModalTitle').textContent = isEdit ? 'Edit Quota' : 'Create Quota';

  var q = quota || {};
  var today = MarketUtils.todayIso();
  var in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  document.getElementById('quotaModalBody').innerHTML = ''
    + '<div class="form-group"><label>Farmer Name *</label><input type="text" id="qFarmerName" value="' + MarketUtils.escapeHtml(q.farmer_name || '') + '" placeholder="Full name"></div>'
    + '<div class="form-group"><label>Phone *</label><input type="tel" id="qPhone" value="' + MarketUtils.escapeHtml(q.phone || '') + '" placeholder="e.g., 0771 234 567"></div>'
    + '<div class="form-group"><label>Email</label><input type="email" id="qEmail" value="' + MarketUtils.escapeHtml(q.email || '') + '" placeholder="Optional"></div>'
    + '<div class="form-group"><label>Maximum Stands Per Day *</label><input type="number" id="qMax" min="1" max="20" value="' + (q.max_stands_per_day || 2) + '"></div>'
    + '<div class="form-group"><label>Valid From *</label><input type="date" id="qFrom" value="' + (q.valid_from || today) + '"></div>'
    + '<div class="form-group"><label>Valid To *</label><input type="date" id="qTo" value="' + (q.valid_to || in30) + '"></div>'
    + '<div class="form-group"><label>Reason / Notes</label><textarea id="qReason" rows="2" placeholder="Why is this quota being approved?">' + MarketUtils.escapeHtml(q.reason || '') + '</textarea></div>'
    + '<div id="quotaError" class="error hidden" style="margin-top:0;margin-bottom:14px;"></div>'
    + '<div class="modal-actions">'
    +   '<button class="btn btn-success" onclick="saveQuota(' + (isEdit ? "'" + q.id + "'" : 'null') + ')">Save</button>'
    +   '<button class="btn btn-secondary" onclick="closeQuotaModal()">Cancel</button>'
    + '</div>';

  document.getElementById('quotaModal').classList.add('show');
}

function closeQuotaModal() {
  document.getElementById('quotaModal').classList.remove('show');
}

async function saveQuota(quotaId) {
  var client = MarketUtils.getClient();
  if (!client) return;

  var farmerName = document.getElementById('qFarmerName').value.trim();
  var phone = document.getElementById('qPhone').value.trim();
  var email = document.getElementById('qEmail').value.trim();
  var maxStands = parseInt(document.getElementById('qMax').value, 10);
  var validFrom = document.getElementById('qFrom').value;
  var validTo = document.getElementById('qTo').value;
  var reason = document.getElementById('qReason').value.trim();
  var errBox = document.getElementById('quotaError');

  errBox.classList.add('hidden'); errBox.textContent = '';

  if (!farmerName) { errBox.textContent = 'Farmer name is required.'; errBox.classList.remove('hidden'); return; }
  if (!phone) { errBox.textContent = 'Phone is required.'; errBox.classList.remove('hidden'); return; }
  if (!maxStands || maxStands < 1) { errBox.textContent = 'Maximum stands must be at least 1.'; errBox.classList.remove('hidden'); return; }
  if (!validFrom || !validTo) { errBox.textContent = 'Valid From and Valid To are required.'; errBox.classList.remove('hidden'); return; }
  if (validTo < validFrom) { errBox.textContent = 'Valid To must be on or after Valid From.'; errBox.classList.remove('hidden'); return; }

  var payload = {
    farmer_name: farmerName,
    phone: phone,
    email: email || null,
    max_stands_per_day: maxStands,
    valid_from: validFrom,
    valid_to: validTo,
    reason: reason || null,
    approved_by: currentStaffName
  };

  try {
    if (quotaId) {
      var { error } = await client.from('market_quotas').update(payload).eq('id', quotaId);
      if (error) throw error;
      await client.from('market_audit_log').insert([{
        action: 'quota_created',
        performed_by: currentStaffName,
        details: { quota_id: quotaId, update: true, farmer: farmerName, max_stands: maxStands }
      }]);
      showSuccess('Quota updated.');
    } else {
      var { data, error } = await client.from('market_quotas').insert([payload]).select().single();
      if (error) throw error;
      await client.from('market_audit_log').insert([{
        action: 'quota_created',
        performed_by: currentStaffName,
        details: { quota_id: data.id, farmer: farmerName, max_stands: maxStands }
      }]);
      showSuccess('Quota created.');
    }

    closeQuotaModal();
    refreshQuotasTable();
  } catch (err) {
    console.error('Save quota error:', err);
    errBox.textContent = err.message || 'Could not save quota.';
    errBox.classList.remove('hidden');
  }
}

async function viewQuota(quotaId) {
  var client = MarketUtils.getClient();
  if (!client) return;
  var { data } = await client.from('market_quotas').select('*').eq('id', quotaId).single();
  if (data) openQuotaModal(data);
}

async function revokeQuota(quotaId) {
  var client = MarketUtils.getClient();
  if (!client) return;
  var reason = prompt('Reason for revoking this quota (optional):');
  if (reason === null) return;
  if (!confirm('Revoke this quota? The farmer will be limited to one stand per day from now on.')) return;

  try {
    var { error } = await client.from('market_quotas').update({
      revoked: true,
      revoked_by: currentStaffName,
      revoked_at: new Date().toISOString(),
      revoke_reason: reason || null
    }).eq('id', quotaId);
    if (error) throw error;

    await client.from('market_audit_log').insert([{
      action: 'quota_revoked',
      performed_by: currentStaffName,
      details: { quota_id: quotaId, reason: reason || '' }
    }]);

    showSuccess('Quota revoked.');
    refreshQuotasTable();
  } catch (err) {
    showError('Failed to revoke quota: ' + err.message);
  }
}

// --------------------------------------------
// PRICING
// --------------------------------------------
function updateRateBox() {
  var usdEl = document.getElementById('rateUsd');
  var rateEl = document.getElementById('rateRate');
  var zwgEl = document.getElementById('rateZwg');
  var updEl = document.getElementById('rateUpdated');
  if (!usdEl) return;

  usdEl.textContent = MarketUtils.formatMoney(activePrice.price_per_day, 'USD');

  if (activePrice.zwg_rate) {
    rateEl.textContent = Number(activePrice.zwg_rate).toFixed(4) + ' ZWG per USD';
    var zwg = MarketUtils.computeZwg(activePrice.price_per_day, activePrice.zwg_rate);
    zwgEl.textContent = 'ZWG ' + Number(zwg).toFixed(2);
  } else {
    rateEl.textContent = 'Not yet set';
    zwgEl.textContent = 'Not yet set';
  }

  updEl.textContent = activePrice.zwg_rate_updated_at
    ? new Date(activePrice.zwg_rate_updated_at).toLocaleString()
    : 'Never';

  var priceInput = document.getElementById('newPrice');
  if (priceInput) priceInput.value = Number(activePrice.price_per_day).toFixed(2);
}

async function saveNewPrice() {
  var priceVal = parseFloat(document.getElementById('newPrice').value);
  if (isNaN(priceVal) || priceVal < 0) { showError('Please enter a valid price.'); return; }

  var client = MarketUtils.getClient();
  if (!client) return;

  if (!confirm('Set price to USD ' + priceVal.toFixed(2) + ' per stand per day?')) return;

  try {
    await client.from('market_pricing').update({ is_active: false }).eq('is_active', true);
    var { error } = await client.from('market_pricing').insert([{
      price_per_day: priceVal,
      currency: 'USD',
      effective_from: MarketUtils.todayIso(),
      is_active: true,
      updated_by: currentStaffName,
      updated_at: new Date().toISOString(),
      zwg_rate: activePrice.zwg_rate || null,
      zwg_rate_updated_at: activePrice.zwg_rate_updated_at || null,
      zwg_rate_source: activePrice.zwg_rate_source || null
    }]);
    if (error) throw error;

    await client.from('market_audit_log').insert([{
      action: 'price_changed',
      performed_by: currentStaffName,
      details: { price_usd: priceVal }
    }]);

    activePrice = await MarketUtils.fetchActivePrice();
    updateRateBox();
    updateStats();
    refreshPricingHistory();
    showSuccess('Price updated.');
  } catch (err) {
    console.error('Price save error:', err);
    showError('Failed to save price: ' + err.message);
  }
}

async function refreshZwgRate() {
  try {
    var res = await callEdgeFunction('fetch-zwg-rate', {});
    var data;
    try { data = await res.json(); } catch (e) { data = {}; }
    console.log('fetch-zwg-rate response:', data, 'status:', res.status);
    if (!res.ok || !data.success) {
      throw new Error(data.error || ('HTTP ' + res.status));
    }
    activePrice = await MarketUtils.fetchActivePrice();
    updateRateBox();
    showSuccess('ZWG rate updated to ' + Number(data.rate).toFixed(4) + ' per USD.');
  } catch (err) {
    console.error('ZWG refresh error:', err);
    showError('Could not refresh ZWG rate: ' + err.message);
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
      + '<td><strong>USD ' + Number(p.price_per_day).toFixed(2) + '</strong></td>'
      + '<td>' + MarketUtils.escapeHtml(p.effective_from) + '</td>'
      + '<td>' + (p.is_active ? '<span class="status-badge status-confirmed">Active</span>' : '<span class="status-badge status-released">Old</span>') + '</td>'
      + '<td>' + (p.zwg_rate ? Number(p.zwg_rate).toFixed(4) : '-') + '</td>'
      + '<td>' + MarketUtils.escapeHtml(p.updated_by || '-') + '</td>'
      + '<td>' + (p.updated_at ? new Date(p.updated_at).toLocaleString() : '-') + '</td>'
      + '</tr>';
  }).join('');
}

// --------------------------------------------
// HISTORY
// --------------------------------------------
function setDefaultHistoryDates() {
  var today = MarketUtils.todayIso();
  var fromEl = document.getElementById('historyFrom');
  var toEl = document.getElementById('historyTo');
  if (fromEl) fromEl.value = today;
  if (toEl) toEl.value = today;

  var auditFrom = document.getElementById('auditFrom');
  var auditTo = document.getElementById('auditTo');
  if (auditFrom) auditFrom.value = today;
  if (auditTo) auditTo.value = today;
}

function quickHistory(range) {
  var today = new Date();
  var from, to;

  if (range === 'today') { from = to = today; }
  else if (range === 'yesterday') { var y = new Date(today.getTime() - 86400000); from = to = y; }
  else if (range === 'week') {
    var dayOfWeek = today.getDay() || 7;
    var monday = new Date(today.getTime() - (dayOfWeek - 1) * 86400000);
    from = monday; to = today;
  }
  else if (range === 'month') {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
    to = today;
  }
  else if (range === 'lastmonth') {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    to = new Date(today.getFullYear(), today.getMonth(), 0);
  }

  document.getElementById('historyFrom').value = from.toISOString().split('T')[0];
  document.getElementById('historyTo').value = to.toISOString().split('T')[0];
  loadHistory();
}

async function loadHistory() {
  var client = MarketUtils.getClient();
  if (!client) return;
  var fromDate = document.getElementById('historyFrom').value;
  var toDate = document.getElementById('historyTo').value;

  if (!fromDate || !toDate) { showError('Please select both From and To dates.'); return; }

  var fromIso = fromDate + 'T00:00:00.000Z';
  var toIso = toDate + 'T23:59:59.999Z';

  var content = document.getElementById('historyContent');
  content.innerHTML = '<div class="loading">Loading history...</div>';

  try {
    var [bookings, reports, audits] = await Promise.all([
      client.from('market_bookings').select('*')
        .gte('booking_date', fromDate).lte('booking_date', toDate)
        .order('booking_date', { ascending: false }),
      client.from('market_reports').select('*')
        .gte('created_at', fromIso).lte('created_at', toIso)
        .order('created_at', { ascending: false }),
      client.from('market_audit_log').select('*')
        .gte('created_at', fromIso).lte('created_at', toIso)
        .order('created_at', { ascending: false })
    ]);

    var bookingsArr = bookings.data || [];
    var reportsArr = reports.data || [];
    var auditsArr = audits.data || [];

    var totalRevenue = 0;
    bookingsArr.forEach(function(b) {
      if (b.status === 'confirmed') totalRevenue += Number(b.amount_paid || 0);
    });

    content.innerHTML = ''
      + '<div class="rate-box">'
      +   '<div class="row"><span class="label">Period:</span><span class="value">' + fromDate + ' to ' + toDate + '</span></div>'
      +   '<div class="row"><span class="label">Bookings:</span><span class="value">' + bookingsArr.length + '</span></div>'
      +   '<div class="row"><span class="label">Reports:</span><span class="value">' + reportsArr.length + '</span></div>'
      +   '<div class="row"><span class="label">Audit events:</span><span class="value">' + auditsArr.length + '</span></div>'
      +   '<div class="row"><span class="label">Confirmed revenue (USD):</span><span class="value">' + MarketUtils.formatMoney(totalRevenue, 'USD') + '</span></div>'
      + '</div>'
      + '<h3 class="section-title">Bookings (' + bookingsArr.length + ')</h3>'
      + renderHistoryTable(
          ['Date','Stand','Reference','Customer','Phone','USD','ZWG','Status'],
          bookingsArr.map(function(b) {
            return [b.booking_date, b.stand_number, b.booking_reference, b.customer_name, b.customer_phone,
                    Number(b.amount_paid).toFixed(2), b.zwg_amount ? Number(b.zwg_amount).toFixed(2) : '-', b.status];
          })
        )
      + '<h3 class="section-title">Reports (' + reportsArr.length + ')</h3>'
      + renderHistoryTable(
          ['Stand','Reason','Reported By','Phone','Status','Submitted'],
          reportsArr.map(function(r) {
            return [r.stand_number, r.reason, r.reported_by_name, r.reported_by_phone, r.status, new Date(r.created_at).toLocaleString()];
          })
        )
      + '<h3 class="section-title">Audit Events (' + auditsArr.length + ')</h3>'
      + renderHistoryTable(
          ['Timestamp','Action','Stand','Performed By'],
          auditsArr.map(function(a) {
            return [new Date(a.created_at).toLocaleString(), a.action, a.stand_number || '-', a.performed_by || '-'];
          })
        );

  } catch (err) {
    console.error('History error:', err);
    content.innerHTML = '<div class="error">Error loading history: ' + err.message + '</div>';
  }
}

function renderHistoryTable(headers, rows) {
  if (!rows || rows.length === 0) {
    return '<div class="loading">No records in this period.</div>';
  }
  var html = '<div style="overflow-x:auto;"><table><thead><tr>';
  headers.forEach(function(h) { html += '<th>' + h + '</th>'; });
  html += '</tr></thead><tbody>';
  rows.forEach(function(r) {
    html += '<tr>';
    r.forEach(function(c) { html += '<td>' + MarketUtils.escapeHtml(String(c)) + '</td>'; });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

async function downloadHistory(format) {
  var fromDate = document.getElementById('historyFrom').value;
  var toDate = document.getElementById('historyTo').value;
  if (!fromDate || !toDate) { showError('Please select both From and To dates.'); return; }

  try {
    var res = await callEdgeFunction('export-history', { from: fromDate, to: toDate, format: format });

    if (!res.ok) {
      var text = await res.text();
      throw new Error('Export failed: ' + text);
    }

    var blob = await res.blob();
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'market-history-' + fromDate + '_to_' + toDate + '.' + format;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showSuccess('Download started.');
  } catch (err) {
    console.error('Download error:', err);
    showError('Could not download: ' + err.message);
  }
}

// --------------------------------------------
// AUDIT
// --------------------------------------------
async function loadAudit() {
  await refreshAudit();
}

async function refreshAudit() {
  var client = MarketUtils.getClient();
  if (!client) return;
  var tbody = document.getElementById('auditBody');

  var fromDate = document.getElementById('auditFrom').value;
  var toDate = document.getElementById('auditTo').value;
  var action = document.getElementById('auditActionFilter').value;

  var q = client.from('market_audit_log').select('*').order('created_at', { ascending: false }).limit(500);
  if (fromDate) q = q.gte('created_at', fromDate + 'T00:00:00.000Z');
  if (toDate) q = q.lte('created_at', toDate + 'T23:59:59.999Z');
  if (action) q = q.eq('action', action);

  var { data, error } = await q;

  if (error) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Error loading audit.</td></tr>';
    return;
  }
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No audit events in this range.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(function(a) {
    var details = a.details ? JSON.stringify(a.details) : '-';
    if (details.length > 80) details = details.substring(0, 80) + '...';
    return '<tr>'
      + '<td>' + new Date(a.created_at).toLocaleString() + '</td>'
      + '<td><strong>' + MarketUtils.escapeHtml(a.action) + '</strong></td>'
      + '<td>' + (a.stand_number || '-') + '</td>'
      + '<td>' + MarketUtils.escapeHtml(a.performed_by || '-') + '</td>'
      + '<td title="' + MarketUtils.escapeHtml(JSON.stringify(a.details || {})) + '" style="font-size:11px;color:#666;">' + MarketUtils.escapeHtml(details) + '</td>'
      + '</tr>';
  }).join('');
}

// --------------------------------------------
// TODAY CSV EXPORT
// --------------------------------------------
function exportBookingsCsv() {
  var today = MarketUtils.todayIso();
  var rows = [['Stand','Reference','Customer','Phone','Email','USD','ZWG','Status','Booked At']];
  Object.keys(todayBookings).sort(function(a,b){return a-b;}).forEach(function(k) {
    var b = todayBookings[k];
    rows.push([
      b.stand_number, b.booking_reference, b.customer_name, b.customer_phone, b.customer_email || '',
      Number(b.amount_paid).toFixed(2), b.zwg_amount ? Number(b.zwg_amount).toFixed(2) : '',
      b.status, b.booked_at || ''
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

  var blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
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
