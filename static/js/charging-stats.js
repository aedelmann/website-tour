/**
 * Hydrate Charge Stats from /api/charging-stats when available.
 * Falls back to the hardcoded Hugo markup if the snapshot is missing.
 * No Tesla secrets here.
 */
(function () {
  'use strict';

  function formatInt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  function formatKwh(n) {
    var v = Math.round(n * 10) / 10;
    return (Number.isInteger(v) ? v : v.toFixed(1)).toLocaleString('en-US');
  }

  function currencyLabel(code) {
    if (!code) return '';
    return String(code).toUpperCase();
  }

  function formatMoney(amount, code, fallback) {
    var c = String(code || fallback || 'EUR').toUpperCase();
    var n = Math.round(Number(amount) || 0);
    if (c === 'EUR') return '€ ' + n;
    if (c === 'CHF') return 'CHF ' + n;
    return c + ' ' + n;
  }

  function formatSessionDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function sitePopupHtml(s, defaultCurrency) {
    var html =
      '<strong>' +
      escapeHtml(s.name || 'Supercharger') +
      '</strong>' +
      (s.city ? '<br>' + escapeHtml(s.city) : '') +
      '<br>' +
      formatKwh(s.energyKwh || 0) +
      ' kWh';
    var sessions = Array.isArray(s.sessions) ? s.sessions : [];
    var siteCur = s.currency || defaultCurrency;
    if (typeof s.spent === 'number') {
      html += '<br>' + formatMoney(s.spent, siteCur, defaultCurrency);
    }
    if (sessions.length >= 2) {
      sessions.forEach(function (sess) {
        html +=
          '<br>' +
          escapeHtml(formatSessionDate(sess.at)) +
          ' · ' +
          formatKwh(sess.energyKwh || 0) +
          ' kWh · ' +
          formatMoney(sess.spent, sess.currency || siteCur, defaultCurrency);
      });
    }
    return html;
  }

  function setText(sel, text) {
    var el = document.querySelector(sel);
    if (el) el.textContent = text;
  }

  function hide(el) {
    if (!el) return;
    el.hidden = true;
    el.style.display = 'none';
  }

  function show(el) {
    if (!el) return;
    el.hidden = false;
    el.style.display = '';
  }

  /**
   * Separate Wall Connector graph. Shows estimated € (HOME_EUR_PER_KWH). Hidden when no home block.
   */
  function hydrateHome(home) {
    var row = document.querySelector('[data-home-charge]');
    if (!row) return;

    var months = home && Array.isArray(home.months) ? home.months : [];
    var totals = home && home.totals ? home.totals : null;
    var hasData =
      totals &&
      typeof totals.sessionCount === 'number' &&
      totals.sessionCount > 0 &&
      months.length > 0;

    if (!hasData) {
      hide(row);
      return;
    }

    show(row);

    var cur = totals.currency || 'EUR';
    var totalsEl = row.querySelector('.charge-home-totals');
    if (totalsEl) {
      var totalsText =
        formatKwh(totals.energyKwh || 0) +
        ' kWh · ' +
        formatInt(totals.sessionCount || 0) +
        ' sessions';
      if (typeof totals.spent === 'number') {
        totalsText += ' · ' + formatMoney(totals.spent, cur);
      }
      totalsEl.textContent = totalsText;
      show(totalsEl);
    }

    var noteEl = row.querySelector('.charge-home-rate-note');
    if (noteEl) {
      if (typeof totals.spent === 'number') {
        noteEl.textContent = 'Home € estimated at €0.25/kWh.';
        show(noteEl);
      } else {
        hide(noteEl);
      }
    }

    var barChart = row.querySelector('.charge-bar-chart--home') || row.querySelector('.charge-bar-chart');
    if (!barChart) return;

    var max = 0;
    months.forEach(function (m) {
      if (m.energyKwh > max) max = m.energyKwh;
    });
    if (max <= 0) max = 1;

    var html = '';
    var ariaParts = [];
    months.forEach(function (m, i) {
      var pct = Math.max(4, Math.round((m.energyKwh / max) * 100));
      var tip = formatKwh(m.energyKwh) + ' kWh';
      var hasSpend = typeof m.spent === 'number';
      var money = hasSpend ? formatMoney(m.spent, cur) : '';
      ariaParts.push((m.label || m.key) + ' ' + tip + (money ? ' · ' + money : ''));
      html +=
        '<div class="charge-bar-col">' +
        '<div class="charge-bar-track">' +
        '<div class="charge-bar" style="--bar-h: ' +
        pct +
        '%; --bar-delay: ' +
        (0.15 + i * 0.12).toFixed(2) +
        's" data-kwh="' +
        m.energyKwh +
        '">' +
        '<span class="charge-bar-tip">' +
        tip +
        '</span></div></div>' +
        '<div class="charge-bar-label">' +
        (m.label || m.key) +
        (hasSpend
          ? '<span class="charge-bar-spend">' + money + '</span>'
          : '') +
        '</div></div>';
    });
    barChart.setAttribute(
      'aria-label',
      'Bar chart of monthly home Wall Connector charging: ' + ariaParts.join(', ')
    );
    barChart.innerHTML = html;
  }

  function resetCountTargets(root) {
    root.querySelectorAll('.charge-count').forEach(function (el) {
      el.removeAttribute('data-counted');
    });
  }

  function hydrate(data) {
    if (!data || !data.totals) return false;

    var totals = data.totals;
    var period = data.period || {};

    if (period.label) {
      setText('.charge-hero-sub', period.label);
    }

    var pills = document.querySelector('.charge-hero-pills');
    if (pills) {
      pills.innerHTML =
        '<span><i class="fas fa-bolt"></i> ' +
        formatKwh(totals.energyKwh || 0) +
        ' kWh</span>' +
        '<span><i class="fas fa-plug"></i> ' +
        formatInt(totals.sessionCount || 0) +
        ' sessions</span>' +
        '<span><i class="fas fa-map-marker-alt"></i> ' +
        formatInt(totals.uniqueSites || 0) +
        ' Superchargers</span>';
    }

    var mapChips = document.querySelector('.charge-map-strip');
    if (mapChips) {
      mapChips.innerHTML =
        '<div class="charge-map-chip">' +
        '<strong class="charge-count" data-count="' +
        Math.round(totals.uniqueSites || 0) +
        '">0</strong>' +
        '<span>Unique Superchargers</span></div>' +
        '<div class="charge-map-chip">' +
        '<strong class="charge-count" data-count="' +
        Math.round(totals.sessionCount || 0) +
        '">0</strong>' +
        '<span>Sessions</span></div>';
    }

    var totalCharged = document.querySelector('.charge-hero-stat .charge-stat-value');
    if (totalCharged) {
      totalCharged.innerHTML =
        '<span class="charge-count" data-count="' +
        Math.round(totals.energyKwh || 0) +
        '" data-sep=",">0</span> <em>kWh</em>';
    }

    var spendValue = document.querySelector('.charge-hero-stat--spend .charge-stat-value');
    if (spendValue) {
      var cur = currencyLabel(totals.currency) || 'EUR';
      spendValue.innerHTML =
        cur +
        ' <span class="charge-count" data-count="' +
        Math.round(totals.spent || 0) +
        '" data-sep=",">0</span>';
    }

    // Monthly Supercharger bars (kWh + €) — never mix home into this chart
    var months = Array.isArray(data.months) ? data.months : [];
    var scStage = document.querySelector('[data-charge-months="supercharger"]');
    var barChart = scStage
      ? scStage.querySelector('.charge-bar-chart')
      : document.querySelector('.charge-bar-chart:not(.charge-bar-chart--home)');
    if (barChart && months.length) {
      var max = 0;
      months.forEach(function (m) {
        if (m.energyKwh > max) max = m.energyKwh;
      });
      if (max <= 0) max = 1;
      var html = '';
      var ariaParts = [];
      var cur = totals.currency || 'EUR';
      months.forEach(function (m, i) {
        var pct = Math.max(4, Math.round((m.energyKwh / max) * 100));
        var tip = formatKwh(m.energyKwh) + ' kWh';
        var money = formatMoney(m.spent, cur);
        ariaParts.push(m.label + ' ' + tip + ' · ' + money);
        html +=
          '<div class="charge-bar-col">' +
          '<div class="charge-bar-track">' +
          '<div class="charge-bar" style="--bar-h: ' +
          pct +
          '%; --bar-delay: ' +
          (0.15 + i * 0.12).toFixed(2) +
          's" data-kwh="' +
          m.energyKwh +
          '">' +
          '<span class="charge-bar-tip">' +
          tip +
          '</span></div></div>' +
          '<div class="charge-bar-label">' +
          (m.label || m.key) +
          '<span class="charge-bar-spend">' +
          money +
          '</span></div></div>';
      });
      barChart.setAttribute(
        'aria-label',
        'Bar chart of monthly Supercharger charging: ' + ariaParts.join(', ')
      );
      barChart.innerHTML = html;

      var stageHead = barChart.closest('.charge-stage');
      if (stageHead) {
        var p = stageHead.querySelector('.charge-stage-head p');
        if (p && months.length >= 2) {
          p.textContent = 'Supercharger energy and spend by month.';
        }
      }
    }

    // Home / Wall Connector — separate graph; hide if no live home data (no fake kWh)
    hydrateHome(data.home);

    // Source mix: charging_history has no home/work/other — hide fake mix
    var mixCol = document.querySelector('.charge-donut-wrap');
    if (mixCol) {
      var mixStage = mixCol.closest('.col-lg-5') || mixCol.closest('.charge-stage');
      hide(mixStage);
      var monthCol = barChart;
      if (monthCol) {
        var mc = monthCol.closest('.col-lg-7');
        if (mc) {
          mc.classList.remove('col-lg-7');
          mc.classList.add('col-lg-12');
        }
      }
    }

    // Saved vs petrol: no petrol rate in snapshot — hide
    var saveCard = document.querySelector('.charge-finale--save');
    if (saveCard) {
      var saveCol = saveCard.closest('.col-md-6') || saveCard;
      hide(saveCol);
    }

    // Kilometers: no odometer in charging_history — hide rather than fabricate
    var kmCard = document.querySelector('.charge-finale--km');
    if (kmCard) {
      var kmCol = kmCard.closest('.col-md-6') || kmCard;
      hide(kmCol);
    }

    var updated = data.updatedAt
      ? new Date(data.updatedAt).toLocaleString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'unknown';
    setText(
      '.charge-footnote',
      'Tesla Supercharger history' +
        (data.home && data.home.totals && data.home.totals.sessionCount
          ? ' + Wall Connector (home)'
          : '') +
        ' · last updated ' +
        updated +
        ' · ' +
        (data.vehicle || 'Tesla Model Y')
    );

    resetCountTargets(document);
    return true;
  }

  function initRevealAndCounts() {
    var revealEls = document.querySelectorAll('.charge-reveal');
    var countEls = document.querySelectorAll('.charge-count');
    var counted = new WeakSet();

    function animateCount(el) {
      if (counted.has(el)) return;
      counted.add(el);
      var target = parseInt(el.getAttribute('data-count'), 10) || 0;
      var sep = el.getAttribute('data-sep') || '';
      var duration = 1100;
      var start = performance.now();
      function frame(now) {
        var t = Math.min(1, (now - start) / duration);
        var eased = 1 - Math.pow(1 - t, 3);
        var val = Math.round(target * eased);
        el.textContent = sep ? val.toLocaleString('en-US') : String(val);
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            entry.target.querySelectorAll('.charge-count').forEach(animateCount);
            if (entry.target.classList.contains('charge-count')) animateCount(entry.target);
            io.unobserve(entry.target);
          });
        },
        { threshold: 0.25 }
      );
      revealEls.forEach(function (el) {
        io.observe(el);
      });
      countEls.forEach(function (el) {
        if (
          ![].some.call(revealEls, function (r) {
            return r.contains(el);
          })
        ) {
          io.observe(el);
        }
      });
    } else {
      revealEls.forEach(function (el) {
        el.classList.add('is-visible');
      });
      countEls.forEach(animateCount);
    }

    requestAnimationFrame(function () {
      document.querySelectorAll('.charge-bar').forEach(function (bar) {
        bar.classList.add('is-grown');
      });
      document.querySelectorAll('.charge-donut-seg').forEach(function (seg) {
        seg.classList.add('is-drawn');
      });
    });
  }

  function initMap(sites, defaultCurrency) {
    var mapEl = document.getElementById('chargeMap');
    if (!mapEl || typeof L === 'undefined') return;

    var map = L.map('chargeMap', {
      scrollWheelZoom: false,
      zoomControl: true,
    }).setView([46.5, 2.5], 5);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 18,
    }).addTo(map);

    var pin = L.divIcon({
      className: 'charge-sc-pin',
      html: '<span></span>',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    // Live snapshot: plot Supercharger pins only (never invent a NL→Madrid polyline).
    if (Array.isArray(sites)) {
      var realSites = sites.filter(function (s) {
        return s && typeof s.lat === 'number' && typeof s.lng === 'number';
      });
      if (realSites.length) {
        var bounds = [];
        realSites.forEach(function (s) {
          var latlng = [s.lat, s.lng];
          bounds.push(latlng);
          var popup = sitePopupHtml(s, defaultCurrency);
          L.marker(latlng, { icon: pin }).addTo(map).bindPopup(popup);
        });
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 7 });
      }
      return;
    }

    // Fallback trail — only when /api/charging-stats is unavailable
    var trail = [
      [52.37, 4.9],
      [51.22, 4.4],
      [50.85, 4.35],
      [49.0, 2.3],
      [48.85, 2.35],
      [47.3, 0.7],
      [45.75, 4.85],
      [44.84, -0.58],
      [43.6, 1.44],
      [41.65, -0.88],
      [40.42, -3.7],
    ];

    L.polyline(trail, {
      color: '#b45309',
      weight: 4,
      opacity: 0.35,
    }).addTo(map);

    L.polyline(trail, {
      color: '#e11d48',
      weight: 3,
      opacity: 0.95,
      className: 'charge-route-line',
    }).addTo(map);

    trail.forEach(function (pt, i) {
      if (i % 2 === 0 || i === trail.length - 1) {
        L.marker(pt, { icon: pin }).addTo(map);
      }
    });

    map.fitBounds(trail, { padding: [32, 32], maxZoom: 6 });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var sitesForMap = null;

    function finish(liveSites, currency) {
      initRevealAndCounts();
      // null = use hardcoded fallback trail; array = live Supercharger pins only
      initMap(liveSites, currency);
    }

    fetch('/api/charging-stats', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('no snapshot');
        return res.json();
      })
      .then(function (data) {
        var ok = hydrate(data);
        sitesForMap = ok && Array.isArray(data.sites) ? data.sites : [];
        var cur = data && data.totals ? data.totals.currency : null;
        finish(ok ? sitesForMap : null, cur);
      })
      .catch(function () {
        // Keep hardcoded May–Jul 2026 markup
        finish(null);
      });
  });
})();
