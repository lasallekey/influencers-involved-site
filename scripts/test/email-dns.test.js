import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, ready } from '../check-email-dns.mjs';

const google = { mx: [{ exchange: 'aspmx.l.google.com', priority: 1 }, { exchange: 'alt1.aspmx.l.google.com', priority: 5 }], rootTxt: ['v=spf1 include:_spf.google.com ~all'], dmarc: ['v=DMARC1; p=none; rua=mailto:x@influencersinvolved.org'], googleDkim: ['v=DKIM1; k=rsa; p=ABC'] };
const lvl = (rows, id) => rows.find((x) => x.id === id).level;

test('Google Workspace only: Resend records are flagged as still to do, and nothing else is flagged', () => {
  const rows = evaluate({ ...google, resendDkim: [], sendMx: [], sendTxt: [] });
  assert.equal(lvl(rows, 'root-mx'), 'ok'); assert.equal(lvl(rows, 'root-spf'), 'ok'); assert.equal(lvl(rows, 'dmarc'), 'ok');
  for (const id of ['resend-dkim', 'return-path']) assert.equal(lvl(rows, id), 'todo');
  assert.equal(lvl(rows, 'rsend'), 'info');
  assert.equal(ready(rows), false);
});

test('classic Resend form (MX + SPF TXT at send) with Google untouched: ready', () => {
  const rows = evaluate({ ...google, resendDkim: ['p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC'], sendMx: [{ exchange: 'feedback-smtp.us-east-1.amazonses.com', priority: 10 }], sendTxt: ['v=spf1 include:amazonses.com ~all'] });
  for (const id of ['resend-dkim', 'return-path']) assert.equal(lvl(rows, id), 'ok');
  assert.equal(ready(rows), true);
});

test('current CNAME-based Resend form (DKIM TXT + CNAME at send + CNAME at rsend) is recognized: nothing reported missing', () => {
  const rows = evaluate({ ...google, resendDkim: ['p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC'], sendMx: [], sendTxt: [], sendCname: ['send-target.example-resend.net.'], rsendCname: ['rsend-target.example-resend.net.'] });
  assert.equal(lvl(rows, 'resend-dkim'), 'ok'); assert.equal(lvl(rows, 'return-path'), 'ok'); assert.equal(lvl(rows, 'rsend'), 'ok');
  assert.ok(rows.find((x) => x.id === 'return-path').title.includes('CNAME at send → send-target.example-resend.net'), 'shows the CNAME target without the trailing dot');
  assert.equal(rows.some((x) => /MX|SPF TXT at send/.test(x.title) && x.level === 'todo'), false, 'no false "missing MX/SPF under send"');
  assert.equal(ready(rows), true);
});

test('a DKIM CNAME is also accepted; a CNAME form with no rsend is still ready but noted', () => {
  const rows = evaluate({ ...google, resendDkim: [], resendDkimCname: ['dkim.target.net.'], sendCname: ['x.net'], rsendCname: [], sendMx: [], sendTxt: [] });
  assert.equal(lvl(rows, 'resend-dkim'), 'ok'); assert.equal(lvl(rows, 'rsend'), 'info'); assert.equal(ready(rows), true);
});

test('incomplete or absent return-path is still reported as to-do, naming what is missing', () => {
  const onlyMx = evaluate({ ...google, resendDkim: ['p=ABC'], sendMx: [{ exchange: 'feedback-smtp.us-east-1.amazonses.com', priority: 10 }], sendTxt: [] });
  assert.equal(lvl(onlyMx, 'return-path'), 'todo'); assert.match(onlyMx.find((x) => x.id === 'return-path').title, /SPF TXT at send is missing/); assert.equal(ready(onlyMx), false);
  const onlySpf = evaluate({ ...google, resendDkim: ['p=ABC'], sendMx: [], sendTxt: ['v=spf1 include:amazonses.com ~all'] });
  assert.match(onlySpf.find((x) => x.id === 'return-path').title, /MX at send is missing/);
  const emptyCname = evaluate({ ...google, resendDkim: ['p=ABC'], sendCname: [''], sendMx: [], sendTxt: [] });
  assert.equal(lvl(emptyCname, 'return-path'), 'todo');
  const none = evaluate({ ...google, resendDkim: [], sendMx: [], sendTxt: [] });
  assert.equal(lvl(none, 'return-path'), 'todo'); assert.equal(ready(none), false);
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
