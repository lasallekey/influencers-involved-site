// Idempotently creates the staging D1 database (free tier) and writes its id into worker/wrangler.toml.
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (set by the staging workflow).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'ii-pioneer-registry-staging';
const toml = join(dirname(fileURLToPath(import.meta.url)), '..', 'worker', 'wrangler.toml');
const wrangler = (args) => execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const find = () => JSON.parse(wrangler(['d1', 'list', '--json'])).find((d) => d.name === NAME);

let db = find();
if (!db) { console.log(`Creating D1 database ${NAME}…`); wrangler(['d1', 'create', NAME]); db = find(); }
const id = db && (db.uuid || db.database_id);
if (!id) { console.error('Could not determine the staging database id.'); process.exit(1); }
const src = readFileSync(toml, 'utf8');
if (src.includes('REPLACE_STAGING_D1_ID')) writeFileSync(toml, src.replace('REPLACE_STAGING_D1_ID', id));
console.log(`Staging database ${NAME} ready (${id.slice(0, 8)}…).`);
