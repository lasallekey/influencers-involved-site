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

test('charity names in any script are accepted, keyed and counted once; catalogue keys are unchanged', () => {
  const samples = {
    Greek: 'Ελληνικός Ερυθρός Σταυρός', Cyrillic: 'Российский Красный Крест', Arabic: 'جمعية الهلال الأحمر', Hebrew: 'מגן דוד אדום',
    Devanagari: 'गूंज फाउंडेशन', Thai: 'สภากาชาดไทย', Chinese: '中国红十字会', Japanese: '日本赤十字社', Korean: '대한적십자사', Accented: 'Médecins du Monde — Ñandú',
  };
  for (const [script, name] of Object.entries(samples)) {
    const r = resolveCharity(name);
    assert.ok(!r.error, `${script}: ${r.error}`);
    assert.equal(r.name, name); assert.equal(r.listed, false); assert.ok(r.key.length >= 2, script);
    assert.equal(resolveCharity('  ' + name + '  ').key, r.key, `${script}: stable key`);
  }
  // Same charity, different punctuation/case/spacing/width → one key (de-duplication still works).
  assert.equal(resolveCharity('Российский  Красный Крест.').key, resolveCharity('российский красный крест').key);
  assert.equal(resolveCharity('ＦＵＬＬ　ＷＩＤＴＨ Charity').key, resolveCharity('full width charity').key);
  assert.equal(resolveCharity('The Ελληνικός Ερυθρός Σταυρός').key, resolveCharity('Ελληνικός Ερυθρός Σταυρός').key);
  // Still rejected: nothing but punctuation/symbols, URLs, e-mail addresses, placeholders.
  for (const bad of ['!!!', '---', '🙂🙂🙂', '12', 'https://charity.example', 'help@charity.example', 'none', 'N/A']) assert.ok(resolveCharity(bad).error, bad);
  // Every catalogue name keeps exactly the key it always had (ASCII-folding behavior preserved).
  const legacyKey = (t) => String(t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/^the\s+/, '').replace(/\s+/g, ' ').trim();
  for (const c of all) { assert.equal(charityKey(c.name), legacyKey(c.name), c.name); for (const a of c.aliases || []) assert.equal(charityKey(a), legacyKey(a), a); }
});
