import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '../../worker/dev/d1-sqlite.js';
import { identify, erasureSql, runErasure } from '../erase-pioneer.mjs';

function seed() {
  const d = createMigratedD1();
  d.raw.exec('PRAGMA foreign_keys = OFF'); // prove the explicit deletes work without relying on ON DELETE CASCADE
  let n = 0;
  const add = (id, email, status = 'Active', accts = 2) => {
    d.raw.prepare(`INSERT INTO pioneers (pioneer_id, submitted_at, creator_name, private_email, country, selected_charity, pledge_date, privacy_preference, collaboration_interest, consent_version, consented_at, idempotency_key, registration_status, is_test)
                   VALUES (?, '2026-01-01T00:00:00Z', 'Synthetic', ?, 'US', 'X', '2026-01-01', 'public', 'Not now', 'v', '2026-01-01T00:00:00Z', ?, ?, 1)`).run(id, email, 'k' + ++n + 'xxxxxxxxxxxx', status);
    for (let i = 0; i < accts; i++) d.raw.prepare(`INSERT INTO social_accounts (pioneer_id, platform, handle_or_channel, handle_normalized, profile_url, public_display_permission) VALUES (?, 'YouTube', ?, ?, NULL, 0)`).run(id, '@h' + n + i, 'h' + n + i);
    d.raw.prepare(`INSERT INTO email_verifications (pioneer_id, token_hash, created_at, expires_at, send_status) VALUES (?, ?, 'a', 'b', 'sent')`).run(id, 'hash' + n);
  };
  add('II-AAAA-2222', 'target@example.invalid');
  add('II-AAAA-3333', 'target@example.invalid', 'Withdrawn', 1); // an older withdrawn record for the same address
  add('II-BBBB-2222', 'bystander@example.invalid', 'Active', 3);
  const exec = async (sql) => sql.split(';').map((s) => s.trim()).filter(Boolean).map((s) => (/^SELECT/i.test(s) ? d.raw.prepare(s).all().map((r) => ({ ...r })) : (d.raw.prepare(s).run(), [])));
  const all = () => ({ p: d.raw.prepare('SELECT COUNT(*) n FROM pioneers').get().n, s: d.raw.prepare('SELECT COUNT(*) n FROM social_accounts').get().n, v: d.raw.prepare('SELECT COUNT(*) n FROM email_verifications').get().n });
  return { d, exec, all };
}

test('identifiers are validated and cannot carry SQL', () => {
  assert.equal(identify('II-AB2C-3DEF').kind, 'pioneer_id');
  assert.equal(identify('  Person@Example.COM ').where, "private_email = 'person@example.com'");
  for (const bad of ["x'; DROP TABLE pioneers; --", 'a@b', 'II-AB2C', '', "o'brien@example.com", 'a b@example.com', 'x@y.z;drop']) assert.throws(() => identify(bad), /email address or a Pioneer ID/, bad);
  assert.ok(erasureSql('II-AB2C-3DEF').erase.at(-1).startsWith('DELETE FROM pioneers'), 'Pioneer row is deleted last');
});

test('dry run changes nothing', async () => {
  const { exec, all } = seed(); const before = all();
  const r = await runErasure({ exec, identifier: 'target@example.invalid' });
  assert.equal(r.erased, false); assert.deepEqual(r.before, { pioneers: 2, social_accounts: 3, email_verifications: 2 });
  assert.deepEqual(all(), before);
});

test('confirmed erasure by email removes every record for that person (incl. withdrawn) and nobody else', async () => {
  const { exec, all } = seed();
  const logs = []; const r = await runErasure({ exec, identifier: 'target@example.invalid', confirm: true, log: (m) => logs.push(m) });
  assert.equal(r.erased, true); assert.deepEqual(r.after, { pioneers: 0, social_accounts: 0, email_verifications: 0 });
  assert.deepEqual(all(), { p: 1, s: 3, v: 1 }, 'the bystander is untouched');
  assert.ok(!logs.join('\n').includes('target@'), 'output never prints the address');
  assert.equal((await runErasure({ exec, identifier: 'target@example.invalid', confirm: true })).erased, false, 'second run: nothing to erase');
});

test('confirmed erasure by Pioneer ID removes that registration only', async () => {
  const { exec, all } = seed();
  const r = await runErasure({ exec, identifier: 'ii-bbbb-2222', confirm: true });
  assert.deepEqual(r.before, { pioneers: 1, social_accounts: 3, email_verifications: 1 }); assert.equal(r.erased, true);
  assert.deepEqual(all(), { p: 2, s: 3, v: 2 });
});

test('with foreign keys on, a bare parent delete also cascades (belt and braces), and the script leaves nothing', async () => {
  const { d, exec, all } = seed();
  d.raw.exec('PRAGMA foreign_keys = ON');
  d.raw.prepare("DELETE FROM pioneers WHERE pioneer_id = 'II-BBBB-2222'").run();
  assert.deepEqual(all(), { p: 2, s: 3, v: 2 });
  await runErasure({ exec, identifier: 'target@example.invalid', confirm: true });
  assert.deepEqual(all(), { p: 0, s: 0, v: 0 });
});
