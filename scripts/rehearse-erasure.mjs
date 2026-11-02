// Rehearses the privacy-erasure procedure end to end against a deployed environment using SYNTHETIC data only:
//   node scripts/rehearse-erasure.mjs <base-url> staging|production
// Registers two synthetic people through the public API (smoke+...@example.invalid → flagged as tests, never counted),
// erases one with scripts/erase-pioneer.mjs (dry run first), and proves the other is untouched.
// Needs Cloudflare credentials in the environment (the staging workflow provides them). Leftover synthetic
// "bystander" records are removed by worker/cleanup-smoke.sql, which the workflow runs next.
import { runErasure, wranglerExec } from './erase-pioneer.mjs';

const base = (process.argv[2] || '').replace(/\/$/, '');
const env = process.argv[3] || 'staging';
if (!/^https?:\/\//.test(base)) { console.error('Usage: node scripts/rehearse-erasure.mjs <base-url> staging|production'); process.exit(2); }
let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failed++; };
const stamp = Date.now();
const person = (tag, accounts) => ({
  idempotency_key: `erase-${tag}-${stamp}-abcdef`, consent_version: '2026-10-30', creator_name: `Synthetic ${tag}`, email: `smoke+erase-${tag}-${stamp}@example.invalid`, country: 'US',
  pledge_date: new Date().toISOString().slice(0, 10), charity_status: 'selected', charity: 'Synthetic Test Charity', pledge_confirmed: true, certificate_ack: true,
  privacy_preference: 'public', general_email_opt_in: false, collaboration_interest: 'Not now', collaboration_types: [], collab_contact_opt_in: false, ii_extra_note: '',
  accounts: accounts.map((h, i) => ({ platform: ['YouTube', 'Instagram', 'TikTok'][i], handle: `@${tag}${stamp}${i}`, public_display_permission: false })),
});
const post = async (b) => (await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();

const target = person('target', ['a', 'b']), bystander = person('bystander', ['a', 'b', 'c']);
const [t, b] = [await post(target), await post(bystander)];
ok(t.ok && b.ok, `two synthetic registrations saved (${t.pioneer_id}, ${b.pioneer_id})`);
const exec = wranglerExec(env);
const dry = await runErasure({ exec, identifier: target.email });
ok(!dry.erased && dry.before.pioneers === 1 && dry.before.social_accounts === 2 && dry.before.email_verifications === 1, 'dry run finds 1 registration, 2 accounts, 1 verification record and deletes nothing');
const real = await runErasure({ exec, identifier: t.pioneer_id, confirm: true, log: (m) => console.log('  ' + m) });
ok(real.erased && !real.after.pioneers && !real.after.social_accounts && !real.after.email_verifications, 'confirmed erasure by Pioneer ID leaves nothing for that person');
const other = await runErasure({ exec, identifier: bystander.email });
ok(other.before.pioneers === 1 && other.before.social_accounts === 3, 'the other synthetic person is untouched');
const again = await (await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...target, idempotency_key: `erase-again-${stamp}-abcdef` }) })).json();
ok(again.ok === true, 'the erased address can register again (no stale uniqueness or tombstone data)');
await runErasure({ exec, identifier: target.email, confirm: true }); // tidy the re-registration
console.log(failed ? `\n${failed} check(s) FAILED` : '\nErasure rehearsal passed');
process.exit(failed ? 1 : 0);
