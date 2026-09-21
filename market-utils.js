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
  // Stands 1-25 column 1, 26-50 column 2,
  // 51-75 column 3, 76-100 column 4.
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
    // Columns 1 and 3 face right, columns 2 and 4 face left
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
  // Called on page load and every 60 seconds.
  // Any pending_payment booking past its
  // expires_at is marked expired so the stand
  // becomes available again.
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
  // Returns a map keyed by stand_number:
  //   { status, booking } for each stand that
  //   has an active (pending or confirmed) booking
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
  // FETCH ACTIVE PRICE
  // --------------------------------------------
  async function fetchActivePrice() {
    if (!client) return { price_per_day: 5.00, currency: 'USD' };
    var { data, error } = await client
      .from('market_pricing')
      .select('*')
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) {
      return { price_per_day: 5.00, currency: 'USD' };
    }
    return data[0];
  }

  // --------------------------------------------
  // RENDER MARKET GRID
  // containerId  - id of the container element
  // bookingsMap  - { standNumber: booking }
  // onStandClick - function(standNumber, booking)
  // options      - { showReleased: false }
  // --------------------------------------------
  function renderMarketGrid(containerId, bookingsMap, onStandClick, options) {
    var opts = options || {};
    var container = document.getElementById(containerId);
    if (!container) return;
    var map = bookingsMap || {};

    var html = '<div class="market-grid">';

    // Column 1
    html += renderColumn(1, map, opts);
    html += '<div class="market-aisle"><span>AISLE</span></div>';
    // Column 2
    html += renderColumn(2, map, opts);
    // Central wall
    html += '<div class="market-wall" title="Central back wall"></div>';
    // Column 3
    html += renderColumn(3, map, opts);
    html += '<div class="market-aisle"><span>AISLE</span></div>';
    // Column 4
    html += renderColumn(4, map, opts);

    html += '</div>';
    container.innerHTML = html;

    // Bind click handlers
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
    // Facing indicator strips
    + '.market-stand.face-right{border-right-width:5px;border-right-color:#28a745;}'
    + '.market-stand.face-left{border-left-width:5px;border-left-color:#28a745;}'
    // Status colors override the strip color
    + '.market-stand.stand-confirmed{background:#dc3545;color:white;border-color:#a71d2a;}'
    + '.market-stand.stand-confirmed.face-right{border-right-color:#7d0a17;}'
    + '.market-stand.stand-confirmed.face-left{border-left-color:#7d0a17;}'
    + '.market-stand.stand-pending_payment{background:#ffc107;color:#333;border-color:#c79100;}'
    + '.market-stand.stand-pending_payment.face-right{border-right-color:#8a6500;}'
    + '.market-stand.stand-pending_payment.face-left{border-left-color:#8a6500;}'
    + '.market-stand.stand-available{background:#e7f6ea;}'
    + '.market-stand.stand-available:hover{background:#c8ebd0;}'
    + '.market-stand.stand-expired,.market-stand.stand-released{background:#e7f6ea;}'
    + '.market-aisle{flex:0 0 34px;align-self:stretch;display:flex;align-items:center;justify-content:center;background:#e9ecef;border-radius:4px;margin:0 6px;}'
    + '.market-aisle span{writing-mode:vertical-rl;transform:rotate(180deg);font-size:10px;font-weight:bold;color:#6c757d;letter-spacing:3px;}'
    + '.market-wall{flex:0 0 14px;align-self:stretch;background:repeating-linear-gradient(45deg,#343a40,#343a40 4px,#495057 4px,#495057 8px);border-radius:2px;margin:0 2px;}'
    // Legend
    + '.market-legend{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;margin-top:15px;font-size:13px;}'
    + '.market-legend-item{display:flex;align-items:center;gap:6px;}'
    + '.market-legend-swatch{width:20px;height:20px;border-radius:3px;border:1px solid #333;}'
    // Mobile: allow horizontal scroll
    + '@media (max-width:768px){.market-stand{width:64px;height:28px;font-size:10px;}.market-aisle{flex:0 0 20px;margin:0 3px;}.market-aisle span{font-size:8px;letter-spacing:1px;}.market-wall{flex:0 0 8px;}.market-grid{padding:10px;justify-content:flex-start;}}';

    var style = document.createElement('style');
    style.id = 'market-grid-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // --------------------------------------------
  // REAL-TIME SUBSCRIPTION
  // callback receives no args; caller refetches.
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
    renderMarketGrid: renderMarketGrid,
    injectGridCSS: injectGridCSS,
    subscribeToBookings: subscribeToBookings
  };
})();

if (typeof window !== 'undefined') window.MarketUtils = MarketUtils;
