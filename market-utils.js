// ============================================
// MARKET BOOKING - SHARED UTILITIES
// ============================================

var SUPABASE_URL = 'https://ocojsigqagaehlebubdw.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_njwmRaZK-bnzut7bZPDpNQ_0VolCv-C';

var MarketUtils = (function() {
  'use strict';

  var client = null;

  // --------------------------------------------
  // INIT
  // --------------------------------------------
  function initSupabase() {
    if (!client) {
      var provider = window.supabase || (window.supabaseJS ? window.supabaseJS : null);
      if (provider && provider.createClient) {
        client = provider.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      }
    }
    return client;
  }

  function getClient() { return client; }

  // --------------------------------------------
  // LAYOUT HELPERS
  // --------------------------------------------
  function getColumnForStand(n) {
    if (n >= 1 && n <= 25) return 1;
    if (n >= 26 && n <= 50) return 2;
    if (n >= 51 && n <= 75) return 3;
    if (n >= 76 && n <= 100) return 4;
    return null;
  }

  function getRowForStand(n) {
    var col = getColumnForStand(n);
    if (!col) return null;
    return n - ((col - 1) * 25);
  }

  function getFacingForColumn(col) {
    if (col === 1 || col === 3) return 'right';
    return 'left';
  }

  function getStandRangeForColumn(col) {
    return { start: (col - 1) * 25 + 1, end: col * 25 };
  }

  // --------------------------------------------
  // HTML ESCAPE
  // --------------------------------------------
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      if (m === '"') return '&quot;';
      if (m === "'") return '&#39;';
      return m;
    });
  }

  // --------------------------------------------
  // FORMAT HELPERS
  // --------------------------------------------
  function formatMoney(amount, currency) {
    var n = Number(amount || 0).toFixed(2);
    return (currency || 'USD') + ' ' + n;
  }

  function formatTime(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function todayIso() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function todayLong() {
    return new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  // --------------------------------------------
  // BOOKING REFERENCE
  // --------------------------------------------
  function generateBookingReference() {
    var d = new Date();
    var ymd = d.getFullYear().toString() +
              String(d.getMonth() + 1).padStart(2, '0') +
              String(d.getDate()).padStart(2, '0');
    var rand = Math.floor(Math.random() * 9000) + 1000;
    return 'MKT-' + ymd + '-' + rand;
  }

  // --------------------------------------------
  // EXPIRE OLD HOLDS
  // --------------------------------------------
  async function expireOldBookings() {
    if (!client) return;
    try {
      var nowIso = new Date().toISOString();
      var { data, error } = await client
        .from('market_bookings')
        .update({ status: 'expired', paynow_status: 'expired' })
        .eq('status', 'pending_payment')
        .lt('expires_at', nowIso)
        .select('id');
      if (error) {
        console.warn('expireOldBookings error:', error.message);
      } else if (data && data.length > 0) {
        console.log('Expired ' + data.length + ' stale hold(s)');
      }
    } catch (e) {
      console.warn('expireOldBookings exception:', e);
    }
  }

  // --------------------------------------------
  // FETCH TODAY'S BOOKINGS
  // --------------------------------------------
  async function fetchTodayBookings() {
    if (!client) return {};
    var today = todayIso();
    var { data, error } = await client
      .from('market_bookings')
      .select('*')
      .eq('booking_date', today)
      .in('status', ['pending_payment', 'confirmed']);

    if (error) {
      console.error('fetchTodayBookings error:', error);
      return {};
    }
    var map = {};
    (data || []).forEach(function(b) { map[b.stand_number] = b; });
    return map;
  }

  // --------------------------------------------
  // FETCH ACTIVE PRICE (includes ZWG rate)
  // --------------------------------------------
  async function fetchActivePrice() {
    if (!client) return { price_per_day: 5.00, currency: 'USD', zwg_rate: null };
    var { data, error } = await client
      .from('market_pricing')
      .select('*')
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) {
      return { price_per_day: 5.00, currency: 'USD', zwg_rate: null };
    }
    return data[0];
  }

  // --------------------------------------------
  // COMPUTE ZWG AMOUNT FROM USD + RATE
  // --------------------------------------------
  function computeZwg(usdAmount, rate) {
    if (!rate || rate <= 0) return null;
    return Number((Number(usdAmount) * Number(rate)).toFixed(2));
  }

  // --------------------------------------------
  // COUNT ACTIVE BOOKINGS FOR A CUSTOMER
  // Used for the one-stand-per-day rule client side.
  // Returns count of active (pending/confirmed) bookings for the phone or email
  // on the given date (or today), excluding an optional booking id.
  // --------------------------------------------
  async function countActiveBookingsForCustomer(phone, email, dateIso, excludeId) {
    if (!client) return 0;
    var day = dateIso || todayIso();
    var q = client
      .from('market_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('booking_date', day)
      .in('status', ['pending_payment', 'confirmed']);

    if (excludeId) q = q.neq('id', excludeId);

    // Match phone OR email
    if (phone && email) {
      q = q.or('customer_phone.eq.' + phone + ',customer_email.eq.' + email);
    } else if (phone) {
      q = q.eq('customer_phone', phone);
    } else if (email) {
      q = q.eq('customer_email', email);
    } else {
      return 0;
    }

    var { count, error } = await q;
    if (error) {
      console.warn('countActiveBookingsForCustomer error:', error.message);
      return 0;
    }
    return count || 0;
  }

  // --------------------------------------------
  // FIND ACTIVE QUOTA FOR A CUSTOMER
  // Returns the quota row if a valid quota exists
  // for this phone or email covering the given date.
  // --------------------------------------------
  async function findActiveQuota(phone, email, dateIso) {
    if (!client) return null;
    var day = dateIso || todayIso();
    var q = client
      .from('market_quotas')
      .select('*')
      .eq('revoked', false)
      .lte('valid_from', day)
      .gte('valid_to', day);

    if (phone && email) {
      q = q.or('phone.eq.' + phone + ',email.eq.' + email);
    } else if (phone) {
      q = q.eq('phone', phone);
    } else if (email) {
      q = q.eq('email', email);
    } else {
      return null;
    }

    var { data, error } = await q.limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0];
  }

  // --------------------------------------------
  // FETCH OPEN REPORT COUNTS BY STAND
  // --------------------------------------------
  async function fetchOpenReportCounts() {
    if (!client) return {};
    var { data, error } = await client
      .from('market_reports')
      .select('stand_number')
      .eq('status', 'open');
    if (error) {
      console.error('fetchOpenReportCounts error:', error);
      return {};
    }
    var map = {};
    (data || []).forEach(function(r) {
      map[r.stand_number] = (map[r.stand_number] || 0) + 1;
    });
    return map;
  }

  // --------------------------------------------
  // FETCH ALL REPORTS FOR A STAND
  // --------------------------------------------
  async function fetchReportsForStand(standNumber) {
    if (!client) return [];
    var { data, error } = await client
      .from('market_reports')
      .select('*')
      .eq('stand_number', standNumber)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('fetchReportsForStand error:', error);
      return [];
    }
    return data || [];
  }

  // --------------------------------------------
  // SUBMIT REPORT
  // --------------------------------------------
  async function submitReport(payload) {
    if (!client) throw new Error('No database connection');
    var { data, error } = await client
      .from('market_reports')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // --------------------------------------------
  // RENDER MARKET GRID
  // --------------------------------------------
  function renderMarketGrid(containerId, bookingsMap, onStandClick, options) {
    var opts = options || {};
    var container = document.getElementById(containerId);
    if (!container) return;
    var map = bookingsMap || {};

    var html = '<div class="market-grid">';
    html += renderColumn(1, map, opts);
    html += '<div class="market-aisle"><span>AISLE</span></div>';
    html += renderColumn(2, map, opts);
    html += '<div class="market-wall" title="Central back wall"></div>';
    html += renderColumn(3, map, opts);
    html += '<div class="market-aisle"><span>AISLE</span></div>';
    html += renderColumn(4, map, opts);
    html += '</div>';
    container.innerHTML = html;

    var standEls = container.querySelectorAll('.market-stand');
    standEls.forEach(function(el) {
      el.addEventListener('click', function() {
        var n = parseInt(this.getAttribute('data-stand'), 10);
        var booking = map[n] || null;
        if (typeof onStandClick === 'function') {
          onStandClick(n, booking, this);
        }
      });
    });
  }

  function renderColumn(col, map, opts) {
    var range = getStandRangeForColumn(col);
    var facing = getFacingForColumn(col);
    var html = '<div class="market-column" data-column="' + col + '" data-facing="' + facing + '">';
    for (var n = range.start; n <= range.end; n++) {
      html += renderStand(n, map[n], facing);
    }
    html += '</div>';
    return html;
  }

  function renderStand(n, booking, facing) {
    var status = booking ? booking.status : 'available';
    var cls = 'market-stand stand-' + status + ' face-' + facing;
    var title = 'Stand ' + n;

    if (booking) {
      if (status === 'confirmed') {
        title += ' - BOOKED';
        if (booking.customer_name) title += ' by ' + booking.customer_name;
      } else if (status === 'pending_payment') {
        title += ' - Payment in progress';
      }
    } else {
      title += ' - Available';
    }

    return '<div class="' + cls + '" data-stand="' + n + '" title="' + escapeHtml(title) + '">'
         + '<span class="stand-number">' + n + '</span>'
         + '</div>';
  }

  // --------------------------------------------
  // GRID CSS (injected once per page)
  // --------------------------------------------
  function injectGridCSS() {
    if (document.getElementById('market-grid-css')) return;
    var css = ''
    + '.market-grid{display:flex;align-items:flex-start;justify-content:center;gap:0;padding:20px;background:#f8f9fa;border-radius:12px;overflow-x:auto;}'
    + '.market-column{display:flex;flex-direction:column;gap:2px;flex:0 0 auto;}'
    + '.market-stand{width:90px;height:34px;display:flex;align-items:center;justify-content:center;border:1px solid #333;border-radius:3px;font-size:12px;font-weight:bold;cursor:pointer;user-select:none;transition:transform .1s,box-shadow .1s;background:white;position:relative;}'
    + '.market-stand:hover{transform:scale(1.06);box-shadow:0 2px 8px rgba(0,0,0,0.25);z-index:2;}'
    + '.market-stand .stand-number{pointer-events:none;}'
    + '.market-stand.face-right{border-right-width:5px;border-right-color:#28a745;}'
    + '.market-stand.face-left{border-left-width:5px;border-left-color:#28a745;}'
    + '.market-stand.stand-confirmed{background:#dc3545;color:white;border-color:#a71d2a;}'
    + '.market-stand.stand-confirmed.face-right{border-right-color:#7d0a17;}'
    + '.market-stand.stand-confirmed.face-left{border-left-color:#7d0a17;}'
    + '.market-stand.stand-pending_payment{background:#ffc107;color:#333;border-color:#c79100;}'
    + '.market-stand.stand-pending_payment.face-right{border-right-color:#8a6500;}'
    + '.market-stand.stand-pending_payment.face-left{border-left-color:#8a6500;}'
    + '.market-stand.stand-available{background:#e7f6ea;}'
    + '.market-stand.stand-available:hover{background:#c8ebd0;}'
    + '.market-stand.stand-expired,.market-stand.stand-released{background:#e7f6ea;}'
    + '.market-stand.has-report::after{content:"";position:absolute;top:-4px;right:-4px;width:12px;height:12px;border-radius:50%;background:#fd7e14;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);}'
    + '.market-aisle{flex:0 0 34px;align-self:stretch;display:flex;align-items:center;justify-content:center;background:#e9ecef;border-radius:4px;margin:0 6px;}'
    + '.market-aisle span{writing-mode:vertical-rl;transform:rotate(180deg);font-size:10px;font-weight:bold;color:#6c757d;letter-spacing:3px;}'
    + '.market-wall{flex:0 0 14px;align-self:stretch;background:repeating-linear-gradient(45deg,#343a40,#343a40 4px,#495057 4px,#495057 8px);border-radius:2px;margin:0 2px;}'
    + '.market-legend{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;margin-top:15px;font-size:13px;}'
    + '.market-legend-item{display:flex;align-items:center;gap:6px;}'
    + '.market-legend-swatch{width:20px;height:20px;border-radius:3px;border:1px solid #333;}'
    + '@media (max-width:768px){.market-stand{width:64px;height:28px;font-size:10px;}.market-aisle{flex:0 0 20px;margin:0 3px;}.market-aisle span{font-size:8px;letter-spacing:1px;}.market-wall{flex:0 0 8px;}.market-grid{padding:10px;justify-content:flex-start;}}';

    var style = document.createElement('style');
    style.id = 'market-grid-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // --------------------------------------------
  // REAL-TIME SUBSCRIPTIONS
  // --------------------------------------------
  function subscribeToBookings(callback) {
    if (!client) return null;
    return client
      .channel('market-bookings-realtime')
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'market_bookings' },
          function() { if (typeof callback === 'function') callback(); })
      .subscribe();
  }

  function subscribeToReports(callback) {
    if (!client) return null;
    return client
      .channel('market-reports-realtime')
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'market_reports' },
          function() { if (typeof callback === 'function') callback(); })
      .subscribe();
  }

  function subscribeToQuotas(callback) {
    if (!client) return null;
    return client
      .channel('market-quotas-realtime')
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'market_quotas' },
          function() { if (typeof callback === 'function') callback(); })
      .subscribe();
  }

  return {
    initSupabase: initSupabase,
    getClient: getClient,
    getColumnForStand: getColumnForStand,
    getRowForStand: getRowForStand,
    getFacingForColumn: getFacingForColumn,
    getStandRangeForColumn: getStandRangeForColumn,
    escapeHtml: escapeHtml,
    formatMoney: formatMoney,
    formatTime: formatTime,
    todayIso: todayIso,
    todayLong: todayLong,
    generateBookingReference: generateBookingReference,
    expireOldBookings: expireOldBookings,
    fetchTodayBookings: fetchTodayBookings,
    fetchActivePrice: fetchActivePrice,
    computeZwg: computeZwg,
    countActiveBookingsForCustomer: countActiveBookingsForCustomer,
    findActiveQuota: findActiveQuota,
    fetchOpenReportCounts: fetchOpenReportCounts,
    fetchReportsForStand: fetchReportsForStand,
    submitReport: submitReport,
    renderMarketGrid: renderMarketGrid,
    injectGridCSS: injectGridCSS,
    subscribeToBookings: subscribeToBookings,
    subscribeToReports: subscribeToReports,
    subscribeToQuotas: subscribeToQuotas
  };
})();

if (typeof window !== 'undefined') window.MarketUtils = MarketUtils;
