import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, ready } from '../check-email-dns.mjs';

const google = { mx: [{ exchange: 'aspmx.l.google.com', priority: 1 }, { exchange: 'alt1.aspmx.l.google.com', priority: 5 }], rootTxt: ['v=spf1 include:_spf.google.com ~all'], dmarc: ['v=DMARC1; p=none; rua=mailto:x@influencersinvolved.org'], googleDkim: ['v=DKIM1; k=rsa; p=ABC'] };
const lvl = (rows, id) => rows.find((x) => x.id === id).level;

test('Google Workspace only: the three Resend records are flagged as still to do, and nothing else is flagged', () => {
  const rows = evaluate({ ...google, resendDkim: [], sendMx: [], sendTxt: [] });
  assert.equal(lvl(rows, 'root-mx'), 'ok'); assert.equal(lvl(rows, 'root-spf'), 'ok'); assert.equal(lvl(rows, 'dmarc'), 'ok');
  for (const id of ['resend-dkim', 'send-mx', 'send-spf']) assert.equal(lvl(rows, id), 'todo');
  assert.equal(ready(rows), false);
});

test('all Resend records present on the "send" host and resend._domainkey, with Google untouched: ready', () => {
  const rows = evaluate({ ...google, resendDkim: ['p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC'], sendMx: [{ exchange: 'feedback-smtp.us-east-1.amazonses.com', priority: 10 }], sendTxt: ['v=spf1 include:amazonses.com ~all'] });
  for (const id of ['resend-dkim', 'send-mx', 'send-spf']) assert.equal(lvl(rows, id), 'ok');
  assert.equal(ready(rows), true);
});

test('dangerous or duplicate configurations are warned about', () => {
  const rootMxMoved = evaluate({ ...google, mx: [{ exchange: 'inbound-smtp.us-east-1.amazonaws.com', priority: 10 }, { exchange: 'feedback-smtp.us-east-1.amazonses.com', priority: 10 }], resendDkim: [], sendMx: [], sendTxt: [] });
  assert.equal(lvl(rootMxMoved, 'root-mx'), 'warn');
  const dupSpf = evaluate({ ...google, rootTxt: ['v=spf1 include:_spf.google.com ~all', 'v=spf1 include:amazonses.com ~all'], resendDkim: [], sendMx: [], sendTxt: [] });
  assert.equal(lvl(dupSpf, 'root-spf'), 'warn');
  const dupDmarc = evaluate({ ...google, dmarc: ['v=DMARC1; p=none', 'v=DMARC1; p=reject'], resendDkim: [], sendMx: [], sendTxt: [] });
  assert.equal(lvl(dupDmarc, 'dmarc'), 'warn');
  const noDmarc = evaluate({ ...google, dmarc: [], resendDkim: [], sendMx: [], sendTxt: [] });
  assert.equal(lvl(noDmarc, 'dmarc'), 'todo');
  assert.equal(ready(dupSpf), false);
});

test('the report only reads DNS: no write-capable code paths', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../check-email-dns.mjs', import.meta.url), 'utf8');
  assert.ok(!/fetch\(|https?\.request|createRecord|api\.cloudflare/i.test(src));
});
