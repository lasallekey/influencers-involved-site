import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, flatten } from '../dns-preflight.mjs';

test('flatten normalizes MX, TXT chunks, CNAME case and trailing dots', () => {
  assert.deepEqual(flatten('MX', [{ priority: 10, exchange: 'ASPMX2.GoogleMail.com.' }, { priority: 1, exchange: 'ASPMX.L.GOOGLE.COM' }]), ['1 aspmx.l.google.com', '10 aspmx2.googlemail.com']);
  assert.deepEqual(flatten('TXT', [['v=spf1 include:_spf.google.com ', '~all']]), ['v=spf1 include:_spf.google.com ~all']);
  assert.deepEqual(flatten('CNAME', ['Feedback-SMTP.us-east-1.amazonses.com.']), ['feedback-smtp.us-east-1.amazonses.com']);
});

test('compare reports anything missing or extra, and nothing when sets match regardless of order', () => {
  const cur = { '@ MX': ['1 a', '5 b'], 'send CNAME': ['x'], '_dmarc TXT': ['v=DMARC1; p=none'] };
  assert.deepEqual(compare(cur, { '@ MX': ['5 b', '1 a'], 'send CNAME': ['x'], '_dmarc TXT': ['v=DMARC1; p=none'] }), []);
  const d = compare(cur, { '@ MX': ['1 a'], 'send CNAME': ['x'], 'rsend CNAME': ['y'] });
  assert.deepEqual(d.map((x) => x.key).sort(), ['@ MX', '_dmarc TXT', 'rsend CNAME']);
  assert.deepEqual(d.find((x) => x.key === '@ MX').missing, ['5 b']);
  assert.deepEqual(d.find((x) => x.key === 'rsend CNAME').extra, ['y']);
});

import { parseDoh, summarizeRdap } from '../dns-inventory.mjs';

test('inventory: DoH answers and RDAP records are summarized (DNSSEC, lock, registrar)', () => {
  assert.deepEqual(parseDoh({ Status: 0, AD: true, Answer: [{ data: '12345 13 2 ABCD' }] }), { present: true, ad: true, data: ['12345 13 2 ABCD'] });
  assert.equal(parseDoh({ Status: 0 }).present, false);
  const s = summarizeRdap({ status: ['client transfer prohibited'], secureDNS: { delegationSigned: false }, nameservers: [{ ldhName: 'NS2.EXAMPLE.NET' }, { ldhName: 'ns1.example.net' }],
    entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Example Registrar']]] }], events: [{ eventAction: 'expiration', eventDate: '2027-01-01T00:00:00Z' }] });
  assert.deepEqual([s.registrar, s.dnssecSigned, s.transferLocked, s.nameservers.join(), s.expires], ['Example Registrar', false, true, 'ns1.example.net,ns2.example.net', '2027-01-01T00:00:00Z']);
});
