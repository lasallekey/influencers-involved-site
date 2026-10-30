// Smoke test for a running staging (or local) site. Uses synthetic data only.
//   node scripts/smoke-staging.mjs https://<your-staging-url> [--email you@example.com]
// With --email, the verification message goes to that inbox so you can click the link yourself.
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) { console.error('Usage: node scripts/smoke-staging.mjs <base-url> [--email address]'); process.exit(2); }
const ei = process.argv.indexOf('--email');
const email = ei > 0 ? process.argv[ei + 1] : `smoke+${Date.now()}@example.invalid`;
let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failed++; };
const get = (p, init) => fetch(base + p, { redirect: 'manual', ...init });

for (const p of ['/', '/challenge/', '/about/', '/transparency/', '/donate/', '/contact/', '/privacy/']) {
  const r = await get(p); ok(r.status === 200, `page ${p} → ${r.status}`);
}
const home = await (await get('/')).text();
ok(home.includes('Staging preview') || base.includes('127.0.0.1'), 'staging banner is shown (so nobody mistakes it for the live site)');
const health = await (await get('/api/health')).json().catch(() => ({}));
ok(health.ok === true, '/api/health responds');
console.log(`INFO  email sending configured: ${health.email_configured ? 'yes' : 'no (pledges still work; verification emails are skipped)'}`);

const key = 'smoke' + Math.random().toString(36).slice(2) + Date.now().toString(36);
const body = { idempotency_key: key, consent_version: '2026-10-30', creator_name: 'Smoke Test Creator', email, country: 'US', pledge_date: new Date().toISOString().slice(0, 10), charity: 'Synthetic Test Charity', pledge_confirmed: true, certificate_ack: true, privacy_preference: 'anonymous', general_email_opt_in: false, collaboration_interest: 'Not now', collaboration_types: [], collab_contact_opt_in: false, website: '', accounts: [{ platform: 'YouTube', handle: '@smoke', profile_url: 'https://youtube.com/@smoke', public_display_permission: false }, { platform: 'Instagram', handle: 'smoke', profile_url: 'https://instagram.com/smoke', public_display_permission: false }] };
const post = (b) => get('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const r1 = await post(body); const j1 = await r1.json().catch(() => ({}));
ok(r1.status === 201 && /^II-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(j1.pioneer_id || ''), `registration saved → ${j1.pioneer_id || r1.status}`);
const r2 = await post(body); const j2 = await r2.json().catch(() => ({}));
ok(r2.status === 200 && j2.pioneer_id === j1.pioneer_id, 'retry with the same key returns the same Pioneer (no duplicate)');
const r3 = await post({ ...body, idempotency_key: key + 'x' });
ok(r3.status === 409, 'a second registration with the same email is refused');
const stats = await (await get('/api/stats')).json().catch(() => ({}));
ok(stats.unique_pioneers >= 1 && stats.participating_accounts >= 2, `aggregate stats respond (${stats.unique_pioneers} Pioneer(s), ${stats.participating_accounts} account(s))`);
const listing = await (await get('/api/pioneers')).text();
ok(!listing.includes(email) && !listing.includes('Smoke Test Creator'), 'public listing exposes no email and no anonymous Pioneer');
console.log(failed ? `\n${failed} check(s) FAILED` : '\nStaging smoke test passed');
process.exit(failed ? 1 : 0);
