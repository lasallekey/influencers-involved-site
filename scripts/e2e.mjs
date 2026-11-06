// Browser end-to-end check. Starts its own local preview server (fresh in-memory database, synthetic data only),
// so the exactly-20 registry threshold can be tested deterministically. SHOTS=1 writes screenshots to docs/screenshots/.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = Number(process.env.E2E_PORT || 8900 + Math.floor(Math.random() * 90));
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
const SHOTS = process.env.SHOTS === '1';
if (SHOTS) mkdirSync(OUT, { recursive: true });

const server = spawn('node', ['--disable-warning=ExperimentalWarning', 'scripts/dev-server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch {} };
process.on('exit', stop);
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }

let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failed++; };
const PAGES = ['/', '/challenge/', '/about/', '/transparency/', '/donate/', '/contact/', '/privacy/'];
const SIZES = { desktop: { width: 1366, height: 900 }, mobile: { width: 390, height: 844 } };
const ZEFFY = 'https://www.zeffy.com/en-US/donation-form/support-influencers-involved';
const UNDECIDED = "I haven't chosen a charity yet — I'll decide later.";
const OTHER = 'Another charity — let me enter its name.';

const browser = await chromium.launch();
const errorsAll = [];

for (const [label, vp] of Object.entries(SIZES)) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, acceptDownloads: true }); await ctx.addInitScript(() => { try { localStorage.setItem('ii_consent', 'denied'); } catch {} }); // existing flows run with analytics rejected (the banner is tested separately below)
  await ctx.addInitScript(() => { // record every certificate text drawn on the canvas
    window.__ct = [];
    const f = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__ct.push(String(t)); return f.call(this, t, ...a); };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (409|400)/.test(m.text())) errors.push(m.text()); }); // 409/400 = a replayed verification link and a rejected hidden-field submission, both on purpose
  page.on('pageerror', (e) => errors.push(String(e)));

  // 1. Every page: loads, no overflow, one h1, nav of 7, footer socials, no leadership names.
  for (const p of PAGES) {
    const r = await page.goto(BASE + p, { waitUntil: 'networkidle' });
    const info = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, h1: document.querySelectorAll('h1').length, nav: document.querySelectorAll('#site-nav li').length, soc: [...document.querySelectorAll('.foot-social a')].map((a) => a.href), text: document.body.innerText }));
    ok(r.status() === 200 && info.over <= 0 && info.h1 === 1 && info.nav === 7, `${label} ${p}: 200, no horizontal overflow, one h1, 7 nav items`);
    ok(info.soc.length === 3 && info.soc.every((u) => /facebook\.com\/InfluencersInvolved|instagram\.com\/influencersinvolved|linkedin\.com\/company\/influencersinvolved/.test(u)), `${label} ${p}: footer shows the three confirmed social links only`);
    ok(!/Ho Chung|Johnny Kang|Sung Chul|people behind it/i.test(info.text), `${label} ${p}: no public leadership names or titles`);
    if (SHOTS) await page.screenshot({ path: `${OUT}${label}-${p === '/' ? 'home' : p.replace(/\//g, '')}.jpg`, type: 'jpeg', quality: 72, fullPage: true });
  }
  await page.goto(BASE + '/about/');
  ok((await page.locator('.facts').innerText()).includes('39-2242545') && (await page.locator('body').innerText()).includes('grants@influencersinvolved.org'), `${label} about: legal facts, EIN and contact email remain`);

  // 2. Homepage phone illustration: complete, tilted, and held by the hand (final animated state).
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  const ph = await page.evaluate(() => { const svg = document.querySelector('.scene svg'); const phone = svg.querySelector('.phone-tilt rect'); const hand = svg.querySelectorAll('circle.sv-skin')[0]; const pb = phone.getBoundingClientRect(), sb = svg.getBoundingClientRect(), hb = hand.getBoundingClientRect(); return { inside: pb.left >= sb.left - 1 && pb.right <= sb.right + 1 && pb.top >= sb.top - 1 && pb.bottom <= sb.bottom + 1, touch: hb.right > pb.left && hb.left < pb.right && hb.bottom > pb.bottom - 40 && hb.top < pb.bottom, tilt: document.querySelector('.scene .prop').parentNode && getComputedStyle(document.querySelector('.scene .prop')).transform };
  });
  ok(ph.inside, `${label} home: the whole phone is inside the illustration (not cropped)`);
  ok(ph.touch, `${label} home: the hand overlaps the phone's lower edge (connected)`);
  if (SHOTS && label === 'desktop') await page.locator('.scene').screenshot({ path: `${OUT}${label}-home-phone.jpg`, type: 'jpeg', quality: 80 });

  // 3. Mobile menu behaves (keyboard accessible).
  if (label === 'mobile') {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const btn = page.locator('.menu-btn');
    ok(!(await page.locator('#site-nav').isVisible()), 'mobile: menu closed initially');
    await btn.focus(); await page.keyboard.press('Enter');
    ok((await btn.getAttribute('aria-expanded')) === 'true' && (await page.locator('#site-nav a:has-text("Privacy")').isVisible()), 'mobile: menu opens by keyboard and lists all seven pages incl. Privacy');
    await page.keyboard.press('Escape');
    ok(!(await page.locator('#site-nav').isVisible()), 'mobile: Escape closes the menu');
  }

  // 4. Donate: Zeffy active, PayPal absent, notice verbatim.
  await page.goto(BASE + '/donate/');
  const donate = await page.evaluate(() => ({ z: [...document.querySelectorAll('a')].filter((a) => a.href.includes('zeffy.com')).map((a) => a.href), paypal: /paypal/i.test(document.body.innerText), text: document.body.innerText }));
  ok(donate.z.length >= 1 && donate.z.every((u) => u === ZEFFY), `${label} donate: ${donate.z.length} Zeffy button(s), all exact`);
  const need = ['U.S. & International Donations', 'Support Influencers Involved from the United States or abroad. Donate securely by card through Zeffy.', '100% of your intended donation goes to Influencers Involved, with no platform or processing fees deducted by Zeffy. A separate optional contribution to Zeffy may be offered at checkout.', 'Donations are processed in U.S. dollars (USD). Your bank may apply currency conversion or foreign transaction fees. Card availability may vary by country.'];
  ok(need.every((x) => donate.text.includes(x)), `${label} donate: corrected U.S. & international wording (heading, description, fee explanation, USD note) shown verbatim`);
  ok(!/have not yet established/i.test(donate.text) && !donate.paypal && !/donorbox|\bstripe\b/i.test(donate.text), `${label} donate: old notice gone; no PayPal, Donorbox or Stripe`);
  const providers = await page.evaluate(() => [...document.querySelectorAll('a[href^="http"]')].map((a) => new URL(a.href).hostname).filter((h) => !/(^|\.)(facebook|instagram|linkedin)\.com$/.test(h)));
  ok(providers.length > 0 && providers.every((h) => h.endsWith('zeffy.com')), `${label} donate: Zeffy is the only external donation destination`);

  // 5. Charity selector: undecided + other pinned at the top, 9 categories, ~100 names; no search field.
  await page.goto(BASE + '/challenge/#join', { waitUntil: 'networkidle' });
  const sel = await page.evaluate(() => { const s = document.querySelector('#charity_select'); const o = [...s.options]; return { first: o.slice(0, 3).map((x) => x.textContent), groups: s.querySelectorAll('optgroup').length, named: s.querySelectorAll('optgroup option').length }; });
  ok(sel.first[0] === 'Choose a charity…' && sel.first[1] === UNDECIDED && sel.first[2] === OTHER, `${label} form: placeholder, then the undecided option, then "Another charity" at the very top`);
  ok(sel.groups === 9 && sel.named >= 95, `${label} form: ${sel.named} charities in ${sel.groups} categories`);
  ok((await page.locator('#charity_search, #charity-count, input[type=search]').count()) === 0 && (await page.locator('.charity-field input').count()) === 0, `${label} form: no separate charity search field (only the native dropdown)`);
  await page.click('#submit-btn');
  ok((await page.locator('#email-e').innerText()).length > 0 && (await page.locator('#creator_name').getAttribute('aria-invalid')) === 'true', `${label} form: empty submit shows inline errors`);
  ok((await page.locator('#charity_select-e').innerText()).length > 0, `${label} form: a missing charity choice is flagged`);

  // 6. Registration. Desktop: typed charity + one URL left blank. Mobile: "not chosen yet".
  const email = `synthetic.${label}.${Date.now()}@creatormail.dev`;
  await page.fill('#creator_name', 'Synthetic Creator');
  await page.fill('#email', email);
  if (label === 'desktop') { await page.selectOption('#charity_select', '__other__'); await page.fill('#charity_other', 'Synthetic Community Food Bank'); }
  else { await page.selectOption('#charity_select', '__undecided__'); ok(await page.locator('#charity-undecided-note').isVisible() && !(await page.locator('#charity-other-field').isVisible()), 'mobile form: the undecided note shows, and no charity name is asked for'); }
  await page.selectOption('[data-f=platform]', 'YouTube');
  await page.fill('[data-f=handle]', '@synthetic-' + label);
  await page.fill('[data-f=url]', 'https://youtube.com/@synthetic-' + label);
  await page.click('#add-account');
  const second = page.locator('.account').nth(1);
  await second.locator('[data-f=platform]').selectOption('Instagram');
  await second.locator('[data-f=handle]').fill('synthetic-' + label);
  await second.locator('[data-f=url]').fill('not a url');
  await page.check('#pledge_confirm'); await page.check('#cert_ack'); await page.check('input[name=privacy_preference][value=public]');
  await page.click('#submit-btn');
  ok((await page.locator('#url2-e').innerText()).includes('https://'), `${label} form: a typed profile URL is validated`);
  await second.locator('[data-f=url]').fill('');
  ok((await page.locator('#url2-e').innerText()) === '', `${label} form: clearing the optional URL clears the error`);
  await page.locator('.account').first().locator('[data-f=public]').check();
  await second.locator('[data-f=public]').check();
  await page.check('input[name=collaboration_interest][value=Maybe]');
  ok(await page.locator('#collab-sub').isVisible(), `${label} form: collaboration options appear for Maybe`);
  ok(!(await page.locator('#general_email_opt_in').isChecked()) && !(await page.locator('#collab_contact_opt_in').isChecked()), `${label} form: both email opt-ins unchecked by default`);
  if (SHOTS && label === 'desktop') await page.screenshot({ path: `${OUT}${label}-form-filled.jpg`, type: 'jpeg', quality: 72, fullPage: true });
  if (label === 'desktop') { // a filled hidden anti-spam field must never produce a Pioneer ID or certificate
    await page.evaluate(() => { document.querySelector('input[name=ii_extra_note]').value = 'autofilled'; });
    await page.click('#submit-btn'); await page.locator('#form-error:not([hidden])').waitFor();
    ok(!(await page.locator('#success').isVisible()) && (await page.locator('#form-error-msg').innerText()).includes('certificate has not been issued'), 'desktop form: a rejected submission shows an error and never a Pioneer ID or certificate');
    await page.evaluate(() => { document.querySelector('input[name=ii_extra_note]').value = ''; });
  }
  await page.click('#submit-btn');
  await page.waitForSelector('#success:not([hidden])');
  const pid = (await page.locator('#pid').innerText()).trim();
  ok(/^II-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(pid), `${label} success: confirmed Pioneer ID ${pid}`);
  // Success page order: confirmation → two action choices → invitation → certificate → reminders; nothing prewritten.
  {
    const su = await page.evaluate(() => {
      const q = (s) => document.querySelector(s), top = (el) => el.getBoundingClientRect().top + scrollY;
      const opts = [...document.querySelectorAll('.next-opt')];
      return { h2: q('#success h2').textContent, focused: document.activeElement && document.activeElement.id, nOpts: opts.length, optTitles: opts.map((o) => o.querySelector('h4').textContent), both: q('.next-both').textContent, note: q('.next-note').textContent,
        y: { h2: top(q('#success h2')), opts: top(q('.next-actions')), invite: top(q('.invite')), certH: top(q('.cert-sec h3')), cert: top(q('#cert')), reminders: top(q('.reminders')), verify: top(q('#verify-line')) },
        mail: q('.invite a.btn').getAttribute('href'), sample: !!q('.sample-post') || /optional sample/i.test(q('#success').textContent), copyBtn: [...document.querySelectorAll('#success button')].some((b) => /copy/i.test(b.textContent)),
        hashtag: /#\w/.test(q('#success').textContent.replace(/Pioneer ID/g, '')), certHeading: q('.cert-sec h3').textContent, vh: innerHeight };
    });
    ok(su.h2 === 'You’re a Pioneer. Now inspire others.' && su.focused === 'success', `${label} success: new heading, and the success panel still receives focus`);
    ok(su.nOpts === 2 && su.optTitles.join('|') === 'Share your pledge|Champion a cause' && su.both === 'Or do both!' && su.note.startsWith('No scripts.'), `${label} success: two equal choices, "Or do both!", no third choice`);
    ok(su.y.h2 < su.y.opts && su.y.opts < su.y.invite && su.y.invite < su.y.certH && su.y.certH < su.y.cert && su.y.cert < su.y.reminders, `${label} success: order is confirmation → actions → invitation → certificate → reminders`);
    ok(su.mail === 'mailto:grants@influencersinvolved.org?subject=My%20post%20for%20the%201%25%20Influence%20Challenge' && su.certHeading === 'Your Pioneer Certificate', `${label} success: invitation links to grants@ by email only (no form); certificate heading present`);
    ok(!su.sample && !su.copyBtn && !su.hashtag, `${label} success: no sample post, no copy button, no prescribed hashtag`);
    ok((await page.locator('#success form, #success input').count()) === 0, `${label} success: no new submission form`);
    if (label === 'mobile') ok(su.y.cert - su.y.h2 < 1.6 * su.vh, `mobile success: certificate begins within about 1.5 screens (${Math.round(su.y.cert - su.y.h2)}px of ${su.vh}px)`);
    ok(/giving 1% of your creator income directly to your chosen charity/i.test(await page.locator('.reminders').innerText()) && (await page.locator('#verify-line').count()) === 1, `${label} success: direct-giving and verification reminders kept`);
    const seq = []; for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); seq.push(await page.evaluate(() => document.activeElement.id || (document.activeElement.closest('.invite') ? 'email-link' : document.activeElement.tagName))); }
    ok(seq.join(',') === 'email-link,cert-download,cert-print', `${label} success: keyboard order follows the page (email link → download → print); got ${seq}`);
    await page.locator('#success .link-btn').click(); await page.locator('.resend-msg:not(:empty)').waitFor();
    ok((await page.locator('.resend-msg').innerText()).length > 10, `${label} success: resend-verification control still works`);
    if (label === 'desktop') {
      const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#cert-print')]); await popup.waitForLoadState();
      ok((await popup.locator('img').getAttribute('src')).startsWith('data:image/png') && (await popup.title()) === 'Pioneer Pledge Certificate', 'desktop success: print opens the certificate image'); await popup.close();
    }
  }
  await page.waitForFunction(() => document.querySelector('#cert-download').href.startsWith('blob:'));
  const ct = await page.evaluate(() => window.__ct.join(' | '));
  if (label === 'desktop') {
    ok(ct.includes('for pledging 1% of creator income to') && ct.includes('Synthetic Community Food Bank') && !(await page.locator('#charity-later').isVisible()), 'desktop certificate: names the charity the creator typed');
  } else {
    ok(ct.includes('a charity they will choose') && !/undecided|haven't chosen|__/.test(ct) && !ct.includes('Synthetic Community'), 'mobile certificate: says "a charity they will choose" and never names a charity or shows the placeholder');
    ok(await page.locator('#charity-later').isVisible() && (await page.locator('#charity-later').innerText()).includes('grants@influencersinvolved.org'), 'mobile success: explains how to add the charity later');
  }
  ok(ct.includes('This certificate represents a pledge and is not a donation receipt or proof of payment.'), `${label} certificate: pledge-not-payment notice present`);
  if (SHOTS && label === 'desktop') await page.screenshot({ path: `${OUT}${label}-success-certificate.jpg`, type: 'jpeg', quality: 72, fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cert-download')]);
  ok(dl.suggestedFilename().endsWith('.png'), `${label} certificate: downloads as PNG`);

  // 7. Verification email → link → replay rejected.
  const mails = await (await fetch(BASE + '/__dev/mail')).json();
  const mail = mails.filter((m) => m.to[0] === email).at(-1);
  ok(!!mail && /Verify your email: http/.test(mail.text) && !/optional emails you chose/.test(mail.text), `${label} email: verification message captured (no marketing link without opt-in)`);
  const link = /Verify your email: (\S+)/.exec(mail.text)[1];
  ok(link.includes('/challenge/#verify='), `${label} verify: the email link opens the Challenge page with the token in the fragment`);
  // An email-link scanner only fetches the URL (and the redirect from any old-style link); neither may use up the token.
  await fetch(link); await fetch(BASE + '/api/verify?token=' + link.split('#verify=')[1], { redirect: 'manual' });
  await page.goto(link, { waitUntil: 'networkidle' }); await page.waitForFunction(() => !location.hash);
  ok(!page.url().includes('verify='), `${label} verify: the token is removed from the address bar`);
  ok(await page.locator('#verify-confirm').isVisible(), `${label} verify: page asks for an explicit "Confirm my email" click`);
  await page.click('#verify-confirm'); await page.locator('#verify-msg:has-text("verified")').waitFor();
  ok((await page.locator('#verify-msg').innerText()).includes('your email is verified'), `${label} verify: confirming after a scanner visit still works (single click, token not burned)`);
  await page.goto(link, { waitUntil: 'networkidle' }); await page.click('#verify-confirm');
  await page.locator('#verify-msg:has-text("already been used")').waitFor();
  ok(true, `${label} verify: replaying the link is rejected as already used`);
  errorsAll.push(...errors.map((e) => `${label}: ${e}`));
  await ctx.close();
}

// 8. The public registry: hidden below 20 (nothing leaked), revealed at exactly 20.
const post = (body, ip) => fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-client-ip': ip }, body: JSON.stringify(body) });
const seedBody = (i) => {
  const charity = i <= 6 ? ['Feeding America', 'feeding america', 'Feeding  America!', 'Feeding America', 'feeding america', 'Feeding America'][i - 1]
    : i <= 9 ? ['American Red Cross', 'Red Cross', 'The Red Cross'][i - 7]
    : i <= 12 ? null : i <= 14 ? ['Local Food Pantry', 'local food pantry.'][i - 13] : i === 15 ? 'UNICEF' : 'charity: water';
  return { idempotency_key: 'seed-key-' + String(i).padStart(10, '0') + 'abcd', consent_version: '2026-10-30', creator_name: 'Seed ' + i, email: `seed${i}@creatormail.dev`, country: ['US', 'CA', 'GB', 'KR', 'DE'][i % 5], pledge_date: new Date().toISOString().slice(0, 10), charity_status: charity ? 'selected' : 'undecided', charity: charity || undefined, pledge_confirmed: true, certificate_ack: true, privacy_preference: i % 2 ? 'anonymous' : 'public', general_email_opt_in: false, collaboration_interest: 'Not now', collaboration_types: [], collab_contact_opt_in: false, ii_extra_note: '', accounts: [{ platform: 'TikTok', handle: '@seed' + i, public_display_permission: false }] };
};
for (let i = 1; i <= 17; i++) { const r = await post(seedBody(i), `10.9.0.${i}`); if (r.status !== 201) { ok(false, `seed ${i} failed: ${r.status}`); break; } }
const hiddenText = await (await fetch(BASE + '/api/stats')).text();
ok(hiddenText === '{"visible":false}', 'registry at 19 genuine registrations: /api/stats reveals nothing (exactly {"visible":false})');
{
  const ctx = await browser.newContext({ viewport: SIZES.desktop }); await ctx.addInitScript(() => { try { localStorage.setItem('ii_consent', 'denied'); } catch {} }); const pg = await ctx.newPage();
  await pg.goto(BASE + '/challenge/', { waitUntil: 'networkidle' });
  ok(await pg.locator('#pioneers').isHidden() && !(await pg.locator('body').innerText()).includes('Our Pioneer Community') && !(await pg.locator('body').innerText()).includes('Pioneers Registered'), 'registry at 19: no dashboard, counter or empty state on the Challenge page');
  const home = await (await fetch(BASE + '/')).text();
  ok(!/Pioneers Registered|Our Pioneer Community/.test(home), 'homepage never shows a counter');
  await ctx.close();
}
{ const r = await post(seedBody(18), '10.9.0.18'); ok(r.status === 201, 'the 20th genuine registration is accepted'); }
const shown = await (await fetch(BASE + '/api/stats')).json();
ok(shown.visible === true && shown.pioneers === 20 && shown.social_accounts === 22 && shown.charities === 6 && shown.countries === 5, `registry at exactly 20: API reports ${JSON.stringify(shown)}`);

for (const [label, vp] of Object.entries(SIZES)) {
  const ctx = await browser.newContext({ viewport: vp }); await ctx.addInitScript(() => { try { localStorage.setItem('ii_consent', 'denied'); } catch {} }); const pg = await ctx.newPage();
  const errors = []; pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); pg.on('pageerror', (e) => errors.push(String(e)));
  await pg.goto(BASE + '/challenge/', { waitUntil: 'networkidle' });
  await pg.waitForSelector('#pioneers:not([hidden])');
  const txt = await pg.evaluate(() => ({ h: document.querySelector('#reg').textContent, labels: [...document.querySelectorAll('.community-stats li span')].map((s) => s.textContent), nums: [...document.querySelectorAll('.community-stats li strong')].map((s) => s.textContent) }));
  ok(txt.h === 'Our Pioneer Community', `${label} dashboard: titled "Our Pioneer Community"`);
  ok(JSON.stringify(txt.labels) === JSON.stringify(['Pioneers Registered', 'Social Accounts', 'Charities Selected', 'Countries Represented']), `${label} dashboard: exactly four metrics in the specified order`);
  ok(JSON.stringify(txt.nums) === JSON.stringify(['20', '22', '6', '5']), `${label} dashboard: figures ${txt.nums.join(' / ')} (accounts and charities de-duplicated; "not chosen yet" excluded)`);
  const geo = await pg.evaluate(() => { const lis = [...document.querySelectorAll('.community-stats li')].map((l) => l.getBoundingClientRect()); const sc = document.querySelector('.community-scroll'); return { tops: lis.map((r) => Math.round(r.top)), lefts: lis.map((r) => Math.round(r.left)), widths: lis.map((r) => Math.round(r.width)), scrollW: sc.scrollWidth, clientW: sc.clientWidth, focusable: sc.tabIndex === 0 && sc.getAttribute('role') === 'region', hint: getComputedStyle(document.querySelector('.swipe-hint')).display }; });
  ok(new Set(geo.tops).size === 1 && geo.lefts.every((l, i) => i === 0 || l > geo.lefts[i - 1]), `${label} dashboard: all four figures sit in ONE horizontal row`);
  if (label === 'desktop') {
    ok(geo.scrollW <= geo.clientW + 1, 'desktop dashboard: no sideways scrolling; four columns fit');
    ok(Math.max(...geo.widths) - Math.min(...geo.widths) <= 2, `desktop dashboard: four equal columns (${geo.widths.join(', ')}px)`);
  } else {
    ok(geo.scrollW > geo.clientW && geo.focusable && geo.hint === 'block', 'mobile dashboard: stays one row, scrolls sideways, region is keyboard-focusable, swipe hint shown');
    await pg.evaluate(() => { document.querySelector('.community-scroll').scrollLeft = 400; });
    const sl = await pg.evaluate(() => document.querySelector('.community-scroll').scrollLeft); ok(sl > 0, 'mobile dashboard: scrolls horizontally to reveal the remaining figures');
    await pg.evaluate(() => { document.querySelector('.community-scroll').scrollLeft = 0; });
  }
  const prof = await pg.evaluate(() => ({ names: [...document.querySelectorAll('#profiles li b')].map((b) => b.textContent), links: [...document.querySelectorAll('#profiles a')].map((a) => a.getAttribute('href')), plain: [...document.querySelectorAll('#profiles span')].map((s) => s.textContent) }));
  ok(prof.names.includes('Synthetic Creator') && prof.links.some((h) => h.startsWith('https://youtube.com/@synthetic-')) && prof.plain.some((t) => t.startsWith('Instagram · synthetic-')), `${label} dashboard: approved profiles listed; the account with no URL appears as plain text, never as a guessed link`);
  ok(!prof.names.some((n) => /^Seed (\d+)$/.test(n) && Number(n.split(' ')[1]) % 2 === 1), `${label} dashboard: anonymous Pioneers are never listed`);
  if (SHOTS) { await pg.locator('#pioneers').scrollIntoViewIfNeeded(); await pg.locator('#pioneers').screenshot({ path: `${OUT}${label}-dashboard.jpg`, type: 'jpeg', quality: 80 }); }
  errorsAll.push(...errors.map((e) => `${label} dashboard: ${e}`));
  await ctx.close();
}

// 9. Analytics consent (Google endpoints are intercepted and stubbed: nothing leaves this machine).
{
  const TOKEN_RE = /[A-Za-z0-9_-]{43}/;
  const watch = async (ctx) => {
    const hits = [];
    await ctx.route(/googletagmanager\.com|google-analytics\.com|analytics\.google\.com/, (route) => { hits.push(route.request().url()); route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }); });
    return hits;
  };
  const errors = [];
  // a. Fresh visitor: banner with two equally available choices; nothing contacts Google, no analytics cookie.
  let ctx = await browser.newContext({ viewport: SIZES.desktop }); let hits = await watch(ctx);
  let pg = await ctx.newPage(); pg.on('pageerror', (e) => errors.push(String(e)));
  await pg.goto(BASE + '/', { waitUntil: 'networkidle' });
  ok(await pg.locator('#consent').isVisible(), 'analytics: banner appears for a new visitor');
  const [rej, acc] = [pg.locator('[data-consent=reject]'), pg.locator('[data-consent=accept]')];
  const sty = (l) => l.evaluate((e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return [c.backgroundColor, c.color, c.borderTopColor, c.fontSize, c.fontWeight, Math.round(r.height)].join('|'); });
  ok((await rej.isVisible()) && (await acc.isVisible()) && (await sty(rej)) === (await sty(acc)), 'analytics: Reject and Accept are both visible and identically styled');
  ok(hits.length === 0 && !(await pg.evaluate(() => 'dataLayer' in window || typeof window.gtag === 'function')) && !(await ctx.cookies()).some((c) => c.name.startsWith('_ga')), 'analytics: before a choice nothing contacts Google, no gtag, no _ga cookie');
  ok((await pg.locator('script[src*="googletagmanager"]').count()) === 0, 'analytics: no Google script tag exists before consent');
  if (SHOTS) await pg.screenshot({ path: `${OUT}desktop-consent-banner.jpg`, type: 'jpeg', quality: 72 });
  // b. Reject: stays off across pages and reloads; footer control exists on all seven pages.
  await rej.click(); await pg.reload({ waitUntil: 'networkidle' });
  ok(!(await pg.locator('#consent').isVisible()) && hits.length === 0, 'analytics: Reject is remembered; still nothing sent after reload');
  for (const path of PAGES) { await pg.goto(BASE + path, { waitUntil: 'networkidle' }); ok((await pg.locator('[data-consent-open]').count()) === 1 && hits.length === 0, `analytics: "Cookie preferences" on ${path}; nothing sent`); }
  // c. Change of mind through the footer control, then Accept.
  await pg.locator('[data-consent-open]').click(); ok(await pg.locator('#consent').isVisible() && (await pg.locator('#consent-state').innerText()).includes('rejected'), 'analytics: footer control reopens the choice and shows the current state');
  await pg.locator('[data-consent=accept]').click(); await pg.waitForFunction(() => window.dataLayer && window.dataLayer.length > 2);
  ok(hits.some((u) => u.includes('gtag/js?id=G-K34TWL28XS')), 'analytics: Accept loads Google tag G-K34TWL28XS');
  let dl = await pg.evaluate(() => JSON.stringify(window.dataLayer.map((a) => Array.from(a))));
  ok(dl.includes('"page_view"') && dl.includes(BASE + '/privacy/') && !dl.includes('?') && !dl.includes('#'), 'analytics: page_view carries the clean page address only');
  // d. Withdraw: Reject removes GA cookies and stops sending.
  await ctx.addCookies([{ name: '_ga', value: 'GA1.1.1', url: BASE }, { name: '_ga_K34TWL28XS', value: 'GS1', url: BASE }, { name: 'keep', value: '1', url: BASE }]);
  await pg.locator('[data-consent-open]').click(); await pg.locator('[data-consent=reject]').click();
  const names = (await ctx.cookies()).map((c) => c.name);
  ok(!names.includes('_ga') && !names.includes('_ga_K34TWL28XS') && names.includes('keep') && (await pg.evaluate(() => window['ga-disable-G-K34TWL28XS'] === true)), 'analytics: withdrawing consent deletes the Google Analytics cookies, disables sending, leaves other cookies');
  await pg.locator('[data-consent-open]').click(); await pg.locator('[data-consent=accept]').click();
  ok(await pg.evaluate(() => window['ga-disable-G-K34TWL28XS'] === false && window.dataLayer.map((a) => Array.from(a)).filter((a) => a[0] === 'consent' && a[1] === 'update').map((a) => a[2].analytics_storage).join() === 'denied,granted'), 'analytics: Accept, Reject, Accept again on the same page restores GA4 consent and resumes sending');
  await ctx.close();

  // e. Registration + verification with analytics accepted: only allow-listed events; no personal data or token anywhere.
  ctx = await browser.newContext({ viewport: SIZES.desktop, extraHTTPHeaders: { 'x-dev-client-ip': '10.77.0.1' } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ii_consent', 'granted'); } catch {} }); hits = await watch(ctx);
  pg = await ctx.newPage(); pg.on('pageerror', (e) => errors.push(String(e)));
  const email = `analytics.person.${Date.now()}@creatormail.dev`, NAME = 'Analytics Person';
  await pg.goto(BASE + '/challenge/#join', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => window.dataLayer && window.dataLayer.length > 2);
  const evNames = () => pg.evaluate(() => window.dataLayer.map((a) => Array.from(a)).filter((a) => a[0] === 'event').map((a) => a[1]));
  ok(!(await evNames()).some((n) => n.startsWith('pioneer')), 'analytics: opening the registration page is NOT a conversion');
  await pg.fill('#creator_name', NAME); await pg.fill('#email', email);
  ok((await evNames()).includes('pioneer_form_start') && !(await evNames()).includes('pioneer_registered'), 'analytics: first interaction records form start (not a conversion)');
  await pg.selectOption('#charity_select', '__undecided__'); await pg.selectOption('[data-f=platform]', 'YouTube'); await pg.fill('[data-f=handle]', '@analytics-person');
  await pg.check('#pledge_confirm'); await pg.check('#cert_ack'); await pg.check('input[name=privacy_preference][value=public]');
  await pg.click('#submit-btn'); await pg.waitForSelector('#success:not([hidden])');
  const pid = (await pg.locator('#pid').innerText()).trim();
  await pg.waitForFunction(() => document.querySelector('#cert-download').href.startsWith('blob:'));
  await Promise.all([pg.waitForEvent('download'), pg.click('#cert-download')]);
  const reg = await pg.evaluate(() => window.dataLayer.map((a) => Array.from(a)).filter((a) => a[1] === 'pioneer_registered'));
  ok(reg.length === 1 && reg[0][2].account_count === 1 && reg[0][2].charity_status === 'undecided', 'analytics: a saved registration records exactly one pioneer_registered with counts only');
  ok((await evNames()).includes('certificate_download'), 'analytics: certificate download recorded');
  // verification: open the emailed link in the same consented browser
  const mails = await (await fetch(BASE + '/__dev/mail')).json();
  const link = /Verify your email: (\S+)/.exec(mails.filter((m) => m.to[0] === email).at(-1).text)[1]; const tok = decodeURIComponent(link.split('#verify=')[1]);
  await pg.goto(link, { waitUntil: 'networkidle' }); await pg.waitForFunction(() => !location.hash);
  await pg.waitForSelector('#verify-confirm:not([hidden])'); await pg.click('#verify-confirm'); await pg.locator('#verify-msg:has-text("verified")').waitFor();
  ok((await evNames()).includes('pioneer_email_verified'), 'analytics: confirmed email recorded as pioneer_email_verified');
  dl = await pg.evaluate(() => JSON.stringify(window.dataLayer.map((a) => Array.from(a))));
  const leaks = [email, email.split('@')[0], NAME, 'Analytics', pid, tok, '#verify', 'verify=', 'II-'].filter((x) => dl.includes(x) || hits.some((u) => u.includes(x)));
  ok(leaks.length === 0 && !hits.some((u) => TOKEN_RE.test(decodeURIComponent(u).replace(/G-K34TWL28XS|gtag\/js/g, ''))), `analytics: no email, name, Pioneer ID or verification token reaches Google${leaks.length ? ' → LEAK ' + leaks : ''}`);
  ok(dl.includes('pioneer_registered') && dl.includes('pioneer_email_verified') && !/page_location":"[^"]*[?#]/.test(dl), 'analytics: every page_location is a clean address (no ? or #)');
  // verification page itself: even the very first page_view for the token URL is clean
  const ctx2 = await browser.newContext({ viewport: SIZES.desktop }); await ctx2.addInitScript(() => { try { localStorage.setItem('ii_consent', 'granted'); } catch {} }); const hits2 = await watch(ctx2);
  const p2 = await ctx2.newPage(); await p2.goto(BASE + '/challenge/#verify=' + 'Z'.repeat(43), { waitUntil: 'networkidle' }); await p2.waitForFunction(() => window.dataLayer && window.dataLayer.length > 2);
  const dl2 = await p2.evaluate(() => JSON.stringify(window.dataLayer.map((a) => Array.from(a))));
  ok(!dl2.includes('ZZZZ') && !hits2.some((u) => u.includes('ZZZZ')) && dl2.includes(BASE + '/challenge/'), 'analytics: a verification-token URL is never sent, in any form');
  await ctx2.close(); await ctx.close();
  errorsAll.push(...errors.map((e) => `analytics: ${e}`));
}

await browser.close(); stop();
ok(errorsAll.length === 0, `no console errors${errorsAll.length ? ' → ' + errorsAll.join(' | ') : ''}`);
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll browser checks passed');
process.exit(failed ? 1 : 0);
