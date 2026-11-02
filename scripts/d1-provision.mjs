// Idempotently creates the D1 database for an environment and writes its id into worker/wrangler.toml
// (in the CI workspace only; the id is not a secret but is not committed either).
//   node scripts/d1-provision.mjs staging
//   node scripts/d1-provision.mjs production --create     (production never creates a database unless --create is given)
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (set by the workflows).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENVS = {
  staging: { name: 'ii-pioneer-registry-staging', placeholder: 'REPLACE_STAGING_D1_ID' },
  production: { name: 'ii-pioneer-registry-production', placeholder: 'REPLACE_PRODUCTION_D1_ID' },
};
const env = process.argv[2] || 'staging';
const allowCreate = env !== 'production' || process.argv.includes('--create');
if (!ENVS[env]) { console.error('Usage: node scripts/d1-provision.mjs staging|production [--create]'); process.exit(2); }
const { name, placeholder } = ENVS[env];
const toml = join(dirname(fileURLToPath(import.meta.url)), '..', 'worker', 'wrangler.toml');
const wrangler = (args) => execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const find = () => JSON.parse(wrangler(['d1', 'list', '--json'])).find((d) => d.name === name);

let db = find();
if (!db && !allowCreate) { console.error(`D1 database ${name} does not exist. Re-run the workflow with "Create the production database" ticked to create it (one time).`); process.exit(1); }
if (!db) { console.log(`Creating D1 database ${name}…`); wrangler(['d1', 'create', name]); db = find(); }
const id = db && (db.uuid || db.database_id);
if (!id) { console.error(`Could not determine the ${env} database id.`); process.exit(1); }
const src = readFileSync(toml, 'utf8');
if (src.includes(placeholder)) writeFileSync(toml, src.replace(placeholder, id));
console.log(`${env} database ${name} ready (${id.slice(0, 8)}…).`);
