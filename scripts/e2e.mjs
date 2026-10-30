// Browser end-to-end check against the local preview (npm run dev must be running; default http://127.0.0.1:8787).
// Uses synthetic data only. Writes screenshots to docs/screenshots/ when SHOTS=1.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
const SHOTS = process.env.SHOTS === '1';
if (SHOTS) mkdirSync(OUT, { recursive: true });

let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failed++; };
const PAGES = ['/', '/challenge/', '/about/', '/transparency/', '/donate/', '/contact/', '/privacy/'];
const SIZES = { desktop: { width: 1366, height: 900 }, mobile: { width: 390, height: 844 } };

const browser = await chromium.launch();
for (const [label, vp] of Object.entries(SIZES)) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  // 1. Every page: loads, no overflow, one h1, nav has 7 items, footer socials, screenshots.
  for (const p of PAGES) {
    const r = await page.goto(BASE + p, { waitUntil: 'networkidle' });
    const info = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, h1: document.querySelectorAll('h1').length, nav: document.querySelectorAll('#site-nav li').length, soc: [...document.querySelectorAll('.foot-social a')].map((a) => a.href) }));
    ok(r.status() === 200 && info.over <= 0 && info.h1 === 1 && info.nav === 7, `${label} ${p}: 200, no horizontal overflow, one h1, 7 nav items`);
    ok(info.soc.length === 3 && info.soc.every((u) => /facebook\.com\/InfluencersInvolved|instagram\.com\/influencersinvolved|linkedin\.com\/company\/influencersinvolved/.test(u)), `${label} ${p}: footer shows the three confirmed social links only`);
    if (SHOTS) await page.screenshot({ path: `${OUT}${label}-${p === '/' ? 'home' : p.replace(/\//g, '')}.jpg`, type: 'jpeg', quality: 72, fullPage: true });
  }

  // 2. Mobile menu behaves (keyboard accessible).
  if (label === 'mobile') {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const btn = page.locator('.menu-btn');
    ok(!(await page.locator('#site-nav').isVisible()), 'mobile: menu closed initially');
    await btn.focus(); await page.keyboard.press('Enter');
    ok((await btn.getAttribute('aria-expanded')) === 'true' && (await page.locator('#site-nav a:has-text("Privacy")').isVisible()), 'mobile: menu opens by keyboard and lists all seven pages incl. Privacy');
    await page.keyboard.press('Escape');
    ok(!(await page.locator('#site-nav').isVisible()), 'mobile: Escape closes the menu');
  }

  // 3. Donate: Zeffy active, PayPal absent, notice shown verbatim.
  await page.goto(BASE + '/donate/');
  const donate = await page.evaluate(() => ({ z: [...document.querySelectorAll('a')].filter((a) => a.href.includes('zeffy.com')).map((a) => a.href), paypal: /paypal/i.test(document.body.innerText), text: document.body.innerText }));
  ok(donate.z.length === 1 && donate.z[0] === 'https://www.zeffy.com/en-US/donation-form/support-influencers-involved', `${label} donate: Zeffy link exact`);
  ok(!donate.paypal && donate.text.includes('We have not yet established a separate international donation method. Please check back for updates.'), `${label} donate: no PayPal; approved international notice shown`);

  // 4. Full registration flow (desktop only for the writes; mobile validates UX).
  await page.goto(BASE + '/challenge/#join', { waitUntil: 'networkidle' });
  await page.click('#submit-btn');
  ok((await page.locator('#email-e').innerText()).length > 0 && (await page.locator('#creator_name').getAttribute('aria-invalid')) === 'true', `${label} form: empty submit shows inline errors`);
  if (SHOTS && label === 'desktop') await page.screenshot({ path: `${OUT}${label}-form-validation.jpg`, type: 'jpeg', quality: 72, fullPage: false });

  const email = `synthetic.${label}.${Date.now()}@example.test`;
  await page.fill('#creator_name', 'Synthetic Creator');
  await page.fill('#email', email);
  await page.selectOption('#charity_select', '__other__');
  await page.fill('#charity_other', 'Synthetic Community Food Bank');
  await page.selectOption('[data-f=platform]', 'YouTube');
  await page.fill('[data-f=handle]', '@synthetic');
  await page.fill('[data-f=url]', 'https://youtube.com/@synthetic');
  await page.click('#add-account');
  const second = page.locator('.account').nth(1);
  await second.locator('[data-f=platform]').selectOption('Instagram');
  await second.locator('[data-f=handle]').fill('synthetic');
  await second.locator('[data-f=url]').fill('https://instagram.com/synthetic');
  await page.check('input[name=privacy_preference][value=public]');
  await page.locator('.account').first().locator('[data-f=public]').check();
  await page.check('input[name=collaboration_interest][value=Maybe]');
  ok(await page.locator('#collab-sub').isVisible(), `${label} form: collaboration options appear for Maybe`);
  ok(!(await page.locator('#general_email_opt_in').isChecked()) && !(await page.locator('#collab_contact_opt_in').isChecked()), `${label} form: both email opt-ins unchecked by default`);
  await page.check('#pledge_confirm'); await page.check('#cert_ack');
  if (SHOTS && label === 'desktop') await page.screenshot({ path: `${OUT}${label}-form-filled.jpg`, type: 'jpeg', quality: 72, fullPage: true });
  await page.click('#submit-btn');
  await page.waitForSelector('#success:not([hidden])');
  const pid = (await page.locator('#pid').innerText()).trim();
  ok(/^II-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(pid), `${label} success: confirmed Pioneer ID ${pid}`);
  await page.waitForFunction(() => document.querySelector('#cert-download').href.startsWith('blob:'));
  if (SHOTS && label === 'desktop') await page.screenshot({ path: `${OUT}${label}-success-certificate.jpg`, type: 'jpeg', quality: 72, fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cert-download')]);
  ok(dl.suggestedFilename().endsWith('.png'), `${label} certificate: downloads as PNG`);

  // 5. Verification email → link → registry shows the verified, public Pioneer.
  const mails = await (await fetch(BASE + '/__dev/mail')).json();
  const mail = mails.filter((m) => m.to[0] === email).at(-1);
  ok(!!mail && /Verify your email: http/.test(mail.text) && !/optional emails you chose/.test(mail.text), `${label} email: verification message captured (no marketing link without opt-in)`);
  const link = /Verify your email: (\S+)/.exec(mail.text)[1];
  await page.goto(link, { waitUntil: 'networkidle' });
  ok(page.url().includes('/challenge/') && (await page.locator('#verify-msg').innerText()).includes('verified'), `${label} verify: link confirms and returns to the Challenge page`);
  await page.goto(link, { waitUntil: 'networkidle' });
  ok((await page.locator('#verify-msg').innerText()).includes('not valid'), `${label} verify: replayed link is rejected`);
  // Public reads are cached for 5 minutes by design, so check the registry from a fresh browser context.
  const fresh = await browser.newContext({ viewport: vp }); const reg = await fresh.newPage();
  await reg.goto(BASE + '/challenge/', { waitUntil: 'networkidle' });
  ok(await reg.locator('#pioneers').isVisible(), `${label} registry: section appears once real records exist`);
  const listed = await reg.locator('#profiles').innerText();
  ok(listed.includes('Synthetic Creator') && listed.includes('YouTube') && !listed.includes('Instagram') && !listed.includes('example.test'), `${label} registry: only the approved account is listed; email never shown`);
  if (SHOTS && label === 'desktop') { await reg.locator('#pioneers').scrollIntoViewIfNeeded(); await reg.screenshot({ path: `${OUT}${label}-registry.jpg`, type: 'jpeg', quality: 72 }); }
  await fresh.close();
  ok(errors.length === 0, `${label}: no console errors${errors.length ? ' → ' + errors.join(' | ') : ''}`);
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll browser checks passed');
process.exit(failed ? 1 : 0);
