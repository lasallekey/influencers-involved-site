// Privacy erasure: removes ONE person's registration (by registered email address or Pioneer ID) from D1,
// explicitly and children-first, then proves nothing is left. Dry run by default.
//
//   node scripts/erase-pioneer.mjs <email | II-XXXX-XXXX> --env staging|production            # dry run: counts only
//   node scripts/erase-pioneer.mjs <email | II-XXXX-XXXX> --env staging|production --confirm  # actually delete
//
// Run it only after confirming the requester controls the registered address (reply from / to that inbox).
// Output never prints names, email addresses or handles. Needs Cloudflare credentials (see docs/OPERATIONS.md).
// The erasure does not rely on ON DELETE CASCADE: each table is deleted explicitly and then re-counted.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DB = { staging: 'ii-pioneer-registry-staging', production: 'ii-pioneer-registry-production' };
const ID = /^II-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const EMAIL = /^[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,190}\.[A-Za-z]{2,}$/; // no quotes or whitespace: safe to embed as a literal

/** Returns the WHERE fragment for either identifier kind, or throws. Inputs are validated, never trusted. */
export function identify(input) {
  const t = String(input || '').trim();
  if (ID.test(t.toUpperCase())) return { kind: 'pioneer_id', where: `pioneer_id = '${t.toUpperCase()}'` };
  if (EMAIL.test(t)) return { kind: 'email', where: `private_email = '${t.toLowerCase()}'` };
  throw new Error('Give either a registered email address or a Pioneer ID like II-ABCD-2345.');
}

/** The statements, in order. `ids` is the sub-select of Pioneer IDs matching the person. */
export function erasureSql(input) {
  const { where } = identify(input);
  const ids = `(SELECT pioneer_id FROM pioneers WHERE ${where})`;
  return {
    count: [
      `SELECT COUNT(*) AS n FROM pioneers WHERE ${where}`,
      `SELECT COUNT(*) AS n FROM social_accounts WHERE pioneer_id IN ${ids}`,
      `SELECT COUNT(*) AS n FROM email_verifications WHERE pioneer_id IN ${ids}`,
    ],
    // Children first, the Pioneer row last. If anything stops part-way, the Pioneer row still exists and the script can simply be run again.
    erase: [
      `DELETE FROM email_verifications WHERE pioneer_id IN ${ids}`,
      `DELETE FROM social_accounts WHERE pioneer_id IN ${ids}`,
      `DELETE FROM pioneers WHERE ${where}`,
    ],
  };
}

const counts = async (exec, sql) => {
  const r = await exec(sql.count.join('; '));
  return { pioneers: r[0][0].n, social_accounts: r[1][0].n, email_verifications: r[2][0].n };
};

/**
 * exec(sqlString) → Promise<Array<Array<row>>> (one result list per statement).
 * Returns { before, after, erased } and throws if anything remains after a confirmed erasure.
 */
export async function runErasure({ exec, identifier, confirm = false, log = () => {} }) {
  const sql = erasureSql(identifier);
  const before = await counts(exec, sql);
  log(`Found: ${before.pioneers} registration(s), ${before.social_accounts} social account(s), ${before.email_verifications} verification record(s).`);
  if (!before.pioneers) { log('Nothing to erase.'); return { before, after: before, erased: false }; }
  if (!confirm) { log('Dry run: nothing deleted. Re-run with --confirm to erase.'); return { before, after: before, erased: false }; }
  await exec(sql.erase.join('; '));
  const after = await counts(exec, sql);
  if (after.pioneers || after.social_accounts || after.email_verifications) throw new Error(`Erasure incomplete: ${JSON.stringify(after)}. Run again.`);
  log('Erased. Re-count: 0 registrations, 0 social accounts, 0 verification records remain for this person.');
  return { before, after, erased: true };
}

/** Executes SQL against the remote D1 database with wrangler (needs CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID). */
export function wranglerExec(env) {
  if (!DB[env]) throw new Error('--env must be staging or production');
  return async (sql) => {
    const out = execFileSync('npx', ['wrangler', 'd1', 'execute', DB[env], '--remote', '--env', env, '--config', 'worker/wrangler.toml', '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    return JSON.parse(out.slice(out.indexOf('['))).map((s) => s.results || []);
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const identifier = a.find((x) => !x.startsWith('--') && a[a.indexOf(x) - 1] !== '--env');
  const env = a.includes('--env') ? a[a.indexOf('--env') + 1] : '';
  try {
    if (!identifier || !env) throw new Error('Usage: node scripts/erase-pioneer.mjs <email | Pioneer ID> --env staging|production [--confirm]');
    console.log(`Database: ${DB[env] || '(unknown env)'}`);
    await runErasure({ exec: wranglerExec(env), identifier, confirm: a.includes('--confirm'), log: (m) => console.log(m) });
  } catch (e) { console.error(e.message); process.exit(1); }
}
