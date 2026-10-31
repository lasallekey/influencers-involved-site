// Server-side validation and normalization of a registration payload.
import countries from '../../shared/countries.json' with { type: 'json' };
import { resolveCharity } from './charity.js';

export const CONSENT_VERSION = '2026-10-30';
export const PLATFORMS = ['YouTube', 'Instagram', 'TikTok', 'Facebook', 'Twitch', 'LinkedIn', 'X', 'Other'];
export const COLLAB_TYPES = ['content', 'fundraising', 'awareness'];
export const MAX_ACCOUNTS = 10;

const BY_CODE = new Map(countries.map(([c]) => [c, c]));
const BY_NAME = new Map(countries.map(([c, n]) => [fold(n), c]));
const ALIASES = { usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', us: 'US', america: 'US', 'united states of america': 'US', uk: 'GB', 'great britain': 'GB', england: 'GB', 'south korea': 'KR', korea: 'KR', 'republic of korea': 'KR', russia: 'RU', vietnam: 'VN' };

function fold(s) {
  return String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
export function normalizeCountry(input) {
  if (typeof input !== 'string') return null;
  const t = input.trim();
  if (!t) return null;
  const up = t.toUpperCase();
  if (BY_CODE.has(up)) return up;
  const f = fold(t);
  return ALIASES[f] || BY_NAME.get(f) || null;
}

const CTRL = /[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g; // control + bidi override characters
export function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(CTRL, ' ').replace(/\s+/g, ' ').trim().slice(0, max + 1);
}

export function normalizeEmail(v) {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]{2,}$/.test(e)) return null;
  const [local, domain] = e.split('@');
  if (local.length > 64 || domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) return null;
  return e;
}

/** Lowercase, no leading @ or surrounding spaces. Used only to avoid counting one account twice. */
export function normalizeHandle(h) {
  return String(h || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().replace(/^@+/, '');
}

/** Reserved/test mailbox domains never count toward public totals (RFC 2606 names plus smoke+ addresses). */
export function isTestEmail(email, extraDomains = '') {
  const [local, domain = ''] = String(email).toLowerCase().split('@');
  if (local.startsWith('smoke+') || /\+(test|smoke)/.test(local)) return true; // e.g. you+test1@gmail.com still receives mail but is never counted
  if (/(^|\.)(test|invalid|example|localhost)$/.test(domain) || /(^|\.)example\.(com|org|net)$/.test(domain)) return true;
  return extraDomains.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean).some((d) => domain === d || domain.endsWith('.' + d));
}

export function normalizeHttpsUrl(v) {
  if (typeof v !== 'string') return null;
  let u;
  try { u = new URL(v.trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.') || u.href.length > 300) return null;
  return u.href;
}

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Returns { value } or { fields } (field → message). Never throws on hostile input. */
export function validateRegistration(b, now = new Date()) {
  const f = {};
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { fields: { _: 'Invalid request.' } };

  const key = typeof b.idempotency_key === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(b.idempotency_key) ? b.idempotency_key : null;
  if (!key) f.idempotency_key = 'Missing or invalid request key.';

  const creator_name = cleanText(b.creator_name, 120);
  if (!creator_name || creator_name.length > 120) f.creator_name = 'Enter your creator or channel name (up to 120 characters).';

  const email = normalizeEmail(b.email);
  if (!email) f.email = 'Enter a valid email address.';

  const country = normalizeCountry(b.country);
  if (!country) f.country = 'Choose your country.';

  let pledge_date = typeof b.pledge_date === 'string' ? b.pledge_date : '';
  const tomorrow = new Date(now.getTime() + 36 * 3600e3).toISOString().slice(0, 10); // tolerate time zones ahead of UTC
  if (!validDate(pledge_date) || pledge_date > tomorrow || pledge_date < '2020-01-01') f.pledge_date = 'Choose a pledge date that is today or earlier.';

  // Charity: either a chosen/typed name, or the explicit "not decided yet" status (no name required).
  const charity_status = b.charity_status === 'undecided' ? 'undecided' : 'selected';
  let charity = null;
  if (charity_status === 'selected') {
    const rc = resolveCharity(b.charity);
    if (rc.error) f.charity = rc.error; else charity = rc;
  }

  if (b.pledge_confirmed !== true) f.pledge_confirm = 'Please confirm your pledge.';
  if (b.certificate_ack !== true) f.cert_ack = 'Please confirm you understand what the certificate is.';

  const privacy_preference = b.privacy_preference;
  if (privacy_preference !== 'public' && privacy_preference !== 'anonymous') f.privacy_preference = 'Choose a public recognition option.';

  // Consents: only a literal boolean true counts; everything else is "not consented".
  const interest = ['Yes', 'Maybe', 'Not now'].includes(b.collaboration_interest) ? b.collaboration_interest : 'Not now';
  const types = interest === 'Not now' ? [] : [...new Set(Array.isArray(b.collaboration_types) ? b.collaboration_types.filter((t) => COLLAB_TYPES.includes(t)) : [])];
  const general = b.general_email_opt_in === true;
  const collabContact = interest !== 'Not now' && b.collab_contact_opt_in === true;

  const accounts = [];
  if (!Array.isArray(b.accounts) || b.accounts.length < 1) f.accounts = 'Add at least one social account.';
  else if (b.accounts.length > MAX_ACCOUNTS) f.accounts = `You can add up to ${MAX_ACCOUNTS} accounts.`;
  else {
    const seen = new Set();
    for (const a of b.accounts) {
      const platform = a && PLATFORMS.includes(a.platform) ? a.platform : null;
      const handle = cleanText(a && a.handle, 120);
      const rawUrl = a && typeof a.profile_url === 'string' ? a.profile_url.trim() : '';
      const url = rawUrl ? normalizeHttpsUrl(rawUrl) : null; // the URL is optional; it is validated only when supplied
      if (!platform || !handle || handle.length > 120) { f.accounts = 'Each account needs a platform and a handle or channel name.'; break; }
      if (rawUrl && !url) { f.accounts = 'A profile address must be a full https:// link, or left blank.'; break; }
      const handleNorm = normalizeHandle(handle);
      if (!handleNorm) { f.accounts = 'Each account needs a platform and a handle or channel name.'; break; }
      const dupKey = `${platform}|${handleNorm}`;
      if (seen.has(dupKey) || (url && seen.has('u|' + url.toLowerCase()))) continue; // the same account listed twice counts once
      seen.add(dupKey); if (url) seen.add('u|' + url.toLowerCase());
      // Anonymous overrides every per-account public flag.
      accounts.push({ platform, handle, handle_norm: handleNorm, profile_url: url, public: privacy_preference === 'public' && a.public_display_permission === true });
    }
  }

  if (Object.keys(f).length) return { fields: f };
  return {
    value: { idempotency_key: key, creator_name, email, country, pledge_date, charity, charity_status, privacy_preference, general, interest, types, collabContact, accounts },
  };
}
