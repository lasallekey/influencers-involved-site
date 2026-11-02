// Influencers Involved — Pioneer Registry API (Cloudflare Worker + D1).
// The Worker is the only reader/writer of the database. The browser never holds a database key.
import { validateRegistration, normalizeEmail, isTestEmail, isUndeliverableEmail, CONSENT_VERSION } from './validate.js';
import { sendEmail, verificationMessage, emailConfigured } from './email.js';
import { json, redirect, nowIso, newToken, newPioneerId, sha256Hex, hmacHex, timingSafeEqual } from './util.js';

const MAX_BODY = 20_000;
export const HONEYPOT_FIELD = 'ii_extra_note'; // deliberately not a name browsers or password managers recognize
const TOKEN_TTL_MS = 24 * 3600e3;
const RESEND_GAP_MS = 5 * 60e3;
const RESEND_PER_DAY = 3;
// The public registry (counts and listing) stays completely hidden until this many eligible registrations exist.
// Eligible = registration_status 'Active' AND is_test = 0 (see docs/REGISTRY.md). Both endpoints use the same predicate.
const REGISTRY_MIN = 20;
const ELIGIBLE = "p.registration_status = 'Active' AND p.is_test = 0";
const LIMITS = { register: [10, 3600], resend: [6, 3600], verify: [60, 3600], unsub: [30, 3600] }; // [max, window seconds] per client

// Retention of temporary records (documented on the Privacy page and in docs/RETENTION.md). Registrations are never touched here.
const RATE_LIMIT_KEEP_WINDOWS = 1;               // rate-limit counters older than the previous hour-long window are deleted
const VERIFICATION_KEEP_MS = 7 * 24 * 3600e3;    // spent or expired verification-link records are deleted 7 days after use/expiry

/** Security-critical secrets must exist; there is deliberately no built-in fallback value. */
export function secretsConfigured(env) {
  return typeof env.TOKEN_SECRET === 'string' && env.TOKEN_SECRET.length >= 32;
}

export default {
  // Daily cron (wrangler.toml [triggers]): deletes expired temporary records. See runCleanup.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCleanup(env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: 'not_found' }, 404);
    }
    try {
      return await route(request, env, ctx, url);
    } catch (e) {
      console.error('unhandled', e && e.message);
      return json({ ok: false, error: 'server_error' }, 500);
    }
  },
};

async function route(request, env, ctx, url) {
  const { pathname } = url;
  const method = request.method;
  // Fail closed: without TOKEN_SECRET nothing that hashes IPs or signs links may run. Health reports why.
  if (pathname === '/api/health' && method === 'GET') {
    const ready = secretsConfigured(env);
    return json({ ok: ready, secrets_configured: ready, email_configured: emailConfigured(env) }, ready ? 200 : 503);
  }
  if (!secretsConfigured(env)) return json({ ok: false, error: 'not_configured' }, 503);
  const cors = corsHeaders(request, env);

  if (method === 'OPTIONS') {
    if (!cors) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } });
  }

  // Cross-site writes are refused unless the origin is the site itself or explicitly allowed.
  if (method === 'POST') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin && !cors) return json({ ok: false, error: 'forbidden_origin' }, 403);
  }
  const h = cors || {};

  if (pathname === '/api/register' && method === 'POST') return withHeaders(await register(request, env, ctx), h);
  if (pathname === '/api/resend-verification' && method === 'POST') return withHeaders(await resend(request, env, ctx), h);
  if (pathname === '/api/verify' && method === 'POST') return withHeaders(await verifyConfirm(request, env), h);
  if (pathname === '/api/verify' && method === 'GET') return verifyRedirect(request, env, url);
  if (pathname === '/api/unsubscribe' && method === 'GET') return unsubscribe(request, env, url);
  if (pathname === '/api/stats' && method === 'GET') return withHeaders(await stats(env), h);
  if (pathname === '/api/pioneers' && method === 'GET') return withHeaders(await publicPioneers(env), h);
  return json({ error: 'not_found' }, 404);
}

function withHeaders(res, extra) {
  for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
  return res;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const site = (env.SITE_URL || '').replace(/\/$/, '');
  if (origin === site || allowed.includes(origin)) return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  return null;
}

/* ---------- abuse limits ---------- */

async function clientBucket(request, env, kind) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  return `${kind}:${(await hmacHex(env.TOKEN_SECRET, 'ip:' + ip)).slice(0, 32)}`;
}

/** Counts this request and returns true when the client is over the limit. */
async function overLimit(env, request, kind) {
  const [max, windowSec] = LIMITS[kind];
  const win = Math.floor(Date.now() / 1000 / windowSec);
  const bucket = await clientBucket(request, env, kind);
  const row = await env.DB.prepare(
    'INSERT INTO rate_limits (bucket, window_start, count) VALUES (?1, ?2, 1) ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1 RETURNING count'
  ).bind(bucket, win).first();
  // Opportunistic purge on top of the daily scheduled cleanup (runCleanup) keeps the table tiny.
  if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(win - RATE_LIMIT_KEEP_WINDOWS).run();
  return (row && row.count) > max;
}

async function readJson(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) return { error: json({ ok: false, error: 'unsupported_media_type' }, 415) };
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: json({ ok: false, error: 'too_large' }, 413) };
  try { return { body: JSON.parse(text) }; } catch { return { error: json({ ok: false, error: 'bad_json' }, 400) }; }
}

/* ---------- registration ---------- */

function certificateView(row) {
  const undecided = row.charity_status === 'undecided';
  return {
    ok: true,
    pioneer_id: row.pioneer_id,
    display_name: row.privacy_preference === 'anonymous' ? 'Anonymous Pioneer' : row.creator_name,
    charity: undecided ? null : row.selected_charity, // null = not chosen yet; never shown as a charity name
    charity_status: undecided ? 'undecided' : 'selected',
    pledge_date: row.pledge_date,
  };
}

async function register(request, env, ctx) {
  if (await overLimit(env, request, 'register')) return json({ ok: false, error: 'rate_limited' }, 429, { 'Retry-After': '3600' });
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;

  // Honeypot: real people never fill this hidden field. Nothing is stored AND no success, Pioneer ID or certificate is
  // ever returned for it: a false success would tell a real person (e.g. via browser autofill) they were registered.
  if (parsed.body && typeof parsed.body[HONEYPOT_FIELD] === 'string' && parsed.body[HONEYPOT_FIELD].trim() !== '') {
    return json({ ok: false, error: 'rejected' }, 400);
  }

  const v = validateRegistration(parsed.body);
  if (v.fields) return json({ ok: false, error: 'validation', fields: v.fields }, 400);
  const d = v.value;

  // Idempotent retry: the same key returns the same stored result and never creates a second record.
  const prior = await env.DB.prepare('SELECT pioneer_id, creator_name, selected_charity, charity_status, pledge_date, privacy_preference FROM pioneers WHERE idempotency_key = ?1').bind(d.idempotency_key).first();
  if (prior) return json({ ...certificateView(prior), email_status: 'replayed' }, 200);

  const now = nowIso();
  for (let attempt = 0; attempt < 4; attempt++) {
    const pioneerId = newPioneerId();
    const token = newToken();
    const tokenHash = await sha256Hex(token);
    const configured = emailConfigured(env) && !isUndeliverableEmail(d.email); // reserved test domains never get (bouncing) mail
    const stmts = [
      env.DB.prepare(
        `INSERT INTO pioneers (pioneer_id, submitted_at, creator_name, private_email, country, selected_charity, charity_status, charity_key, is_test, pledge_date, privacy_preference,
           general_email_opt_in, general_opt_in_at, collaboration_interest, collaboration_types, collab_contact_opt_in, collab_opt_in_at,
           consent_version, consented_at, idempotency_key)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)`
      ).bind(pioneerId, now, d.creator_name, d.email, d.country, d.charity ? d.charity.name : '', d.charity_status, d.charity ? d.charity.key : null, isTestEmail(d.email, env.TEST_EMAIL_DOMAINS || '') ? 1 : 0, d.pledge_date, d.privacy_preference,
        d.general ? 1 : 0, d.general ? now : null, d.interest, JSON.stringify(d.types), d.collabContact ? 1 : 0, d.collabContact ? now : null,
        CONSENT_VERSION, now, d.idempotency_key),
      ...d.accounts.map((a) =>
        env.DB.prepare('INSERT INTO social_accounts (pioneer_id, platform, handle_or_channel, handle_normalized, profile_url, public_display_permission) VALUES (?1,?2,?3,?4,?5,?6)')
          .bind(pioneerId, a.platform, a.handle, a.handle_norm, a.profile_url, a.public ? 1 : 0)),
      env.DB.prepare('INSERT INTO email_verifications (pioneer_id, token_hash, created_at, expires_at, send_status) VALUES (?1,?2,?3,?4,?5)')
        .bind(pioneerId, tokenHash, now, new Date(Date.now() + TOKEN_TTL_MS).toISOString(), configured ? 'queued' : 'not_configured'),
    ];
    try {
      await env.DB.batch(stmts); // one transaction: Pioneer + every account + verification row, or nothing
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (msg.includes('idempotency_key')) { // concurrent duplicate of the same attempt
        const row = await env.DB.prepare('SELECT pioneer_id, creator_name, selected_charity, charity_status, pledge_date, privacy_preference FROM pioneers WHERE idempotency_key = ?1').bind(d.idempotency_key).first();
        if (row) return json({ ...certificateView(row), email_status: 'replayed' }, 200);
      }
      if (msg.includes('private_email')) return json({ ok: false, error: 'email_registered' }, 409);
      if (msg.includes('pioneer_id') && attempt < 3) continue; // ID collision: draw another
      console.error('register failed', msg.slice(0, 200));
      return json({ ok: false, error: 'not_saved' }, 500);
    }

    // The pledge is committed. Everything below is best-effort and cannot undo it.
    let emailStatus = 'not_configured';
    if (configured) {
      emailStatus = 'queued';
      ctx.waitUntil(deliverVerification(env, { pioneerId, to: d.email, name: d.creator_name, token, tokenHash, optional: d.general || d.collabContact }, request));
    }
    return json({ ok: true, pioneer_id: pioneerId, display_name: d.privacy_preference === 'anonymous' ? 'Anonymous Pioneer' : d.creator_name, charity: d.charity ? d.charity.name : null, charity_status: d.charity_status, pledge_date: d.pledge_date, email_status: emailStatus }, 201);
  }
  return json({ ok: false, error: 'not_saved' }, 500);
}

function apiBase(env, request) {
  return (env.API_BASE_URL || env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
}

async function unsubToken(env, pioneerId) {
  return (await hmacHex(env.TOKEN_SECRET, 'unsub:' + pioneerId)).slice(0, 40);
}

async function deliverVerification(env, { pioneerId, to, name, token, tokenHash, optional }, request) {
  // The email link opens the site's own page with the token in the URL fragment (never sent to any server by a
  // plain fetch). Nothing is consumed until the person presses the confirm button, so email-link scanners that
  // merely open links cannot use up the single-use token.
  const site = (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
  const link = `${site}/challenge/#verify=${encodeURIComponent(token)}`;
  const base = apiBase(env, request);
  const unsubscribe = optional ? `${base}/api/unsubscribe?p=${encodeURIComponent(pioneerId)}&t=${await unsubToken(env, pioneerId)}` : null;
  const status = await sendEmail(env, { to, ...verificationMessage({ name, link, unsubscribe }) });
  await env.DB.prepare('UPDATE email_verifications SET send_status = ?1, sent_at = ?2 WHERE token_hash = ?3')
    .bind(status === 'sent' ? 'sent' : status, status === 'sent' ? nowIso() : null, tokenHash).run();
}

/* ---------- verification ---------- */

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

// Links from emails sent before the confirm-button flow (and anything that still opens /api/verify in a browser) are
// forwarded to the confirmation page. This GET changes nothing, so scanners that open it cannot consume a token.
async function verifyRedirect(request, env, url) {
  const site = (env.SITE_URL || url.origin).replace(/\/$/, '');
  const token = url.searchParams.get('token') || '';
  return redirect(TOKEN_SHAPE.test(token) ? `${site}/challenge/#verify=${token}` : `${site}/challenge/`);
}

// The only place a verification token is consumed: an explicit POST from the confirmation page (same-origin only).
async function verifyConfirm(request, env) {
  if (await overLimit(env, request, 'verify')) return json({ ok: false, status: 'rate_limited' }, 429);
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const token = parsed.body && typeof parsed.body.token === 'string' ? parsed.body.token : '';
  if (!TOKEN_SHAPE.test(token)) return json({ ok: false, status: 'invalid' }, 400);
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare('SELECT pioneer_id, expires_at, consumed_at FROM email_verifications WHERE token_hash = ?1').bind(hash).first();
  if (!row) return json({ ok: false, status: 'invalid' }, 400);
  if (row.consumed_at) return json({ ok: false, status: 'used' }, 409);
  if (row.expires_at <= nowIso()) return json({ ok: false, status: 'expired' }, 410);
  const now = nowIso();
  // Single-use: the conditional UPDATE succeeds for exactly one request, even under a race.
  const [claim] = await env.DB.batch([
    env.DB.prepare('UPDATE email_verifications SET consumed_at = ?1 WHERE token_hash = ?2 AND consumed_at IS NULL AND expires_at > ?1').bind(now, hash),
    env.DB.prepare(`UPDATE pioneers SET email_verification_status = 'Verified', email_verified_at = ?1
                    WHERE pioneer_id = ?3 AND registration_status = 'Active'
                      AND EXISTS (SELECT 1 FROM email_verifications WHERE token_hash = ?2 AND consumed_at = ?1)`).bind(now, hash, row.pioneer_id),
  ]);
  return claim.meta.changes === 1 ? json({ ok: true, status: 'ok' }) : json({ ok: false, status: 'used' }, 409);
}

async function resend(request, env, ctx) {
  if (await overLimit(env, request, 'resend')) return json({ ok: false, error: 'rate_limited' }, 429);
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const generic = json({ ok: true }, 202); // identical answer whether or not the address is registered
  const email = normalizeEmail(parsed.body && parsed.body.email);
  if (!email || !emailConfigured(env) || isUndeliverableEmail(email)) return generic;
  const p = await env.DB.prepare(`SELECT pioneer_id, creator_name, general_email_opt_in, collab_contact_opt_in FROM pioneers WHERE private_email = ?1 AND registration_status = 'Active' AND email_verification_status = 'Pending'`).bind(email).first();
  if (!p) return generic;
  const day = new Date(Date.now() - 24 * 3600e3).toISOString();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(created_at) AS last FROM email_verifications WHERE pioneer_id = ?1 AND created_at > ?2').bind(p.pioneer_id, day).first();
  if (recent.n >= RESEND_PER_DAY || (recent.last && Date.now() - Date.parse(recent.last) < RESEND_GAP_MS)) return generic;
  const now = nowIso();
  const token = newToken(), tokenHash = await sha256Hex(token);
  await env.DB.batch([
    env.DB.prepare('UPDATE email_verifications SET expires_at = ?1 WHERE pioneer_id = ?2 AND consumed_at IS NULL AND expires_at > ?1').bind(now, p.pioneer_id), // older links stop working
    env.DB.prepare('INSERT INTO email_verifications (pioneer_id, token_hash, created_at, expires_at, send_status) VALUES (?1,?2,?3,?4,?5)').bind(p.pioneer_id, tokenHash, now, new Date(Date.now() + TOKEN_TTL_MS).toISOString(), 'queued'),
  ]);
  ctx.waitUntil(deliverVerification(env, { pioneerId: p.pioneer_id, to: email, name: p.creator_name, token, tokenHash, optional: !!(p.general_email_opt_in || p.collab_contact_opt_in) }, request));
  return generic;
}

/* ---------- unsubscribe (withdraws both optional email consents) ---------- */

async function unsubscribe(request, env, url) {
  const site = (env.SITE_URL || url.origin).replace(/\/$/, '');
  if (await overLimit(env, request, 'unsub')) return redirect(`${site}/challenge/?unsubscribe=invalid`);
  const p = url.searchParams.get('p') || '', t = url.searchParams.get('t') || '';
  if (!/^II-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(p) || !timingSafeEqual(t, await unsubToken(env, p))) return redirect(`${site}/challenge/?unsubscribe=invalid`);
  await env.DB.prepare(`UPDATE pioneers SET general_email_opt_in = 0, collab_contact_opt_in = 0, optional_withdrawn_at = ?1 WHERE pioneer_id = ?2`).bind(nowIso(), p).run();
  return redirect(`${site}/challenge/?unsubscribe=ok`);
}

/* ---------- public, filtered reads ---------- */

const PUBLIC_CACHE = { 'Cache-Control': 'public, max-age=60' };

async function eligibleCount(env) {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM pioneers p WHERE ${ELIGIBLE}`).first();
  return r.n;
}

// Before REGISTRY_MIN eligible registrations exist the response is exactly {visible:false}: no numbers, no empty-state data.
async function stats(env) {
  const n = await eligibleCount(env);
  if (n < REGISTRY_MIN) return json({ visible: false }, 200, PUBLIC_CACHE);
  const accounts = await env.DB.prepare(`SELECT COUNT(*) AS n FROM (SELECT DISTINCT s.platform, s.handle_normalized FROM social_accounts s JOIN pioneers p ON p.pioneer_id = s.pioneer_id WHERE ${ELIGIBLE})`).first();
  const charities = await env.DB.prepare(`SELECT COUNT(DISTINCT p.charity_key) AS n FROM pioneers p WHERE ${ELIGIBLE} AND p.charity_status = 'selected' AND p.charity_key IS NOT NULL AND p.charity_key <> ''`).first();
  const countries = await env.DB.prepare(`SELECT COUNT(DISTINCT p.country) AS n FROM pioneers p WHERE ${ELIGIBLE}`).first();
  return json({ visible: true, pioneers: n, social_accounts: accounts.n, charities: charities.n, countries: countries.n }, 200, PUBLIC_CACHE);
}

async function publicPioneers(env) {
  if ((await eligibleCount(env)) < REGISTRY_MIN) return json({ visible: false, pioneers: [] }, 200, PUBLIC_CACHE);
  // Verified AND publicly opted in AND eligible. Only the profiles the person approved. No email, country, charity or interests.
  const people = await env.DB.prepare(`SELECT p.pioneer_id, p.creator_name FROM pioneers p WHERE ${ELIGIBLE} AND p.email_verification_status = 'Verified' AND p.privacy_preference = 'public' ORDER BY p.creator_name COLLATE NOCASE LIMIT 200`).all();
  const accts = await env.DB.prepare(`SELECT s.pioneer_id, s.platform, s.handle_or_channel, s.profile_url FROM social_accounts s JOIN pioneers p ON p.pioneer_id = s.pioneer_id
    WHERE s.public_display_permission = 1 AND ${ELIGIBLE} AND p.email_verification_status = 'Verified' AND p.privacy_preference = 'public'`).all();
  const by = new Map();
  for (const a of accts.results) {
    if (!by.has(a.pioneer_id)) by.set(a.pioneer_id, []);
    by.get(a.pioneer_id).push({ platform: a.platform, handle: a.handle_or_channel, url: a.profile_url || null });
  }
  return json({ visible: true, pioneers: people.results.map((p) => ({ name: p.creator_name, accounts: by.get(p.pioneer_id) || [] })) }, 200, PUBLIC_CACHE);
}

/* ---------- retention: expired temporary records ---------- */

/**
 * Deletes only temporary security records. It never touches pioneers or social_accounts.
 *  - rate_limits: hourly counters keyed by a keyed hash of the visitor address; only needed for the current hour.
 *  - email_verifications: hashed one-time links; valid 24 h, kept 7 days after use or expiry, then deleted.
 */
export async function runCleanup(env, now = Date.now()) {
  const win = Math.floor(now / 1000 / 3600);
  const cutoff = new Date(now - VERIFICATION_KEEP_MS).toISOString();
  const [limits, verifs] = await env.DB.batch([
    env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(win - RATE_LIMIT_KEEP_WINDOWS),
    env.DB.prepare('DELETE FROM email_verifications WHERE COALESCE(consumed_at, expires_at) < ?1').bind(cutoff),
  ]);
  const result = { rate_limits: limits.meta.changes, email_verifications: verifs.meta.changes };
  console.log('cleanup', JSON.stringify(result));
  return result;
}
