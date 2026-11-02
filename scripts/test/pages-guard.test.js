import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// The only files the legacy GitHub Pages site publishes. Anything else at the repository root must be excluded.
const LEGACY = new Set(['CNAME', 'PIONEER_REGISTRY_APPS_SCRIPT.gs', 'PIONEER_REGISTRY_SETUP.md', 'README_DEPLOYMENT.md', 'index.html', 'pioneer.css', 'pioneer.js']);

test('GitHub Pages would publish only the legacy files: every other root entry is excluded and .nojekyll is absent', () => {
  assert.ok(!existsSync(join(root, '.nojekyll')), '.nojekyll would make Pages publish the whole repository');
  const cfg = readFileSync(join(root, '_config.yml'), 'utf8');
  const exclude = new Set([...cfg.matchAll(/^\s*-\s+(\S+)\s*$/gm)].map((m) => m[1]));
  const published = readdirSync(root).filter((n) => !/^[._#~]/.test(n) && n !== 'node_modules' && !exclude.has(n));
  assert.deepEqual(published.sort(), [...LEGACY].filter((n) => existsSync(join(root, n))).sort());
  for (const n of ['docs', 'worker', 'src', 'site', 'scripts', 'shared']) assert.ok(exclude.has(n), `${n} must be excluded from GitHub Pages`);
});
