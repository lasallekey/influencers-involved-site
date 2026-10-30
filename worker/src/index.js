// Influencers Involved — Pioneer Registry API (Cloudflare Worker + D1).
// The Worker is the only reader/writer of the database. The browser never holds a database key.
import { validateRegistration, normalizeEmail, CONSENT_VERSION } from './validate.js';
import { sendEmail, verificationMessage, emailConfigured } from './email.js';
import { json, redirect, nowIso, newToken, newPioneerId, sha256Hex, hmacHex, timingSafeEqual } from './util.js';

const MAX_BODY = 20_000;
const TOKEN_TTL_MS = 24 * 3600e3;
const RESEND_GAP_MS = 5 * 60e3;
const RESEND_PER_DAY = 3;
const K_ANON = 5; // breakdowns smaller than this are never published
const LIMITS = { register: [10, 3600], resend: [6, 3600], verify: [60, 3600], unsub: [30, 3600] }; // [max, window seconds] per client

export default {
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
  if (pathname === '/api/verify' && method === 'GET') return verify(request, env, url);
  if (pathname === '/api/unsubscribe' && method === 'GET') return unsubscribe(request, env, url);
  if (pathname === '/api/stats' && method === 'GET') return withHeaders(await stats(env), h);
  if (pathname === '/api/pioneers' && method === 'GET') return withHeaders(await publicPioneers(env), h);
  if (pathname === '/api/health' && method === 'GET') return json({ ok: true, email_configured: emailConfigured(env) });
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
  return `${kind}:${(await hmacHex(env.TOKEN_SECRET || 'dev-only', 'ip:' + ip)).slice(0, 32)}`;
}

/** Counts this request and returns true when the client is over the limit. */
async function overLimit(env, request, kind) {
  const [max, windowSec] = LIMITS[kind];
  const win = Math.floor(Date.now() / 1000 / windowSec);
  const bucket = await clientBucket(request, env, kind);
  const row = await env.DB.prepare(
    'INSERT INTO rate_limits (bucket, window_start, count) VALUES (?1, ?2, 1) ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1 RETURNING count'
  ).bind(bucket, win).first();
  // Opportunistic purge of expired windows keeps the table tiny and the data short-lived.
  if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(win - 2).run();
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
  return {
    ok: true,
    pioneer_id: row.pioneer_id,
    display_name: row.privacy_preference === 'anonymous' ? 'Anonymous Pioneer' : row.creator_name,
    charity: row.selected_charity,
    pledge_date: row.pledge_date,
  };
}

async function register(request, env, ctx) {
  if (await overLimit(env, request, 'register')) return json({ ok: false, error: 'rate_limited' }, 429, { 'Retry-After': '3600' });
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;

  // Honeypot: real people never fill this hidden field. Bots get a plausible reply and nothing is stored.
  if (parsed.body && typeof parsed.body.website === 'string' && parsed.body.website.trim() !== '') {
    return json({ ok: true, pioneer_id: newPioneerId(), display_name: 'Pioneer', charity: '', pledge_date: '', email_status: 'queued' }, 201);
  }

  const v = validateRegistration(parsed.body);
  if (v.fields) return json({ ok: false, error: 'validation', fields: v.fields }, 400);
  const d = v.value;

  // Idempotent retry: the same key returns the same stored result and never creates a second record.
  const prior = await env.DB.prepare('SELECT pioneer_id, creator_name, selected_charity, pledge_date, privacy_preference FROM pioneers WHERE idempotency_key = ?1').bind(d.idempotency_key).first();
  if (prior) return json({ ...certificateView(prior), email_status: 'replayed' }, 200);

  const now = nowIso();
  for (let attempt = 0; attempt < 4; attempt++) {
    const pioneerId = newPioneerId();
    const token = newToken();
    const tokenHash = await sha256Hex(token);
    const configured = emailConfigured(env);
    const stmts = [
      env.DB.prepare(
        `INSERT INTO pioneers (pioneer_id, submitted_at, creator_name, private_email, country, selected_charity, pledge_date, privacy_preference,
           general_email_opt_in, general_opt_in_at, collaboration_interest, collaboration_types, collab_contact_opt_in, collab_opt_in_at,
           consent_version, consented_at, idempotency_key)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`
      ).bind(pioneerId, now, d.creator_name, d.email, d.country, d.charity, d.pledge_date, d.privacy_preference,
        d.general ? 1 : 0, d.general ? now : null, d.interest, JSON.stringify(d.types), d.collabContact ? 1 : 0, d.collabContact ? now : null,
        CONSENT_VERSION, now, d.idempotency_key),
      ...d.accounts.map((a) =>
        env.DB.prepare('INSERT INTO social_accounts (pioneer_id, platform, handle_or_channel, profile_url, public_display_permission) VALUES (?1,?2,?3,?4,?5)')
          .bind(pioneerId, a.platform, a.handle, a.profile_url, a.public ? 1 : 0)),
      env.DB.prepare('INSERT INTO email_verifications (pioneer_id, token_hash, created_at, expires_at, send_status) VALUES (?1,?2,?3,?4,?5)')
        .bind(pioneerId, tokenHash, now, new Date(Date.now() + TOKEN_TTL_MS).toISOString(), configured ? 'queued' : 'not_configured'),
    ];
    try {
      await env.DB.batch(stmts); // one transaction: Pioneer + every account + verification row, or nothing
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (msg.includes('idempotency_key')) { // concurrent duplicate of the same attempt
        const row = await env.DB.prepare('SELECT pioneer_id, creator_name, selected_charity, pledge_date, privacy_preference FROM pioneers WHERE idempotency_key = ?1').bind(d.idempotency_key).first();
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
    return json({ ok: true, pioneer_id: pioneerId, display_name: d.privacy_preference === 'anonymous' ? 'Anonymous Pioneer' : d.creator_name, charity: d.charity, pledge_date: d.pledge_date, email_status: emailStatus }, 201);
  }
  return json({ ok: false, error: 'not_saved' }, 500);
}

function apiBase(env, request) {
  return (env.API_BASE_URL || env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
}

async function unsubToken(env, pioneerId) {
  return (await hmacHex(env.TOKEN_SECRET || 'dev-only', 'unsub:' + pioneerId)).slice(0, 40);
}

async function deliverVerification(env, { pioneerId, to, name, token, tokenHash, optional }, request) {
  const base = apiBase(env, request);
  const link = `${base}/api/verify?token=${encodeURIComponent(token)}`;
  const unsubscribe = optional ? `${base}/api/unsubscribe?p=${encodeURIComponent(pioneerId)}&t=${await unsubToken(env, pioneerId)}` : null;
  const status = await sendEmail(env, { to, ...verificationMessage({ name, link, unsubscribe }) });
  await env.DB.prepare('UPDATE email_verifications SET send_status = ?1, sent_at = ?2 WHERE token_hash = ?3')
    .bind(status === 'sent' ? 'sent' : status, status === 'sent' ? nowIso() : null, tokenHash).run();
}

/* ---------- verification ---------- */

async function verify(request, env, url) {
  const site = (env.SITE_URL || url.origin).replace(/\/$/, '');
  const back = (r) => redirect(`${site}/challenge/?verify=${r}`);
  if (await overLimit(env, request, 'verify')) return back('invalid');
  const token = url.searchParams.get('token') || '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return back('invalid');
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare('SELECT pioneer_id, expires_at, consumed_at FROM email_verifications WHERE token_hash = ?1').bind(hash).first();
  if (!row || row.consumed_at) return back('invalid');
  if (row.expires_at <= nowIso()) return back('expired');
  const now = nowIso();
  // Single-use: the conditional UPDATE succeeds for exactly one request, even under a race.
  const [claim] = await env.DB.batch([
    env.DB.prepare('UPDATE email_verifications SET consumed_at = ?1 WHERE token_hash = ?2 AND consumed_at IS NULL AND expires_at > ?1').bind(now, hash),
    env.DB.prepare(`UPDATE pioneers SET email_verification_status = 'Verified', email_verified_at = ?1
                    WHERE pioneer_id = ?3 AND registration_status = 'Active'
                      AND EXISTS (SELECT 1 FROM email_verifications WHERE token_hash = ?2 AND consumed_at = ?1)`).bind(now, hash, row.pioneer_id),
  ]);
  return back(claim.meta.changes === 1 ? 'ok' : 'invalid');
}

async function resend(request, env, ctx) {
  if (await overLimit(env, request, 'resend')) return json({ ok: false, error: 'rate_limited' }, 429);
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const generic = json({ ok: true }, 202); // identical answer whether or not the address is registered
  const email = normalizeEmail(parsed.body && parsed.body.email);
  if (!email || !emailConfigured(env)) return generic;
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

const PUBLIC_CACHE = { 'Cache-Control': 'public, max-age=300' };

async function stats(env) {
  const base = await env.DB.prepare(`SELECT COUNT(*) AS pioneers FROM pioneers WHERE registration_status = 'Active'`).first();
  const accounts = await env.DB.prepare(`SELECT COUNT(*) AS n FROM social_accounts s JOIN pioneers p ON p.pioneer_id = s.pioneer_id WHERE p.registration_status = 'Active'`).first();
  const out = { unique_pioneers: base.pioneers, participating_accounts: accounts.n, countries: null, platform_count: null, platforms: [] };
  // Breakdowns are published only once the whole registry is large enough that no single person stands out.
  if (base.pioneers >= K_ANON) {
    const c = await env.DB.prepare(`SELECT COUNT(DISTINCT country) AS n FROM pioneers WHERE registration_status = 'Active'`).first();
    out.countries = c.n;
    const pl = await env.DB.prepare(`SELECT s.platform AS platform, COUNT(*) AS n FROM social_accounts s JOIN pioneers p ON p.pioneer_id = s.pioneer_id WHERE p.registration_status = 'Active' GROUP BY s.platform ORDER BY n DESC`).all();
    out.platform_count = pl.results.length;
    out.platforms = pl.results.filter((r) => r.n >= K_ANON).map((r) => ({ platform: r.platform, count: r.n }));
  }
  return json(out, 200, PUBLIC_CACHE);
}

async function publicPioneers(env) {
  // Verified AND publicly opted in AND active. Only the profiles the person approved. No email, country, charity or interests.
  const people = await env.DB.prepare(`SELECT pioneer_id, creator_name FROM pioneers WHERE registration_status = 'Active' AND email_verification_status = 'Verified' AND privacy_preference = 'public' ORDER BY creator_name COLLATE NOCASE LIMIT 200`).all();
  const accts = await env.DB.prepare(`SELECT s.pioneer_id, s.platform, s.handle_or_channel, s.profile_url FROM social_accounts s JOIN pioneers p ON p.pioneer_id = s.pioneer_id
    WHERE s.public_display_permission = 1 AND p.registration_status = 'Active' AND p.email_verification_status = 'Verified' AND p.privacy_preference = 'public'`).all();
  const by = new Map();
  for (const a of accts.results) {
    if (!by.has(a.pioneer_id)) by.set(a.pioneer_id, []);
    by.get(a.pioneer_id).push({ platform: a.platform, handle: a.handle_or_channel, url: a.profile_url });
  }
  return json({ pioneers: people.results.map((p) => ({ name: p.creator_name, accounts: by.get(p.pioneer_id) || [] })) }, 200, PUBLIC_CACHE);
}
