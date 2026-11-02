// Read-only report of the mail-related DNS for the sending domain. It never changes anything.
//   node scripts/check-email-dns.mjs [domain]        (the staging workflow runs this and prints the table)
// It answers: is Google Workspace mail untouched, and are Resend's sender-authentication records published yet (either the CNAME form or the older MX + SPF form)?
import { promises as dns } from 'node:dns';
import { appendFileSync } from 'node:fs';

/** Pure evaluation so it can be tested with fixtures. `r` holds the raw DNS answers (arrays; empty when absent). */
export function evaluate(r) {
  const out = [];
  const add = (level, id, title, detail) => out.push({ level, id, title, detail });
  const mx = (r.mx || []).map((m) => String(m.exchange).toLowerCase());
  const spf = (r.rootTxt || []).filter((t) => /^v=spf1\b/i.test(t));
  const dmarc = (r.dmarc || []).filter((t) => /^v=DMARC1\b/i.test(t));

  if (mx.some((x) => /(^|\.)(google|googlemail)\.com\.?$/.test(x))) add('ok', 'root-mx', 'Root MX → Google Workspace', 'Leave this exactly as is.');
  else if (mx.some((x) => /amazonses|resend/.test(x))) add('warn', 'root-mx', 'Root MX points at a sending service', 'Receiving MX records must NOT be on the root domain: they would take mail away from Google Workspace. Remove them.');
  else add('warn', 'root-mx', 'Root MX is not Google Workspace', mx.length ? `Found: ${mx.join(', ')}` : 'No MX found. Check that Workspace mail is set up on this domain.');

  if (spf.length === 1) add('ok', 'root-spf', 'One SPF record at the root', /_spf\.google\.com/.test(spf[0]) ? 'Includes Google. Leave it alone; Resend uses its own "send" subdomain.' : `Value: ${spf[0]}`);
  else if (spf.length > 1) add('warn', 'root-spf', `${spf.length} SPF records at the root`, 'A domain must have exactly one SPF record. Merge them into one.');
  else add('warn', 'root-spf', 'No SPF record at the root', 'Google Workspace normally publishes one (v=spf1 include:_spf.google.com ~all).');

  add((r.googleDkim || []).length ? 'ok' : 'info', 'google-dkim', (r.googleDkim || []).length ? 'Google DKIM key present' : 'Google DKIM key not found at google._domainkey', 'Informational: managed in Google Admin → Apps → Gmail → Authenticate email.');

  if (dmarc.length === 1) add('ok', 'dmarc', 'DMARC record present', `Policy: ${(/;\s*p=([a-z]+)/i.exec(dmarc[0]) || [, '?'])[1]}. Do not add a second one.`);
  else if (dmarc.length > 1) add('warn', 'dmarc', 'More than one DMARC record', 'Keep exactly one _dmarc TXT record.');
  else add('todo', 'dmarc', 'No DMARC record yet', 'Optional but recommended: TXT at _dmarc with v=DMARC1; p=none; (Resend lists it). Add it only if none exists.');

  // Resend authenticates with DKIM at resend._domainkey (a TXT key; a CNAME form is also accepted) and a return-path on
  // the "send" host. Resend currently provisions that return-path as a CNAME (plus an "rsend" CNAME); older accounts get
  // an MX + SPF TXT pair instead. A CNAME at a name rules out MX/TXT at that same name, so each form is checked on its own.
  const cn = (a) => (a || []).map((t) => String(t).replace(/\.$/, '')).filter(Boolean);
  const dkTxt = (r.resendDkim || []).some((t) => /^p=|v=DKIM1/i.test(t));
  const dkCname = cn(r.resendDkimCname);
  add(dkTxt || dkCname.length ? 'ok' : 'todo', 'resend-dkim', dkTxt ? 'Resend DKIM published (TXT at resend._domainkey)' : dkCname.length ? `Resend DKIM published (CNAME at resend._domainkey → ${dkCname[0]})` : 'Resend DKIM not published yet', dkTxt || dkCname.length ? '' : 'Record at resend._domainkey (the long p=… TXT value, or the CNAME Resend lists).');

  const sendCname = cn(r.sendCname);
  const smx = (r.sendMx || []).some((m) => /amazonses\.com\.?$/i.test(String(m.exchange)));
  const sspf = (r.sendTxt || []).some((t) => /^v=spf1\b/i.test(t) && /amazonses\.com/i.test(t));
  if (sendCname.length) add('ok', 'return-path', `Resend return-path published (CNAME at send → ${sendCname[0]})`, '');
  else if (smx && sspf) add('ok', 'return-path', 'Resend return-path published (MX + SPF TXT at send)', '');
  else if (smx || sspf) add('todo', 'return-path', `Resend return-path incomplete: ${smx ? 'MX is there, SPF TXT at send is missing' : 'SPF TXT is there, MX at send is missing'}`, 'Publish both, or use the single CNAME at send that Resend lists.');
  else add('todo', 'return-path', 'Resend return-path not published yet', 'Add what Resend lists for the "send" host: either one CNAME, or an MX (feedback-smtp.<region>.amazonses.com, priority 10) plus a TXT (v=spf1 include:amazonses.com ~all).');

  const rsend = cn(r.rsendCname);
  add(rsend.length ? 'ok' : 'info', 'rsend', rsend.length ? `Resend CNAME published (rsend → ${rsend[0]})` : 'No "rsend" CNAME found', rsend.length ? '' : 'Only needed if Resend lists it for your domain; Resend\'s dashboard is authoritative.');
  return out;
}

export const ready = (rows) => ['resend-dkim', 'return-path'].every((id) => rows.find((x) => x.id === id)?.level === 'ok') && !rows.some((x) => x.level === 'warn');

async function lookup(domain) {
  const safe = async (fn) => { try { return await fn(); } catch { return []; } };
  const txt = (h) => safe(() => dns.resolveTxt(h).then((a) => a.map((x) => x.join(''))));
  return {
    mx: await safe(() => dns.resolveMx(domain)), rootTxt: await txt(domain), dmarc: await txt('_dmarc.' + domain),
    googleDkim: await txt('google._domainkey.' + domain), resendDkim: await txt('resend._domainkey.' + domain),
    sendMx: await safe(() => dns.resolveMx('send.' + domain)), sendTxt: await txt('send.' + domain),
    sendCname: await safe(() => dns.resolveCname('send.' + domain)), rsendCname: await safe(() => dns.resolveCname('rsend.' + domain)), resendDkimCname: await safe(() => dns.resolveCname('resend._domainkey.' + domain)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const domain = process.argv[2] || 'influencersinvolved.org';
  const rows = evaluate(await lookup(domain));
  const icon = { ok: 'OK  ', todo: 'TODO', warn: 'WARN', info: 'INFO' };
  const lines = [`Mail DNS status for ${domain} (read-only)`, ...rows.map((x) => `${icon[x.level]}  ${x.title}${x.detail ? ' — ' + x.detail : ''}`), '', ready(rows) ? 'READY: Resend sender authentication records are published. If Resend shows the domain as Verified, STAGING_EMAIL_FROM can use it.' : 'NOT READY yet: see TODO/WARN lines above.'];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n### ' + lines[0] + '\n```\n' + lines.slice(1).join('\n') + '\n```\n');
}
