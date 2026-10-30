// Small helpers: randomness, hashing, time, responses.
const enc = new TextEncoder();

export const nowIso = () => new Date().toISOString();

export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** 32 random bytes → URL-safe token (256 bits). Only its SHA-256 is stored. */
export function newToken() {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

// Crockford-style alphabet (no 0/O/1/I/L/U) for readable IDs: II-XXXX-XXXX = 40 random bits.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export function newPioneerId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const c = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);
  return `II-${c.slice(0, 4).join('')}-${c.slice(4).join('')}`;
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', ...headers },
  });
}

export function redirect(url) {
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
}
