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
