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
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, acceptDownloads: true });
  await ctx.addInitScript(() => { // record every certificate text drawn on the canvas
    window.__ct = [];
    const f = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__ct.push(String(t)); return f.call(this, t, ...a); };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
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
  ok(!donate.paypal && donate.text.includes('We have not yet established a separate international donation method. Please check back for updates.'), `${label} donate: no PayPal; approved international notice shown`);

  // 5. Charity selector: undecided + other pinned at the top, 9 categories, ~100 names, search filter.
  await page.goto(BASE + '/challenge/#join', { waitUntil: 'networkidle' });
  const sel = await page.evaluate(() => { const s = document.querySelector('#charity_select'); const o = [...s.options]; return { first: o.slice(0, 3).map((x) => x.textContent), groups: s.querySelectorAll('optgroup').length, named: s.querySelectorAll('optgroup option').length }; });
  ok(sel.first[0] === 'Choose a charity…' && sel.first[1] === UNDECIDED && sel.first[2] === OTHER, `${label} form: placeholder, then the undecided option, then "Another charity" at the very top`);
  ok(sel.groups === 9 && sel.named >= 95, `${label} form: ${sel.named} charities in ${sel.groups} categories`);
  await page.fill('#charity_search', 'red cross');
  const filtered = await page.evaluate(() => [...document.querySelectorAll('#charity_select option')].map((o) => o.textContent));
  ok(filtered.includes('American Red Cross') && !filtered.includes('Feeding America') && filtered.includes(UNDECIDED) && filtered.includes(OTHER), `${label} form: search narrows the list but keeps the two special choices`);
  await page.fill('#charity_search', '');
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
  await page.click('#submit-btn');
  await page.waitForSelector('#success:not([hidden])');
  const pid = (await page.locator('#pid').innerText()).trim();
  ok(/^II-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(pid), `${label} success: confirmed Pioneer ID ${pid}`);
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
  await page.goto(link, { waitUntil: 'networkidle' });
  ok(page.url().includes('/challenge/') && (await page.locator('#verify-msg').innerText()).includes('verified'), `${label} verify: link confirms and returns to the Challenge page`);
  await page.goto(link, { waitUntil: 'networkidle' });
  ok((await page.locator('#verify-msg').innerText()).includes('not valid'), `${label} verify: replayed link is rejected`);
  errorsAll.push(...errors.map((e) => `${label}: ${e}`));
  await ctx.close();
}

// 8. The public registry: hidden below 20 (nothing leaked), revealed at exactly 20.
const post = (body, ip) => fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-client-ip': ip }, body: JSON.stringify(body) });
const seedBody = (i) => {
  const charity = i <= 6 ? ['Feeding America', 'feeding america', 'Feeding  America!', 'Feeding America', 'feeding america', 'Feeding America'][i - 1]
    : i <= 9 ? ['American Red Cross', 'Red Cross', 'The Red Cross'][i - 7]
    : i <= 12 ? null : i <= 14 ? ['Local Food Pantry', 'local food pantry.'][i - 13] : i === 15 ? 'UNICEF' : 'charity: water';
  return { idempotency_key: 'seed-key-' + String(i).padStart(10, '0') + 'abcd', consent_version: '2026-10-30', creator_name: 'Seed ' + i, email: `seed${i}@creatormail.dev`, country: ['US', 'CA', 'GB', 'KR', 'DE'][i % 5], pledge_date: new Date().toISOString().slice(0, 10), charity_status: charity ? 'selected' : 'undecided', charity: charity || undefined, pledge_confirmed: true, certificate_ack: true, privacy_preference: i % 2 ? 'anonymous' : 'public', general_email_opt_in: false, collaboration_interest: 'Not now', collaboration_types: [], collab_contact_opt_in: false, website: '', accounts: [{ platform: 'TikTok', handle: '@seed' + i, public_display_permission: false }] };
};
for (let i = 1; i <= 17; i++) { const r = await post(seedBody(i), `10.9.0.${i}`); if (r.status !== 201) { ok(false, `seed ${i} failed: ${r.status}`); break; } }
const hiddenText = await (await fetch(BASE + '/api/stats')).text();
ok(hiddenText === '{"visible":false}', 'registry at 19 genuine registrations: /api/stats reveals nothing (exactly {"visible":false})');
{
  const ctx = await browser.newContext({ viewport: SIZES.desktop }); const pg = await ctx.newPage();
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
  const ctx = await browser.newContext({ viewport: vp }); const pg = await ctx.newPage();
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

await browser.close(); stop();
ok(errorsAll.length === 0, `no console errors${errorsAll.length ? ' → ' + errorsAll.join(' | ') : ''}`);
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll browser checks passed');
process.exit(failed ? 1 : 0);
