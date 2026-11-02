import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('site builds and passes static checks (links, required content, nothing private, seven routes)', () => {
  execFileSync('node', ['scripts/build.mjs'], { stdio: 'pipe' });
  const out = execFileSync('node', ['scripts/check-site.mjs'], { encoding: 'utf8' });
  assert.match(out, /site check OK/);
});
