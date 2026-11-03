/* Influencers Involved — site behaviour: menu, Pioneer form, aggregate registry, certificate. No dependencies. */
(function () {
  'use strict';
  var CFG = window.II_CONFIG || { apiBase: '' };
  var API = (CFG.apiBase || '').replace(/\/$/, '');
  var CONSENT_VERSION = '2026-10-30';
  var MAX_ACCOUNTS = 10;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  // Analytics hook (analytics.js decides whether anything is sent). Only an event name and counts/enums are ever passed: never form values, IDs or tokens.
  function track(name, params) { try { if (window.iiTrack) window.iiTrack(name, params); } catch (e) { /* never break the page */ } }
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- Mobile menu ---------- */
  var btn = $('.menu-btn'), nav = $('#site-nav');
  if (btn && nav) {
    var setMenu = function (open) { btn.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open); };
    btn.addEventListener('click', function () { setMenu(btn.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); btn.focus(); } });
    nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') setMenu(false); });
  }

  /* ---------- Email verification and unsubscribe notices ----------
     The email link opens /challenge/#verify=TOKEN. The token lives in the URL fragment (it is never sent to a server by
     simply opening the page), is removed from the address bar at once, and is only used when the person presses
     "Confirm my email". That keeps email-link scanners from consuming the single-use token. */
  (function () {
    var b = $('#verify-banner'); if (!b) return;
    var msg = $('#verify-msg'), go = $('#verify-confirm');
    var show = function (text, bad) { msg.textContent = text; b.hidden = false; b.classList.toggle('bad', !!bad); };
    var u = /[?&]unsubscribe=(\w+)/.exec(location.search);
    if (u) {
      show(u[1] === 'ok' ? 'You are unsubscribed from optional II emails. Your pledge and certificate are unchanged.' : 'That unsubscribe link is not valid. Email us and we will remove you.', u[1] !== 'ok');
      if (history.replaceState) history.replaceState(null, '', location.pathname + location.hash);
      return;
    }
    var token = null;
    var done = function (text, bad, retry) { show(text, bad); go.disabled = false; go.hidden = !retry; };
    if (!go) return;
    go.addEventListener('click', function () {
      if (!token) return;
      go.disabled = true;
      fetch(API + '/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ token: token }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
        .then(function (res) {
          var st = res.body && res.body.status;
          if (res.status === 200 && st === 'ok') { token = null; track('pioneer_email_verified'); return done('Thank you — your email is verified. Your pledge was already complete; verification only helps protect the registry.', false, false); }
          if (st === 'used') { token = null; return done('This verification link has already been used. If you confirmed it, your email is verified and nothing more is needed.', false, false); }
          if (st === 'expired') { token = null; return done('That verification link has expired. If you still need one, submit the resend request from your confirmation, or email us.', true, false); }
          if (st === 'invalid') { token = null; return done('That verification link is not valid.', true, false); }
          if (st === 'rate_limited') return done('Too many attempts from this connection. Please wait a few minutes and try again.', true, true);
          return done('We could not complete verification just now. Please try again in a moment.', true, true);
        })
        .catch(function () { done('We could not reach the server. Please check your connection and try again.', true, true); });
    });
    var pick = function () {
      var m = /^#verify=([A-Za-z0-9_-]{43})$/.exec(location.hash);
      if (!m) return;
      token = m[1];
      if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
      show('Confirm your email address to finish verification. Your pledge and certificate are already complete; this only helps protect the registry.', false);
      go.disabled = false; go.hidden = false; b.scrollIntoView({ block: 'nearest' }); go.focus();
    };
    pick();
    window.addEventListener('hashchange', pick); // the link opened in a page that is already loaded
  })();

  /* ---------- Public registry ----------
     The API answers {visible:false} until 20 eligible registrations exist; nothing is rendered (not even an empty state) before then. */
  function loadRegistry() {
    var sec = $('#pioneers'); if (!sec) return;
    fetch(API + '/api/stats', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
      if (!s || s.visible !== true) return;
      var put = function (id, n) { $(id).textContent = Number(n).toLocaleString(); };
      put('#st-pioneers', s.pioneers); put('#st-accounts', s.social_accounts); put('#st-charities', s.charities); put('#st-countries', s.countries);
      sec.hidden = false;
      fetch(API + '/api/pioneers', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!d || d.visible !== true || !d.pioneers || !d.pioneers.length) return;
        var ul = $('#profiles'); ul.textContent = '';
        d.pioneers.forEach(function (p) {
          var li = document.createElement('li'); var b = document.createElement('b'); b.textContent = p.name; li.appendChild(b);
          (p.accounts || []).forEach(function (a) {
            var label = a.platform + ' · ' + a.handle;
            if (a.url && /^https:\/\//.test(a.url)) { // link only when a real, validated URL was supplied; never built from the handle
              var link = document.createElement('a'); link.href = a.url; link.rel = 'noopener nofollow'; link.target = '_blank'; link.textContent = label; li.appendChild(link);
            } else { var span = document.createElement('span'); span.textContent = label; li.appendChild(span); }
            li.appendChild(document.createElement('br'));
          });
          ul.appendChild(li);
        });
        $('#profiles-wrap').hidden = false;
      }).catch(function () {});
    }).catch(function () { /* the registry stays hidden */ });
  }

  /* ---------- Pioneer form ---------- */
  var form = $('#pledge-form');
  if (!form) { loadRegistry(); return; }
  loadRegistry();

  var platformOptions = (CFG.platforms || ['YouTube', 'Instagram', 'TikTok', 'Facebook', 'Twitch', 'LinkedIn', 'X', 'Other']);
  var accountsEl = $('#accounts'), addBtn = $('#add-account'), accountSeq = 0;

  function today() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  $('#pledge_date').value = today();
  $('#pledge_date').max = today();

  function accountBlock() {
    var n = ++accountSeq, wrap = document.createElement('div');
    wrap.className = 'account'; wrap.setAttribute('data-account', n);
    var opts = platformOptions.map(function (p) { return '<option value="' + p + '">' + p + '</option>'; }).join('');
    wrap.innerHTML =
      '<div class="account-head"><b>Account <span class="acc-num"></span></b><button type="button" class="link-btn rm" hidden>Remove</button></div>' +
      '<div class="row three">' +
      '<div class="field"><label for="plat' + n + '">Platform <span class="req">*</span></label><select id="plat' + n + '" data-f="platform" aria-describedby="plat' + n + '-e"><option value="">Choose…</option>' + opts + '</select><p class="err" id="plat' + n + '-e"></p></div>' +
      '<div class="field"><label for="hand' + n + '">Handle or channel name <span class="req">*</span></label><input type="text" id="hand' + n + '" data-f="handle" maxlength="120" aria-describedby="hand' + n + '-e"><p class="err" id="hand' + n + '-e"></p></div>' +
      '<div class="field"><label for="url' + n + '">Profile URL <span class="opt">(optional)</span></label><input type="url" id="url' + n + '" data-f="url" maxlength="300" placeholder="https://…" inputmode="url" aria-describedby="url' + n + '-h url' + n + '-e"><p class="hint" id="url' + n + '-h">Paste the link if you have it. We never guess one from your handle.</p><p class="err" id="url' + n + '-e"></p></div>' +
      '</div>' +
      '<label class="check"><input type="checkbox" data-f="public"><span>Show this account publicly in the Pioneer Registry <span class="hint">(only when you choose public recognition and your email is verified).</span></span></label>';
    $('.rm', wrap).addEventListener('click', function () { wrap.remove(); renumber(); $('#add-account').focus(); });
    return wrap;
  }
  function renumber() {
    var blocks = $$('.account', accountsEl);
    blocks.forEach(function (b, i) { $('.acc-num', b).textContent = i + 1; $('.rm', b).hidden = blocks.length === 1; });
    addBtn.hidden = blocks.length >= MAX_ACCOUNTS;
  }
  accountsEl.appendChild(accountBlock()); renumber();
  addBtn.addEventListener('click', function () { var b = accountBlock(); accountsEl.appendChild(b); renumber(); $('select', b).focus(); syncPrivacy(); });

  // Charity selector: a native <select> with categories; the two special choices sit at the top.
  var charitySel = $('#charity_select');
  function syncCharity() {
    var v = charitySel.value;
    $('#charity-other-field').hidden = v !== '__other__';
    $('#charity-undecided-note').hidden = v !== '__undecided__';
  }
  charitySel.addEventListener('change', function () { syncCharity(); if (this.value === '__other__') $('#charity_other').focus(); });
  // Collaboration sub-options only when Yes / Maybe
  function syncCollab() {
    var v = (form.querySelector('input[name=collaboration_interest]:checked') || {}).value;
    var show = v === 'Yes' || v === 'Maybe'; $('#collab-sub').hidden = !show;
    if (!show) $$('#collab-sub input').forEach(function (i) { i.checked = false; });
  }
  $$('input[name=collaboration_interest]').forEach(function (r) { r.addEventListener('change', syncCollab); });
  // Anonymous overrides per-account public flags
  function syncPrivacy() {
    var anon = (form.querySelector('input[name=privacy_preference]:checked') || {}).value === 'anonymous';
    $$('[data-f=public]', accountsEl).forEach(function (c) { if (anon) c.checked = false; c.disabled = anon; });
  }
  $$('input[name=privacy_preference]').forEach(function (r) { r.addEventListener('change', syncPrivacy); });

  /* --- validation --- */
  function setErr(id, msg) {
    var e = document.getElementById(id + '-e'), f = document.getElementById(id);
    if (e) e.textContent = msg || '';
    if (f) { if (msg) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid'); }
    return !msg;
  }
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function validate() {
    var ok = true, first = null;
    function check(id, cond, msg) { var good = setErr(id, cond ? '' : msg); if (!good) { ok = false; if (!first) first = document.getElementById(id); } }
    var v = function (id) { return (document.getElementById(id).value || '').trim(); };
    check('creator_name', v('creator_name').length >= 1, 'Enter your creator or channel name.');
    check('email', EMAIL.test(v('email')), 'Enter a valid email address.');
    check('country', !!v('country'), 'Choose your country.');
    check('pledge_date', /^\d{4}-\d{2}-\d{2}$/.test(v('pledge_date')) && v('pledge_date') <= today(), 'Choose a pledge date that is today or earlier.');
    check('charity_select', !!v('charity_select'), 'Choose a charity, or say you haven’t chosen yet.');
    if (v('charity_select') === '__other__') check('charity_other', /\p{L}.*\p{L}/u.test(v('charity_other')) && !/:\/\/|www\.|@/.test(v('charity_other')), 'Enter the name of your charity (not a web address).');
    var pc = $('#pledge_confirm'); setErr('pledge_confirm', pc.checked ? '' : 'Please confirm your pledge.'); if (!pc.checked) { ok = false; first = first || pc; }
    var ca = $('#cert_ack'); setErr('cert_ack', ca.checked ? '' : 'Please confirm you understand what the certificate is.'); if (!ca.checked) { ok = false; first = first || ca; }
    var pp = form.querySelector('input[name=privacy_preference]:checked');
    $('#privacy_preference-e').textContent = pp ? '' : 'Choose a public recognition option.'; if (!pp) { ok = false; first = first || form.querySelector('input[name=privacy_preference]'); }
    $$('.account', accountsEl).forEach(function (b) {
      var n = b.getAttribute('data-account');
      check('plat' + n, !!$('[data-f=platform]', b).value, 'Choose a platform.');
      check('hand' + n, $('[data-f=handle]', b).value.trim().length >= 1, 'Enter the handle or channel name.');
      var u = $('[data-f=url]', b).value.trim(), good = true; // optional: validated only when something is entered
      if (u) { try { var p = new URL(u); good = p.protocol === 'https:' && !!p.hostname && p.hostname.indexOf('.') > 0; } catch (e) { good = false; } }
      check('url' + n, good, 'Enter a full link starting with https://, or leave it blank.');
    });
    if (first) first.focus();
    return ok;
  }

  // Clear a field's error as soon as the person corrects it.
  function clearOn(ev) {
    var t = ev.target; if (!t || !t.id) { if (t && t.name === 'privacy_preference') $('#privacy_preference-e').textContent = ''; return; }
    var e = document.getElementById(t.id + '-e'); if (!e || !e.textContent) return;
    var empty = t.type === 'checkbox' ? !t.checked : !String(t.value || '').trim();
    var optional = t.getAttribute('data-f') === 'url'; // an optional field may legitimately be emptied
    if (!empty || optional) { e.textContent = ''; t.removeAttribute('aria-invalid'); }
  }
  var started = false; form.addEventListener('focusin', function () { if (!started) { started = true; track('pioneer_form_start'); } });
  form.addEventListener('input', clearOn); form.addEventListener('change', clearOn);
  $$('input[name=privacy_preference]').forEach(function (r) { r.addEventListener('change', function () { $('#privacy_preference-e').textContent = ''; }); });

  function payload() {
    var v = function (id) { return (document.getElementById(id).value || '').trim(); };
    var undecided = v('charity_select') === '__undecided__';
    var charity = undecided ? '' : (v('charity_select') === '__other__' ? v('charity_other') : v('charity_select'));
    var anon = form.querySelector('input[name=privacy_preference]:checked').value === 'anonymous';
    var interest = form.querySelector('input[name=collaboration_interest]:checked').value;
    var types = (interest === 'Not now') ? [] : $$('input[name=collab_types]:checked').map(function (c) { return c.value; });
    return {
      idempotency_key: idemKey,
      consent_version: CONSENT_VERSION,
      creator_name: v('creator_name'), email: v('email'), country: v('country'), pledge_date: v('pledge_date'),
      charity_status: undecided ? 'undecided' : 'selected', charity: charity, pledge_confirmed: true, certificate_ack: true,
      privacy_preference: anon ? 'anonymous' : 'public',
      general_email_opt_in: $('#general_email_opt_in').checked,
      collaboration_interest: interest, collaboration_types: types,
      collab_contact_opt_in: interest === 'Not now' ? false : $('#collab_contact_opt_in').checked,
      ii_extra_note: (form.elements.ii_extra_note || {}).value || '', // hidden anti-spam field; real people leave it empty
      accounts: $$('.account', accountsEl).map(function (b) {
        return { platform: $('[data-f=platform]', b).value, handle: $('[data-f=handle]', b).value.trim(), profile_url: $('[data-f=url]', b).value.trim(), public_display_permission: anon ? false : $('[data-f=public]', b).checked };
      })
    };
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  // One key per attempt-set; reused for retries so a repeated submit cannot create a duplicate record.
  var idemKey = uuid();
  var FAIL = 'We could not confirm your registration. Your certificate has not been issued. Please try again.';
  function showError(msg) { $('#form-error-msg').textContent = msg; var box = $('#form-error'); box.hidden = false; box.scrollIntoView({ block: 'center' }); }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault(); $('#form-error').hidden = true;
    if (!validate()) return;
    var submit = $('#submit-btn'); submit.disabled = true; submit.textContent = 'Saving your pledge…';
    var body = payload();
    var ctl = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, 20000);
    fetch(API + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        clearTimeout(t);
        if ((res.status === 201 || res.status === 200) && res.body && res.body.ok && res.body.pioneer_id) return success(res.body, body);
        if (res.status === 409 && res.body && res.body.error === 'email_registered') return showError('This email address has already joined the Pioneer Registry. If you need your certificate or want to change your details, email ' + (CFG.email || 'us') + '.');
        if (res.status === 400 && res.body && res.body.fields) {
          var shown = false;
          Object.keys(res.body.fields).forEach(function (k) { var id = ({ charity: 'charity_select', accounts: 'accounts' })[k] || k; if (document.getElementById(id + '-e')) { setErr(id, res.body.fields[k]); shown = true; } });
          return showError(shown ? 'Please correct the highlighted fields and try again.' : FAIL);
        }
        if (res.status === 400 && res.body && res.body.error === 'rejected') return showError('We could not accept this submission. Please reload the page and try again, or email us if it keeps happening. Your certificate has not been issued.');
        if (res.status === 429) return showError('Too many attempts from this connection. Please wait a few minutes and try again.');
        showError(FAIL);
      })
      .catch(function () { clearTimeout(t); showError(FAIL); })
      .then(function () { submit.disabled = false; submit.textContent = 'Submit pledge & join'; });
  });

  /* ---------- Success + certificate ---------- */
  function success(res, sent) {
    if (res.email_status !== 'replayed') track('pioneer_registered', { account_count: sent.accounts.length, charity_status: res.charity_status });
    $('#pid').textContent = res.pioneer_id;
    $('#join-area').hidden = true; $('#challenge-intro').hidden = true;
    var s = $('#success'); s.hidden = false;
    var dl = $('#cert-download'); if (dl) dl.addEventListener('click', function () { track('certificate_download'); });
    var vl = $('#verify-line');
    $('#charity-later').hidden = res.charity_status !== 'undecided';
    if (res.email_status === 'failed' || res.email_status === 'not_configured') {
      vl.textContent = 'Your pledge is saved and your certificate is ready. We could not send the optional email-verification link just now; you can request it again below. Email verification is separate and is not required.';
    }
    var rb = document.createElement('button'); rb.type = 'button'; rb.className = 'link-btn'; rb.textContent = 'Resend the verification email';
    var rmsg = document.createElement('span'); rmsg.className = 'fine'; rmsg.setAttribute('role', 'status'); rmsg.className += ' resend-msg';
    rb.addEventListener('click', function () {
      rb.disabled = true;
      fetch(API + '/api/resend-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: sent.email }) })
        .then(function (r) { rmsg.textContent = r.status === 429 ? 'Please wait a little before requesting another link.' : 'If that address is waiting for verification, a new link is on its way.'; })
        .catch(function () { rmsg.textContent = 'Could not send right now. Please try again later.'; })
        .then(function () { setTimeout(function () { rb.disabled = false; }, 15000); });
    });
    vl.parentNode.insertBefore(rb, vl.nextSibling); rb.parentNode.insertBefore(rmsg, rb.nextSibling);
    renderCertificate(res);
    s.scrollIntoView(); s.focus({ preventScroll: true });
  }

  function wrapText(ctx, text, maxW) {
    var words = text.split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur); return lines;
  }
  function renderCertificate(res) {
    var c = $('#cert'), ctx = c.getContext('2d'), W = c.width, H = c.height;
    var SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif', SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
    function draw(logo) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#012f70'; ctx.lineWidth = 8; ctx.strokeRect(40, 40, W - 80, H - 80);
      ctx.lineWidth = 2; ctx.strokeStyle = '#7bdc0a'; ctx.strokeRect(62, 62, W - 124, H - 124);
      ctx.textAlign = 'center'; ctx.fillStyle = '#0d2147';
      if (logo) { var lw = 720, lh = lw * logo.height / logo.width; ctx.drawImage(logo, (W - lw) / 2, 120, lw, lh); }
      var y = 450;
      ctx.fillStyle = '#2e6c05'; ctx.font = '700 30px ' + SANS; try { ctx.letterSpacing = '8px'; } catch (e) {}
      ctx.fillText('PIONEER PLEDGE CERTIFICATE', W / 2, y); try { ctx.letterSpacing = '0px'; } catch (e) {}
      ctx.fillStyle = '#47557a'; ctx.font = 'italic 30px ' + SERIF; ctx.fillText('Presented to', W / 2, y + 85);
      ctx.fillStyle = '#012f70'; var size = 76; ctx.font = '700 ' + size + 'px ' + SERIF;
      while (ctx.measureText(res.display_name).width > W - 280 && size > 36) { size -= 4; ctx.font = '700 ' + size + 'px ' + SERIF; }
      ctx.fillText(res.display_name, W / 2, y + 175);
      ctx.strokeStyle = '#d9d3c4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(300, y + 205); ctx.lineTo(W - 300, y + 205); ctx.stroke();
      ctx.fillStyle = '#0d2147'; ctx.font = '30px ' + SERIF; ctx.fillText('for pledging 1% of creator income to', W / 2, y + 265);
      ctx.fillStyle = '#005eca'; ctx.font = '700 46px ' + SERIF;
      // A pledge with no charity yet never names one: the certificate says a charity "they will choose".
      var lines = res.charity ? wrapText(ctx, res.charity, W - 300) : ['a charity they will choose'], ly = y + 330;
      lines.slice(0, 3).forEach(function (l, i) { ctx.fillText(l, W / 2, ly + i * 56); });
      var after = ly + Math.min(lines.length, 3) * 56 - 10;
      ctx.fillStyle = '#0d2147'; ctx.font = '28px ' + SERIF; ctx.fillText('and helping inspire charitable giving within creator culture.', W / 2, after + 20);
      ctx.font = '600 25px ' + SANS; ctx.fillStyle = '#47557a';
      ctx.fillText('Pledge date: ' + res.pledge_date + '      Pioneer ID: ' + res.pioneer_id, W / 2, H - 205);
      ctx.fillText('influencersinvolved.org', W / 2, H - 165);
      ctx.fillStyle = '#0d2147'; ctx.font = 'italic 24px ' + SERIF;
      ctx.fillText('This certificate represents a pledge and is not a donation receipt or proof of payment.', W / 2, H - 112);
      c.toBlob(function (b) { if (!b) return; var a = $('#cert-download'); a.href = URL.createObjectURL(b); });
    }
    var img = new Image(); img.onload = function () { draw(img); }; img.onerror = function () { draw(null); }; img.src = '/assets/logo-horizontal.png';
    $('#cert-print').onclick = function () {
      var w = window.open('', '_blank'); if (!w) return;
      var im = w.document.createElement('img'); im.alt = 'Pioneer Pledge Certificate'; im.src = c.toDataURL('image/png');
      im.style.width = '100%'; w.document.title = 'Pioneer Pledge Certificate'; w.document.body.style.margin = '0'; w.document.body.appendChild(im);
      im.onload = function () { w.focus(); w.print(); };
    };
  }
})();
