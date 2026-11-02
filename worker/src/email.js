// Transactional email through one HTTPS provider API (Resend-compatible JSON by default).
// Credentials come only from Worker secrets. A send failure never affects the stored pledge.

export function emailConfigured(env) {
  return Boolean(env.EMAIL_API_KEY && env.EMAIL_FROM && env.EMAIL_API_URL);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function verificationMessage({ name, link, unsubscribe }) {
  const text = [
    `Hello ${name},`,
    '',
    'Your 1% pledge is saved and your Pioneer certificate is ready. This optional step confirms you control this inbox, which helps protect the registry and is required before any public listing you chose.',
    '',
    `Verify your email: ${link}`,
    '',
    'The link works once and expires in 24 hours. Verifying is not a donation, not proof of giving, and not consent to marketing email.',
    unsubscribe ? `\nManage the optional emails you chose: ${unsubscribe}` : '',
    '',
    'Influencers Involved, Inc. NFP · 800 W Central Rd, Suite 120, Mt. Prospect, IL 60056',
    'If you did not make this pledge, ignore this message or write to grants@influencersinvolved.org.',
  ].join('\n');
  const html = `<p>Hello ${esc(name)},</p><p>Your 1% pledge is saved and your Pioneer certificate is ready. This optional step confirms you control this inbox, which helps protect the registry and is required before any public listing you chose.</p><p><a href="${esc(link)}">Verify your email</a></p><p>The link works once and expires in 24 hours. Verifying is not a donation, not proof of giving, and not consent to marketing email.</p>${unsubscribe ? `<p><a href="${esc(unsubscribe)}">Manage the optional emails you chose</a></p>` : ''}<p style="color:#555;font-size:13px">Influencers Involved, Inc. NFP · 800 W Central Rd, Suite 120, Mt. Prospect, IL 60056<br>If you did not make this pledge, ignore this message or write to grants@influencersinvolved.org.</p>`;
  return { subject: 'Confirm your email — Influencers Involved Pioneer Registry', text, html };
}

/** Short, redacted reason from the provider's error body (never includes addresses or token-like strings). */
async function providerReason(r) {
  try {
    const j = await r.json();
    const clean = (t) => String(t || '').replace(/[^\s@<>(),;]+@[^\s@<>(),;]+/g, '[email]').replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]').slice(0, 220);
    return `${clean(j.name)}: ${clean(j.message)}`;
  } catch { return '(no readable error body)'; }
}

/** @returns {Promise<'sent'|'failed'|'not_configured'>} */
export async function sendEmail(env, { to, subject, text, html }) {
  if (!emailConfigured(env)) return 'not_configured';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(env.EMAIL_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text, html }),
      signal: ctl.signal,
    });
    if (!r.ok) { console.warn('email provider rejected message', r.status, await providerReason(r)); return 'failed'; }
    return 'sent';
  } catch (e) {
    console.warn('email send error', e && e.name);
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}
