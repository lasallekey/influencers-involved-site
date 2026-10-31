import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { charityKey, resolveCharity } from '../src/charity.js';

const cat = JSON.parse(readFileSync(new URL('../../shared/charities.json', import.meta.url), 'utf8'));
const all = cat.flatMap((c) => c.charities);

test('the charity catalogue is a categorized list of about 100 well-formed entries', () => {
  assert.equal(cat.length, 9);
  assert.ok(all.length >= 95 && all.length <= 110, `entries: ${all.length}`);
  const names = all.map((c) => c.name);
  assert.equal(new Set(names.map(charityKey)).size, names.length, 'no duplicate canonical names');
  for (const n of names) assert.ok(n.length >= 3 && n.length <= 80 && !/https?:|@|www\./i.test(n), n);
  for (const c of cat) assert.ok(c.charities.length >= 8, c.category);
});

test('every catalogue name resolves to itself; aliases resolve to their canonical charity and never collide', () => {
  const seen = new Map();
  for (const c of all) {
    const r = resolveCharity(c.name);
    assert.equal(r.name, c.name, c.name); assert.equal(r.listed, true);
    for (const a of c.aliases || []) {
      assert.equal(resolveCharity(a).name, c.name, `${a} → ${c.name}`);
      const k = charityKey(a);
      assert.ok(!seen.has(k) || seen.get(k) === c.name, `alias collision: ${a}`);
      seen.set(k, c.name);
    }
  }
});

test('the specified starter names are present exactly as provided', () => {
  const names = new Set(all.map((c) => c.name));
  for (const n of ['Against Malaria Foundation', 'charity: water', 'UNICEF USA (United States Fund for UNICEF)', 'MAZON: A Jewish Response to Hunger', "Michael J. Fox Foundation for Parkinson's Research", 'The Y (National Office)', "Semper Fi & America's Fund", 'Global Fund for Women']) assert.ok(names.has(n), n);
  assert.equal(cat[0].category, 'Global Health & Evidence-Based Giving');
});
