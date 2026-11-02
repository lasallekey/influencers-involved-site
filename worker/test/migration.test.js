import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createD1 } from '../dev/d1-sqlite.js';

const sql = (f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');

test('migration 0002 preserves existing registrations, makes the profile URL optional and flags test records', () => {
  const d = createD1(); const db = d.raw;
  db.exec(sql('0001_init.sql'));
  const ins = (id, email, charity) => db.prepare(`INSERT INTO pioneers (pioneer_id,submitted_at,creator_name,private_email,country,selected_charity,pledge_date,privacy_preference,collaboration_interest,consent_version,consented_at,idempotency_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, '2026-10-01T00:00:00Z', 'Old ' + id, email, 'US', charity, '2026-10-01', 'public', 'Not now', 'v1', '2026-10-01T00:00:00Z', 'k' + id);
  ins('II-AAAA-AAAA', 'real.person@creatormail.dev', 'Feeding America');
  ins('II-BBBB-BBBB', 'smoke+1@example.invalid', 'Test Charity');
  db.prepare('INSERT INTO social_accounts (pioneer_id,platform,handle_or_channel,profile_url,public_display_permission) VALUES (?,?,?,?,?)').run('II-AAAA-AAAA', 'YouTube', '@OldHandle', 'https://youtube.com/@OldHandle', 1);
  db.prepare('INSERT INTO email_verifications (pioneer_id,token_hash,created_at,expires_at) VALUES (?,?,?,?)').run('II-AAAA-AAAA', 'h1', 'a', 'b');

  db.exec(sql('0002_registry_refinements.sql'));

  const p = db.prepare('SELECT pioneer_id, creator_name, selected_charity, charity_status, charity_key, is_test FROM pioneers ORDER BY pioneer_id').all();
  assert.equal(p.length, 2);
  assert.deepEqual([p[0].pioneer_id, p[0].creator_name, p[0].selected_charity, p[0].charity_status, p[0].charity_key, p[0].is_test], ['II-AAAA-AAAA', 'Old II-AAAA-AAAA', 'Feeding America', 'selected', 'feeding america', 0]);
  assert.equal(p[1].is_test, 1, 'example.invalid is a test address');
  const a = db.prepare('SELECT * FROM social_accounts').all();
  assert.equal(a.length, 1); assert.equal(a[0].profile_url, 'https://youtube.com/@OldHandle'); assert.equal(a[0].handle_normalized, 'oldhandle'); assert.equal(a[0].public_display_permission, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM email_verifications').get().n, 1, 'dependent rows survive');
  // the URL column now accepts NULL, and the foreign key still protects integrity
  db.prepare('INSERT INTO social_accounts (pioneer_id,platform,handle_or_channel,handle_normalized,profile_url) VALUES (?,?,?,?,NULL)').run('II-AAAA-AAAA', 'TikTok', '@x', 'x');
  assert.throws(() => db.prepare('INSERT INTO social_accounts (pioneer_id,platform,handle_or_channel,handle_normalized) VALUES (?,?,?,?)').run('II-NOPE-NOPE', 'TikTok', '@y', 'y'));
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((r) => r.name);
  for (const n of ['idx_social_pioneer', 'idx_social_handle', 'idx_pioneers_eligible', 'idx_pioneers_email_active']) assert.ok(idx.includes(n), n);
});
