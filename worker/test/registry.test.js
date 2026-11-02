import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { createMigratedD1 } from '../dev/d1-sqlite.js';
import { sha256Hex } from '../src/util.js';

const SITE = 'https://staging.example.test';
let env, sent, realFetch;
const ctx = { pending: [], waitUntil(p) { this.pending.push(p); } };
const settle = async () => { await Promise.all(ctx.pending.splice(0)); };

function mkEnv(over = {}) {
  return { DB: createMigratedD1(), SITE_URL: SITE, ALLOWED_ORIGINS: '', TOKEN_SECRET: 'test-secret', EMAIL_API_KEY: 'k_test', EMAIL_FROM: 'II <grants@influencersinvolved.org>', EMAIL_API_URL: 'https://mail.example.test/send', ...over };
}
beforeEach(() => {
  env = mkEnv(); sent = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://mail.example.test')) { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
    throw new Error('unexpected network call ' + u);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

let n = 0, ipn = 0;
const nextIp = () => { ipn++; return `10.${(ipn >> 8) & 255}.${ipn & 255}.7`; };
const key = () => 'key-' + String(++n).padStart(12, '0') + 'abcdef';
const good = (o = {}) => ({
  idempotency_key: key(), consent_version: '2026-10-30', creator_name: 'Test Creator', email: `person${n}@creatormail.dev`, country: 'US', pledge_date: new Date().toISOString().slice(0, 10),
  charity_status: 'selected', charity: 'Feeding America', pledge_confirmed: true, certificate_ack: true, privacy_preference: 'public', general_email_opt_in: false,
  collaboration_interest: 'Not now', collaboration_types: [], collab_contact_opt_in: false, website: '',
  accounts: [{ platform: 'YouTube', handle: '@testcreator', profile_url: 'https://youtube.com/@testcreator', public_display_permission: true }], ...o,
});
const call = (path, { method = 'GET', body, headers = {}, ip } = {}) =>
  worker.fetch(new Request(SITE + path, { method, headers: { 'CF-Connecting-IP': ip || nextIp(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }), env, ctx);
const register = (b, o) => call('/api/register', { method: 'POST', body: b, ...o });
const q = (sql, ...p) => env.DB.raw.prepare(sql).all(...p);

test('registers one Pioneer with all accounts atomically and returns a certificate view', async () => {
  const res = await register(good({ accounts: [
    { platform: 'YouTube', handle: '@a', profile_url: 'https://youtube.com/@a', public_display_permission: true },
    { platform: 'Instagram', handle: 'a', profile_url: 'https://instagram.com/a', public_display_permission: false },
    { platform: 'TikTok', handle: '@a', profile_url: 'https://tiktok.com/@a', public_display_permission: true },
  ] }));
  assert.equal(res.status, 201);
  const b = await res.json();
  assert.match(b.pioneer_id, /^II-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(b.display_name, 'Test Creator');
  assert.equal(q('SELECT COUNT(*) n FROM pioneers')[0].n, 1);
  assert.equal(q('SELECT COUNT(*) n FROM social_accounts')[0].n, 3);
  assert.equal(q('SELECT email_verification_status s FROM pioneers')[0].s, 'Pending');
  await settle();
  assert.equal(sent.length, 1);
});

test('failed validation stores nothing and issues no ID', async () => {
  const res = await register(good({ email: 'not-an-email' }));
  assert.equal(res.status, 400);
  const b = await res.json();
  assert.equal(b.ok, false); assert.ok(b.fields.email); assert.equal(b.pioneer_id, undefined);
  assert.equal(q('SELECT COUNT(*) n FROM pioneers')[0].n, 0);
});

test('database failure mid-transaction rolls back the whole registration', async () => {
  // A second account with a platform value that violates nothing at validation but we force a DB error via a trigger.
  env.DB.raw.exec(`CREATE TRIGGER boom BEFORE INSERT ON social_accounts WHEN NEW.platform = 'TikTok' BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
  const res = await register(good({ accounts: [
    { platform: 'YouTube', handle: '@a', profile_url: 'https://youtube.com/@a', public_display_permission: false },
    { platform: 'TikTok', handle: '@a', profile_url: 'https://tiktok.com/@a', public_display_permission: false },
  ] }));
  assert.equal(res.status, 500);
  const b = await res.json(); assert.equal(b.ok, false); assert.equal(b.pioneer_id, undefined);
  assert.equal(q('SELECT COUNT(*) n FROM pioneers')[0].n, 0);
  assert.equal(q('SELECT COUNT(*) n FROM social_accounts')[0].n, 0);
  assert.equal(q('SELECT COUNT(*) n FROM email_verifications')[0].n, 0);
});

test('idempotent retry returns the same Pioneer and creates no duplicate or second email', async () => {
  const body = good();
  const r1 = await register(body); const b1 = await r1.json(); await settle();
  const r2 = await register(body); const b2 = await r2.json(); await settle();
  assert.equal(r1.status, 201); assert.equal(r2.status, 200);
  assert.equal(b1.pioneer_id, b2.pioneer_id);
  assert.equal(q('SELECT COUNT(*) n FROM pioneers')[0].n, 1);
  assert.equal(sent.length, 1);
});

test('a different attempt for an already-registered email is refused', async () => {
  const first = good(); await register(first);
  const dup = good({ email: first.email.toUpperCase() });
  const res = await register(dup);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'email_registered');
  assert.equal(q('SELECT COUNT(*) n FROM pioneers')[0].n, 1);
});

test('anonymous overrides account public flags; certificate name is privacy-safe', async () => {
  const res = await register(good({ privacy_preference: 'anonymous' }));
  const b = await res.json();
  assert.equal(b.display_name, 'Anonymous Pioneer');
  assert.equal(q('SELECT public_display_permission p FROM social_accounts')[0].p, 0);
});

test('consents default off; Yes/Maybe alone is never a contact opt-in; Not now clears types', async () => {
  await register(good({ collaboration_interest: 'Maybe', collaboration_types: ['content', 'bogus'] }));
  let r = q('SELECT * FROM pioneers')[0];
  assert.equal(r.general_email_opt_in, 0); assert.equal(r.collab_contact_opt_in, 0);
  assert.deepEqual(JSON.parse(r.collaboration_types), ['content']);
  await register(good({ collaboration_interest: 'Not now', collaboration_types: ['content'], collab_contact_opt_in: true }));
  r = q('SELECT * FROM pioneers ORDER BY id DESC')[0];
  assert.equal(r.collab_contact_opt_in, 0); assert.equal(r.collaboration_types, '[]');
  await register(good({ general_email_opt_in: 'yes' })); // truthy but not boolean true
  assert.equal(q('SELECT * FROM pioneers ORDER BY id DESC')[0].general_email_opt_in, 0);
  await register(good({ general_email_opt_in: true, collaboration_interest: 'Yes', collab_contact_opt_in: true }));
  r = q('SELECT * FROM pioneers ORDER BY id DESC')[0];
  assert.equal(r.general_email_opt_in, 1); assert.equal(r.collab_contact_opt_in, 1); assert.ok(r.general_opt_in_at && r.collab_opt_in_at && r.consent_version);
});

test('rejects unsafe URLs, too many accounts, bad dates and unsupported platforms', async () => {
  for (const bad of ['javascript:alert(1)', 'http://youtube.com/@a', 'https://user:pw@youtube.com/a', 'https://localhost/a', 'data:text/html,hi']) {
    const res = await register(good({ accounts: [{ platform: 'YouTube', handle: 'a', profile_url: bad, public_display_permission: false }] }));
    assert.equal(res.status, 400, bad);
  }
  const many = Array.from({ length: 11 }, (_, i) => ({ platform: 'Other', handle: 'h' + i, profile_url: `https://example.test/${i}`, public_display_permission: false }));
  assert.equal((await register(good({ accounts: many }))).status, 400);
  assert.equal((await register(good({ pledge_date: '2999-01-01' }))).status, 400);
  assert.equal((await register(good({ pledge_date: '2026-02-31' }))).status, 400);
  assert.equal((await register(good({ accounts: [{ platform: 'Myspace', handle: 'a', profile_url: 'https://example.test/a' }] }))).status, 400);
  assert.equal((await register(good({ pledge_confirmed: false }))).status, 400);
  assert.equal((await register(good({ certificate_ack: undefined }))).status, 400);
  assert.equal(q('SELECT COUNT(*) n FROM pioneers')[0].n, 0);
});

test('normalizes country spellings to one stored ISO code', async () => {
  for (const c of ['US', 'USA', 'U.S.', 'United States', 'united states']) await register(good({ country: c }));
  assert.deepEqual(q('SELECT DISTINCT country c FROM pioneers').map((r) => r.c), ['US']);
  assert.equal((await register(good({ country: 'Atlantis' }))).status, 400);
});

test('HTML in names is stored as inert text and control characters are stripped', async () => {
  await register(good({ creator_name: '  <img src=x onerror=1>‮  Bob\n' }));
  const r = q('SELECT creator_name n FROM pioneers')[0].n;
  assert.ok(!/[‮\n]/.test(r)); assert.equal(r, '<img src=x onerror=1> Bob');
});

test('honeypot submissions get a decoy reply and store nothing', async () => {
  const res = await register(good({ website: 'http://spam.test' }));
  assert.equal(res.status, 201);
  assert.equal(q('SELECT COUNT(*) n FROM pioneers')[0].n, 0);
});

test('register is rate limited per client and does not store the raw address', async () => {
  let last;
  for (let i = 0; i < 12; i++) last = await register(good({ email: `rl${i}@example.test` }), { ip: '198.51.100.7' });
  assert.equal(last.status, 429);
  assert.equal((await register(good(), { ip: '198.51.100.8' })).status, 201);
  const buckets = q('SELECT bucket FROM rate_limits').map((r) => r.bucket).join(' ');
  assert.ok(!buckets.includes('198.51.100'));
});

test('rejects non-JSON, oversized and cross-origin writes', async () => {
  assert.equal((await worker.fetch(new Request(SITE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' }), env, ctx)).status, 415);
  assert.equal((await register({ pad: 'x'.repeat(30000) })).status, 413);
  const evil = await call('/api/register', { method: 'POST', body: good(), headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const ok = await call('/api/register', { method: 'POST', body: good(), headers: { Origin: SITE } });
  assert.equal(ok.status, 201); assert.equal(ok.headers.get('Access-Control-Allow-Origin'), SITE);
});

/* ---- email verification ---- */

async function registerAndToken(over = {}) {
  const body = good(over);
  const b = await (await register(body)).json(); await settle();
  const link = /Verify your email: (\S+)/.exec(sent.at(-1).text)[1];
  return { body, b, link, token: new URL(link).searchParams.get('token') };
}

test('verification email goes out after commit; only a hash of the token is stored', async () => {
  const { link, token, b } = await registerAndToken();
  assert.ok(link.startsWith(SITE + '/api/verify?token='));
  const row = q('SELECT * FROM email_verifications')[0];
  assert.equal(row.pioneer_id, b.pioneer_id); assert.equal(row.token_hash, await sha256Hex(token)); assert.notEqual(row.token_hash, token);
  assert.equal(row.send_status, 'sent');
  assert.ok(!JSON.stringify(q('SELECT * FROM email_verifications')).includes(token));
});

test('valid token verifies once; replay, unknown and malformed tokens do not', async () => {
  const { token } = await registerAndToken();
  const ok = await call('/api/verify?token=' + token);
  assert.equal(ok.status, 302); assert.equal(ok.headers.get('Location'), SITE + '/challenge/?verify=ok');
  const p = q('SELECT email_verification_status s, email_verified_at t FROM pioneers')[0];
  assert.equal(p.s, 'Verified'); assert.ok(p.t);
  const replay = await call('/api/verify?token=' + token);
  assert.ok(replay.headers.get('Location').endsWith('verify=invalid'));
  assert.ok((await call('/api/verify?token=' + 'A'.repeat(43))).headers.get('Location').endsWith('verify=invalid'));
  assert.ok((await call('/api/verify?token=short')).headers.get('Location').endsWith('verify=invalid'));
});

test('expired token does not verify and the pledge stays valid', async () => {
  const { token } = await registerAndToken();
  env.DB.raw.exec(`UPDATE email_verifications SET expires_at = '2020-01-01T00:00:00.000Z'`);
  const r = await call('/api/verify?token=' + token);
  assert.ok(r.headers.get('Location').endsWith('verify=expired'));
  const p = q('SELECT email_verification_status s, registration_status r FROM pioneers')[0];
  assert.equal(p.s, 'Pending'); assert.equal(p.r, 'Active');
});

test('email provider failure or missing configuration never fails the pledge', async () => {
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  const res = await register(good()); await settle();
  assert.equal(res.status, 201);
  assert.equal(q('SELECT send_status s FROM email_verifications')[0].s, 'failed');
  assert.equal(q('SELECT COUNT(*) n FROM pioneers')[0].n, 1);
  globalThis.fetch = async () => { throw new Error('network down'); };
  assert.equal((await register(good())).status, 201); await settle();
  env = mkEnv({ EMAIL_API_KEY: undefined });
  const r3 = await register(good()); const b3 = await r3.json();
  assert.equal(r3.status, 201); assert.equal(b3.email_status, 'not_configured');
});

test('a provider rejection is logged with its reason, redacted, and the pledge still succeeds', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ statusCode: 403, name: 'validation_error', message: 'You can only send testing emails to your own email address (owner@somewhere.org). Verify a domain at resend.com/domains to send to others.' }), { status: 403 });
  const logs = []; const orig = console.warn; console.warn = (...a) => logs.push(a.join(' '));
  let res; try { res = await register(good()); await settle(); } finally { console.warn = orig; }
  assert.equal(res.status, 201);
  const line = logs.find((l) => l.includes('email provider rejected')) || '';
  assert.ok(line.includes('403') && line.includes('validation_error') && line.includes('Verify a domain'), line);
  assert.ok(!line.includes('owner@somewhere.org') && line.includes('[email]'), 'addresses must be redacted: ' + line);
  assert.equal(q('SELECT send_status s FROM email_verifications')[0].s, 'failed');
});

test('resend is throttled, generic, and invalidates older links', async () => {
  const { body, token } = await registerAndToken();
  const a = await call('/api/resend-verification', { method: 'POST', body: { email: body.email } });
  const unknown = await call('/api/resend-verification', { method: 'POST', body: { email: 'nobody@example.test' } });
  assert.equal(a.status, 202); assert.equal(unknown.status, 202);
  assert.deepEqual(await a.json(), await unknown.json());
  await settle();
  assert.equal(sent.length, 1, 'inside the 5-minute gap no new email is sent');
  env.DB.raw.exec(`UPDATE email_verifications SET created_at = '2020-01-01T00:00:00.000Z'`);
  await call('/api/resend-verification', { method: 'POST', body: { email: body.email } }); await settle();
  assert.equal(sent.length, 2);
  const oldTry = await call('/api/verify?token=' + token);
  assert.ok(oldTry.headers.get('Location').endsWith('verify=expired') || oldTry.headers.get('Location').endsWith('verify=invalid'));
  const newToken = new URL(/Verify your email: (\S+)/.exec(sent[1].text)[1]).searchParams.get('token');
  assert.ok((await call('/api/verify?token=' + newToken)).headers.get('Location').endsWith('verify=ok'));
});

/* ---- optional email withdrawal ---- */

test('unsubscribe link withdraws both optional consents; forged links do nothing', async () => {
  const { b } = await registerAndToken({ general_email_opt_in: true, collaboration_interest: 'Yes', collab_contact_opt_in: true });
  const unsub = /Manage the optional emails you chose: (\S+)/.exec(sent.at(-1).text)[1];
  const forged = unsub.replace(/t=.*/, 't=' + '0'.repeat(40));
  assert.ok((await call(forged.replace(SITE, ''))).headers.get('Location').endsWith('unsubscribe=invalid'));
  assert.equal(q('SELECT general_email_opt_in g FROM pioneers')[0].g, 1);
  assert.ok((await call(unsub.replace(SITE, ''))).headers.get('Location').endsWith('unsubscribe=ok'));
  const r = q('SELECT * FROM pioneers WHERE pioneer_id = ?', b.pioneer_id)[0];
  assert.equal(r.general_email_opt_in, 0); assert.equal(r.collab_contact_opt_in, 0); assert.ok(r.optional_withdrawn_at);
});

/* ---- public reads ---- */

// ---- helpers for the exactly-20 registry rules ----
const seedOne = async (i, over = {}) => {
  const r = await register(good({ creator_name: 'Seed ' + i, email: `seed${i}@creatormail.dev`, accounts: [{ platform: 'YouTube', handle: '@seed' + i, profile_url: `https://youtube.com/@seed${i}`, public_display_permission: false }], ...over }));
  assert.equal(r.status, 201, 'seed ' + i + ' ' + (await r.clone().text()));
  return r.json();
};
const seed = async (n, mk = () => ({}), from = 1) => { for (let i = from; i < from + n; i++) await seedOne(i, mk(i)); };
const statsJson = async () => (await call('/api/stats')).json();

test('the public registry reveals nothing at 19 eligible registrations and appears at exactly 20', async () => {
  await seed(19);
  const r19 = await call('/api/stats'); const t19 = await r19.text();
  assert.equal(t19, '{"visible":false}', 'stats must expose no numbers before 20');
  assert.deepEqual(await (await call('/api/pioneers')).json(), { visible: false, pioneers: [] });
  await seedOne(20);
  const s = await statsJson();
  assert.equal(s.visible, true); assert.equal(s.pioneers, 20); assert.equal(s.social_accounts, 20); assert.equal(s.charities, 1); assert.equal(s.countries, 1);
  assert.deepEqual(Object.keys(s).sort(), ['charities', 'countries', 'pioneers', 'social_accounts', 'visible']);
});

test('withdrawals below 20 hide the registry again; a new registration restores it', async () => {
  await seed(20);
  assert.equal((await statsJson()).visible, true);
  env.DB.raw.exec(`UPDATE pioneers SET registration_status = 'Withdrawn' WHERE creator_name = 'Seed 7'`);
  assert.equal(await (await call('/api/stats')).text(), '{"visible":false}');
  assert.deepEqual(await (await call('/api/pioneers')).json(), { visible: false, pioneers: [] });
  await seedOne(21);
  assert.equal((await statsJson()).pioneers, 20);
});

test('automated and test registrations are flagged and never count toward 20', async () => {
  for (let i = 0; i < 12; i++) await seedOne(100 + i, { email: `smoke+${i}@creatormail.dev` });
  for (let i = 0; i < 12; i++) await seedOne(200 + i, { email: `tester${i}@example.invalid` });
  await seedOne(250, { email: 'owner+test1@creatormail.dev' }); await seedOne(251, { email: 'owner+Test2@creatormail.dev' });
  for (const d of ['example.com', 'foo.test', 'bar.example', 'site.localhost']) await seedOne(300 + d.length, { email: `x${d.length}@${d}` });
  assert.equal(q('SELECT COUNT(*) n FROM pioneers WHERE is_test = 1')[0].n, 30);
  await seed(19);
  assert.equal(await (await call('/api/stats')).text(), '{"visible":false}', '28 test + 19 genuine must still be hidden');
  await seedOne(20);
  assert.equal((await statsJson()).pioneers, 20);
});

test('anonymous and unverified registrations count in the totals but are never listed', async () => {
  await seed(20, (i) => (i % 2 ? { privacy_preference: 'anonymous' } : {}));
  const s = await statsJson(); assert.equal(s.pioneers, 20);
  assert.deepEqual((await (await call('/api/pioneers')).json()).pioneers, []);
});

test('dashboard figures: distinct accounts, normalized distinct charities (undecided excluded), distinct countries', async () => {
  const charityFor = (i) => {
    if (i <= 3) return { charity: ['Feeding America', 'feeding america', 'Feeding  America!'][i - 1] };
    if (i <= 5) return { charity: ['Doctors Without Borders', 'MSF'][i - 4] };
    if (i <= 7) return { charity: ['The Red Cross', 'American Red Cross'][i - 6] };
    if (i <= 11) return { charity_status: 'undecided', charity: undefined };
    if (i <= 13) return { charity: ['Local Food Pantry', 'local food pantry.'][i - 12] };
    if (i === 14) return { charity: 'Neighborhood Library Fund' };
    return { charity: 'UNICEF' };
  };
  const country = (i) => ['US', 'CA', 'GB', 'US', 'KR'][i % 5];
  await seed(20, (i) => ({ ...charityFor(i), country: country(i),
    accounts: [{ platform: 'YouTube', handle: i <= 4 ? '@Shared' : '@seed' + i, public_display_permission: false }] }));
  const s = await statsJson();
  assert.equal(s.pioneers, 20);
  assert.equal(s.charities, 6, 'Feeding America, Doctors Without Borders, American Red Cross, Local Food Pantry, Neighborhood Library Fund, UNICEF');
  assert.equal(s.social_accounts, 17, '4 registrations share one YouTube handle (@Shared) → 16 other + 1 shared');
  assert.equal(s.countries, 4);
  assert.equal(q("SELECT COUNT(*) n FROM pioneers WHERE charity_status = 'undecided'")[0].n, 4);
});

test('public listing shows only verified + public Pioneers and only approved profiles (handle-only profiles have no link); no private fields', async () => {
  const mk = async (name, over) => registerAndToken({ creator_name: name, ...over });
  const verified = await mk('Public Verified', { accounts: [
    { platform: 'YouTube', handle: '@shown', profile_url: 'https://youtube.com/@shown', public_display_permission: true },
    { platform: 'TikTok', handle: '@nolink', public_display_permission: true },
    { platform: 'Instagram', handle: 'hidden', profile_url: 'https://instagram.com/hidden', public_display_permission: false } ] });
  await call('/api/verify?token=' + verified.token);
  await mk('Public Unverified', {});
  const anon = await mk('Anon Verified', { privacy_preference: 'anonymous' }); await call('/api/verify?token=' + anon.token);
  await seed(17);
  const res = await call('/api/pioneers'); const text = await res.text(); const b = JSON.parse(text);
  assert.equal(b.visible, true);
  assert.deepEqual(b.pioneers.map((p) => p.name), ['Public Verified']);
  assert.deepEqual(b.pioneers[0].accounts, [{ platform: 'YouTube', handle: '@shown', url: 'https://youtube.com/@shown' }, { platform: 'TikTok', handle: '@nolink', url: null }]);
  for (const secret of ['@creatormail.dev', '"US"', 'Feeding America', 'II-', 'hidden', 'Anon Verified', 'Unverified', 'token', 'collab', 'tiktok.com']) assert.ok(!text.includes(secret), 'leaked: ' + secret);
});

test('profile URL is optional: blank/missing is accepted and stored as NULL, never guessed; a supplied URL must still be valid https', async () => {
  const mkAcc = (extra) => [{ platform: 'TikTok', handle: '@nolink', public_display_permission: true, ...extra }];
  for (const extra of [{}, { profile_url: '' }, { profile_url: '   ' }, { profile_url: null }]) {
    const r = await register(good({ accounts: mkAcc(extra) }));
    assert.equal(r.status, 201, JSON.stringify(extra));
  }
  assert.deepEqual(q('SELECT DISTINCT profile_url u FROM social_accounts').map((r) => r.u), [null]);
  for (const bad of ['javascript:alert(1)', 'http://tiktok.com/@a', 'tiktok.com/@a', 'https://nodots']) {
    const r = await register(good({ accounts: mkAcc({ profile_url: bad }) }));
    assert.equal(r.status, 400, bad);
  }
  const ok = await register(good({ accounts: mkAcc({ profile_url: 'https://www.tiktok.com/@nolink' }) }));
  assert.equal(ok.status, 201);
  assert.equal((await register(good({ accounts: [{ platform: 'TikTok', handle: '   ' }] }))).status, 400, 'handle stays required');
  assert.equal((await register(good({ accounts: [{ platform: '', handle: '@x' }] }))).status, 400, 'platform stays required');
});

test('duplicate platform/handle combinations collapse within a registration and are not double counted across registrations', async () => {
  const r = await register(good({ accounts: [
    { platform: 'YouTube', handle: '@Same', public_display_permission: false },
    { platform: 'YouTube', handle: 'same', public_display_permission: false },
    { platform: 'Instagram', handle: 'same', public_display_permission: false },
    { platform: 'TikTok', handle: '@other', profile_url: 'https://tiktok.com/@other', public_display_permission: false },
    { platform: 'Facebook', handle: 'another', profile_url: 'https://tiktok.com/@other', public_display_permission: false } ] }));
  assert.equal(r.status, 201);
  assert.equal(q('SELECT COUNT(*) n FROM social_accounts')[0].n, 3, 'YouTube same, Instagram same, TikTok other (repeated URL dropped)');
  assert.deepEqual(q('SELECT handle_normalized h FROM social_accounts ORDER BY id').map((x) => x.h), ['same', 'same', 'other']);
});

test('"charity not chosen yet" registers normally, stores a stable status, and never appears as a charity name', async () => {
  const body = good({ charity_status: 'undecided', charity: undefined });
  const r = await register(body); const b = await r.json();
  assert.equal(r.status, 201); assert.equal(b.charity, null); assert.equal(b.charity_status, 'undecided');
  const row = q('SELECT selected_charity, charity_status, charity_key FROM pioneers')[0];
  assert.equal(row.charity_status, 'undecided'); assert.equal(row.selected_charity, ''); assert.equal(row.charity_key, null);
  const replay = await (await register(body)).json();
  assert.equal(replay.charity, null); assert.equal(replay.charity_status, 'undecided');
  // a stray name sent with "undecided" is ignored, not stored
  await register(good({ charity_status: 'undecided', charity: 'Sneaky Name' }));
  assert.equal(q("SELECT COUNT(*) n FROM pioneers WHERE selected_charity <> ''")[0].n, 0);
});

test('selecting a charity requires a sensible name; catalogue names and aliases normalize to one canonical charity', async () => {
  for (const bad of [undefined, '', ' ', 'x', 'undecided', 'not sure', 'http://charity.org', 'a@b.org', '12345 678']) {
    const r = await register(good({ charity: bad })); assert.equal(r.status, 400, String(bad));
    assert.ok((await r.json()).fields.charity);
  }
  await register(good({ charity: 'feeding america' }));
  await register(good({ charity: 'MSF' }));
  await register(good({ charity: 'Local Food Pantry' }));
  await register(good({ charity: 'local   food pantry' }));
  const rows = q('SELECT selected_charity c, charity_key k FROM pioneers ORDER BY id');
  assert.deepEqual(rows.map((r) => r.c), ['Feeding America', 'Doctors Without Borders USA', 'Local Food Pantry', 'local   food pantry'.replace(/\s+/g, ' ')]);
  assert.equal(rows[2].k, rows[3].k, 'custom names that differ only by case/spacing share one key');
});

test('private tables are not reachable through any public route', async () => {
  await registerAndToken();
  for (const p of ['/api/pioneers/1', '/api/export', '/api/admin', '/api/social_accounts', '/api/email_verifications', '/api/register']) {
    const r = await call(p); assert.ok([404].includes(r.status), p + ' ' + r.status);
  }
});

test('migration contains no legacy data and starts empty', () => {
  for (const t of ['pioneers', 'social_accounts', 'email_verifications']) assert.equal(q(`SELECT COUNT(*) n FROM ${t}`)[0].n, 0);
});
