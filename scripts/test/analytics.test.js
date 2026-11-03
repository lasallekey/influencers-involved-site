import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../../src/static/analytics.js', import.meta.url), 'utf8');

/** Runs analytics.js in a fake browser and returns handles to inspect what it did. */
function boot({ stored, gpc = false, mode = 'live', href = 'https://influencersinvolved.org/challenge/', referrer = '', cookie = '' } = {}) {
  const calls = { scripts: [], cookieWrites: [] };
  const store = new Map(stored ? [['ii_consent', stored]] : []);
  const mk = (extra = {}) => ({ hidden: true, textContent: '', focus() { this.focused = true; }, addEventListener(t, fn) { (this.l ||= {})[t] = fn; }, ...extra });
  const el = { '#consent': mk(), '#consent-state': mk(), '#consent-title': mk(), '#consent-live': mk(), '[data-consent-open]': mk() };
  const btn = (v) => ({ getAttribute: () => v });
  let cookieJar = cookie;
  const doc = {
    title: 'Page title', referrer, activeElement: {}, body: {}, head: { appendChild: (s) => calls.scripts.push(s.src) },
    querySelector: (s) => el[s] || null, createElement: () => ({}),
    get cookie() { return cookieJar; }, set cookie(v) { calls.cookieWrites.push(v); },
    addEventListener(t, fn) { (this.l ||= {})[t] = fn; },
  };
  const sb = { URL, Math, isFinite, Object, JSON, document: doc, navigator: { globalPrivacyControl: gpc },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
    location: { href, hostname: new URL(href).hostname },
    II_CONFIG: { analytics: { id: 'G-K34TWL28XS', mode } } };
  sb.window = sb;
  vm.runInNewContext(code, sb);
  const click = (v) => el['#consent'].l.click({ target: { closest: (q) => (q === '[data-consent]' ? btn(v) : null) } });
  const docClick = (sel) => doc.l.click({ target: { closest: (q) => (q === sel ? {} : q === 'a[href]' && sel === 'zeffy' ? { href: 'https://www.zeffy.com/en-US/donation-form/support-influencers-involved' } : null) } });
  return { sb, calls, el, store, click, docClick, doc, layer: () => (sb.dataLayer || []).map((a) => Array.from(a)) };
}

test('before any choice: banner shown, nothing loaded, no gtag, events are silent', () => {
  const b = boot();
  assert.equal(b.el['#consent'].hidden, false);
  assert.deepEqual(b.calls.scripts, []);
  assert.equal(b.sb.gtag, undefined); assert.equal(b.sb.dataLayer, undefined);
  b.sb.iiTrack('pioneer_email_verified'); assert.equal(b.sb.dataLayer, undefined);
});

test('Reject: nothing is ever loaded or stored beyond the choice; stays silent', () => {
  const b = boot(); b.click('reject');
  assert.equal(b.store.get('ii_consent'), 'denied'); assert.equal(b.el['#consent'].hidden, true);
  assert.deepEqual(b.calls.scripts, []); assert.equal(b.sb.dataLayer, undefined);
  b.sb.iiTrack('pioneer_registered', { account_count: 1, charity_status: 'selected' }); assert.equal(b.sb.dataLayer, undefined);
});

test('Accept: loads Google once; page_view uses origin+path only (fragment token and query never sent)', () => {
  const b = boot({ href: 'https://influencersinvolved.org/challenge/?token=SECRET&p=II-AAAA-BBBB&t=zz#verify=' + 'A'.repeat(43), referrer: 'https://mail.example.com/inbox?id=SECRET#frag' });
  b.click('accept');
  assert.equal(b.store.get('ii_consent'), 'granted');
  assert.deepEqual(b.calls.scripts, ['https://www.googletagmanager.com/gtag/js?id=G-K34TWL28XS']);
  const l = b.layer(); const pv = l.find((a) => a[0] === 'event' && a[1] === 'page_view')[2];
  assert.equal(pv.page_location, 'https://influencersinvolved.org/challenge/'); assert.equal(pv.page_referrer, 'https://mail.example.com/inbox');
  const cfg = l.find((a) => a[0] === 'config'); assert.equal(cfg[2].send_page_view, false); assert.equal(cfg[2].allow_google_signals, false); assert.equal(cfg[2].allow_ad_personalization_signals, false);
  assert.ok(!/SECRET|verify|token|II-AAAA|[?#]/.test(JSON.stringify(l).replace(/G-K34TWL28XS/g, '')), 'nothing sensitive in the data layer');
  b.click('accept'); assert.equal(b.calls.scripts.length, 1, 'never loaded twice');
});

test('event parameters are allow-listed: names, emails, IDs, free text and unknown events cannot pass', () => {
  const b = boot({ stored: 'granted', href: 'https://influencersinvolved.org/challenge/#verify=' + 'B'.repeat(43) });
  b.sb.iiTrack('pioneer_registered', { account_count: 3, charity_status: 'selected', email: 'a@b.co', creator_name: 'Jane Doe', pioneer_id: 'II-ABCD-2345', charity: 'Feeding America' });
  b.sb.iiTrack('pioneer_registered', { account_count: 'jane@x.co', charity_status: 'Feeding America' });
  b.sb.iiTrack('pioneer_registered', { account_count: 9999 });
  b.sb.iiTrack('made_up_event', { a: 1 }); b.sb.iiTrack('purchase', { value: 5 });
  b.sb.iiTrack('pioneer_email_verified', { token: 'T'.repeat(43) });
  const ev = JSON.parse(JSON.stringify(b.layer().filter((a) => a[0] === 'event' && a[1] !== 'page_view').map((a) => [a[1], a[2]]))); // plain objects (the fake browser is a separate realm)
  assert.deepEqual(ev, [
    ['pioneer_registered', { account_count: 3, charity_status: 'selected', page_location: 'https://influencersinvolved.org/challenge/' }],
    ['pioneer_registered', { page_location: 'https://influencersinvolved.org/challenge/' }],
    ['pioneer_registered', { page_location: 'https://influencersinvolved.org/challenge/' }],
    ['pioneer_email_verified', { page_location: 'https://influencersinvolved.org/challenge/' }],
  ]);
  assert.ok(!/@|Jane|II-ABCD|Feeding|BBBB|token|verify/.test(JSON.stringify(b.layer())));
});

test('Zeffy link clicks are counted as donate_click only after consent', () => {
  const b = boot(); b.docClick('zeffy'); assert.equal(b.sb.dataLayer, undefined);
  b.click('accept'); b.docClick('zeffy');
  assert.ok(b.layer().some((a) => a[0] === 'event' && a[1] === 'donate_click'));
});

test('withdrawing consent stops sending and removes the Google Analytics cookies', () => {
  const b = boot({ stored: 'granted', cookie: '_ga=GA1.1.1; _ga_K34TWL28XS=GS1; session=keep' });
  const before = b.layer().length;
  b.doc.l.click({ target: { closest: (q) => (q === '[data-consent-open]' ? {} : null), }, preventDefault() {} });
  assert.equal(b.el['#consent'].hidden, false, 'footer link reopens the choice');
  b.click('reject');
  assert.equal(b.sb['ga-disable-G-K34TWL28XS'], true);
  const writes = b.calls.cookieWrites.join('\n');
  assert.match(writes, /^_ga=;expires=Thu, 01 Jan 1970/m); assert.match(writes, /_ga_K34TWL28XS=;expires=/); assert.ok(!/session=/.test(writes), 'other cookies untouched');
  b.sb.iiTrack('pioneer_email_verified'); assert.equal(b.layer().filter((a) => a[1] === 'pioneer_email_verified').length, 0);
  assert.ok(b.layer().length >= before);
});

test('stored choices are honoured without asking again; Global Privacy Control counts as Reject', () => {
  const g = boot({ stored: 'granted' }); assert.equal(g.el['#consent'].hidden, true); assert.equal(g.calls.scripts.length, 1);
  const d = boot({ stored: 'denied' }); assert.equal(d.el['#consent'].hidden, true); assert.deepEqual(d.calls.scripts, []);
  const p = boot({ gpc: true }); assert.equal(p.el['#consent'].hidden, true); assert.deepEqual(p.calls.scripts, []); assert.equal(p.sb.dataLayer, undefined);
});

test('dry-run mode (staging) runs the same flow but contacts Google never', () => {
  const b = boot({ mode: 'dry-run' }); b.click('accept');
  assert.deepEqual(b.calls.scripts, []);
  assert.ok(b.sb.__iiGa.some((a) => a[0] === 'event' && a[1] === 'page_view'));
});
