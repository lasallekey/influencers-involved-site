/* Influencers Involved: consent-gated Google Analytics 4. No dependencies.
 *
 * Rules this file enforces:
 *  - Nothing from Google is requested, and no analytics cookie is set, until the visitor presses "Accept analytics".
 *  - "Reject analytics" and "Accept analytics" are equally available; the footer "Cookie preferences" button reopens the choice;
 *    changing to Reject removes the Google Analytics cookies and stops sending.
 *  - A browser "Global Privacy Control" signal always counts as Reject, even after an earlier Accept: nothing loads, existing Google
 *    Analytics cookies are removed, and Accept is unavailable while the signal is on. Remove the signal to choose again (an earlier choice is kept).
 *  - Only page paths and a short allow-list of events are sent. Page URLs are rebuilt from origin + path: query strings and
 *    #fragments (which can carry a verification token) are NEVER sent. Event parameters are allow-listed by name and value;
 *    names, email addresses, Pioneer IDs, tokens and free text cannot pass.
 *  - The choice is remembered in this browser only (localStorage "ii_consent"); it is not sent anywhere. */
(function () {
  'use strict';
  var CFG = (window.II_CONFIG && window.II_CONFIG.analytics) || {};
  var ID = /^G-[A-Z0-9]{6,14}$/.test(CFG.id || '') ? CFG.id : '';
  var MODE = CFG.mode === 'dry-run' ? 'dry-run' : 'live'; // dry-run (staging): records calls in window.__iiGa, contacts nobody
  var KEY = 'ii_consent';
  var started = false, granted = false;
  var $ = function (s) { return document.querySelector(s); };

  /* Events and the only parameters each may carry (number ranges / fixed value lists). */
  var EVENTS = {
    pioneer_form_start: {},                                        // first interaction with the registration form (not a conversion)
    pioneer_registered: { account_count: [1, 10], charity_status: ['selected', 'undecided'] }, // pledge saved (conversion)
    pioneer_email_verified: {},                                    // email confirmed by the person (conversion)
    certificate_download: {},
    donate_click: {}
  };

  /** Page URL without query string or fragment. Returns '' when unparseable. */
  function cleanUrl(u) {
    try { var x = new URL(u, location.href); return x.protocol + '//' + x.host + x.pathname; } catch (e) { return ''; }
  }
  function cleanParams(name, p) {
    var rule = EVENTS[name], out = {};
    if (!rule) return null;
    p = p || {};
    Object.keys(rule).forEach(function (k) {
      var v = p[k], r = rule[k];
      if (r.length === 2 && typeof r[0] === 'number') { if (typeof v === 'number' && isFinite(v) && v >= r[0] && v <= r[1]) out[k] = Math.floor(v); }
      else if (r.indexOf(v) !== -1) out[k] = v;
    });
    return out;
  }

  function stored() { try { var v = localStorage.getItem(KEY); return v === 'granted' || v === 'denied' ? v : null; } catch (e) { return null; } }
  function store(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: the choice just lasts for this page */ } }
  var gpc = function () { return navigator.globalPrivacyControl === true; };

  /* ---------- Loading and sending ---------- */
  function ga() { window.gtag.apply(null, arguments); }
  function load() {
    if (!ID) return;
    if (started) { // accept again on the same page after a reject: re-enable sending AND restore the GA4 consent state that unload() denied
      granted = true; window['ga-disable-' + ID] = false;
      ga('consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      return;
    }
    started = true; granted = true;
    window['ga-disable-' + ID] = false;
    if (MODE === 'dry-run') { window.__iiGa = window.__iiGa || []; window.gtag = function () { window.__iiGa.push([].slice.call(arguments)); }; }
    else {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ID);
      document.head.appendChild(s);
    }
    var page = { page_location: cleanUrl(location.href), page_referrer: cleanUrl(document.referrer), page_title: document.title };
    ga('js', new Date());
    ga('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    ga('config', ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_flags: 'SameSite=Lax;Secure', page_location: page.page_location, page_referrer: page.page_referrer });
    ga('event', 'page_view', page);
  }
  function expireCookies() {
    var host = location.hostname, parts = host.split('.'), parent = parts.length > 2 ? '.' + parts.slice(-2).join('.') : '';
    (document.cookie || '').split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (!/^(_ga|_gid|_gat|_gcl)/.test(n)) return;
      ['', ';domain=' + host, ';domain=.' + host, parent ? ';domain=' + parent : ''].forEach(function (d) { document.cookie = n + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/' + d; });
    });
  }
  function unload() {
    granted = false;
    if (ID) window['ga-disable-' + ID] = true; // stops any already-loaded gtag from sending
    if (started && window.gtag) ga('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    expireCookies();
  }

  /** The one public way to record an event. Silent unless the visitor has accepted analytics. */
  function track(name, params) {
    try {
      if (!granted || !started) return;
      var p = cleanParams(name, params); if (!p) return;
      p.page_location = cleanUrl(location.href);
      ga('event', name, p);
    } catch (e) { /* analytics must never break the site */ }
  }
  window.iiTrack = track;

  /* ---------- Consent banner ---------- */
  var banner = $('#consent');
  function state() { var s = $('#consent-state'); if (!s) return; var c = stored(); s.textContent = gpc() ? 'Your browser sends a Global Privacy Control signal, so analytics stays off while it is on. Turn the signal off in your browser to choose again.' : c === 'granted' ? 'Your current choice: analytics accepted.' : c === 'denied' ? 'Your current choice: analytics rejected.' : 'No choice made yet; analytics is off.'; }
  function show(focus) { if (!banner) return; state(); var a = $('[data-consent=accept]'); if (a) a.disabled = gpc(); banner.hidden = false; if (focus) { var h = $('#consent-title'); if (h) h.focus(); } }
  function hide() { if (banner) banner.hidden = true; }
  function choose(v) {
    if (gpc() && v === 'granted') return; // the signal wins; Accept is disabled in the banner too
    store(v); hide();
    if (v === 'granted') load(); else unload();
    var live = $('#consent-live'); if (live) live.textContent = v === 'granted' ? 'Analytics accepted.' : 'Analytics rejected.';
    var opener = $('[data-consent-open]'); if (opener && document.activeElement === document.body) opener.focus();
  }
  if (banner) {
    banner.addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('[data-consent]') : null; if (b) choose(b.getAttribute('data-consent') === 'accept' ? 'granted' : 'denied'); });
    banner.addEventListener('keydown', function (e) { if (e.key === 'Escape' && stored()) { hide(); var o = $('[data-consent-open]'); if (o) o.focus(); } });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : null; if (!t) return;
    if (t.closest('[data-consent-open]')) { e.preventDefault(); show(true); return; }
    var a = t.closest('a[href]');
    if (a && /^https:\/\/www\.zeffy\.com\//.test(a.href)) track('donate_click');
  });

  var c = stored();
  if (gpc()) { if (ID) window['ga-disable-' + ID] = true; if (c === 'granted') expireCookies(); } // never loads; cookies from an earlier Accept are removed
  else if (c === 'granted') load();
  else if (c === null && ID) show(false);
})();
