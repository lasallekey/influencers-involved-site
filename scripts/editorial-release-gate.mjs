// Release gate for the GivingTuesday editorial batch. It FAILS (exit 1) until the founder-authorized release commit has recorded
// the publication date, rebuilt site/ with it, and updated docs/editorial/RELEASE_RECORD.md. Run before any production workflow:
//   npm run check:editorial-release
// Normal CI does not run it (a draft PR is expected to fail it); it is the explicit stop between "staged" and "published".
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePublishedAt } from './editorial.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];
const ROUTES = ['/editorial/', '/editorial/givingtuesday-2026-guide/', '/editorial/givingtuesday-for-content-creators/', '/editorial/how-to-choose-a-givingtuesday-charity/', '/editorial/givingtuesday-2026-animal-charity-campaigns/', '/editorial/safe-haven-for-cats-givingtuesday-2026/', '/editorial/staf-just-one-more-givingtuesday-2026/', '/editorial/dogs-for-better-lives-givingtuesday-2026/'];

let published = null;
try { published = parsePublishedAt(JSON.parse(readFileSync(join(root, 'src/content/editorial/publication.json'), 'utf8')).publishedAt); } catch (e) { fail.push(`publication.json: ${e.message}`); }
if (!published) fail.push('publishedAt is not recorded in src/content/editorial/publication.json (set it in the founder-authorized release commit)');
else {
  if (Date.parse(published.iso) > Date.now() + 5 * 60e3) fail.push(`publishedAt ${published.iso} is in the future`);
  const sm = readFileSync(join(root, 'site/sitemap.xml'), 'utf8');
  for (const r of ROUTES) {
    const p = join(root, 'site', r, 'index.html');
    if (!existsSync(p)) { fail.push(`site${r}index.html is missing (run npm run build)`); continue; }
    const html = readFileSync(p, 'utf8');
    if (r !== '/editorial/' && (!html.includes(`<time datetime="${published.iso}">${published.display}</time>`) || !html.includes(`"datePublished":"${published.iso}"`))) fail.push(`${r}: built page does not show the recorded date (rebuild and commit site/)`);
    if (!sm.includes(`<loc>https://influencersinvolved.org${r}</loc><lastmod>${published.ymd}</lastmod>`)) fail.push(`${r}: sitemap lastmod is not ${published.ymd}`);
  }
}
const rec = readFileSync(join(root, 'docs/editorial/RELEASE_RECORD.md'), 'utf8');
if (!/^Founder authorization: GRANTED \(.+\)$/m.test(rec)) fail.push('RELEASE_RECORD.md: "Founder authorization: GRANTED (<who, when>)" is not recorded');
if (!/^Release-day fact check: COMPLETED \(.+\)$/m.test(rec)) fail.push('RELEASE_RECORD.md: "Release-day fact check: COMPLETED (<who, when>)" is not recorded');
if (/^\| GT26-0\d .*\| BLOCKED/m.test(rec)) fail.push('RELEASE_RECORD.md: an article is still marked BLOCKED (hold it, remove it from the index, or resolve it)');

if (fail.length) { console.error('Editorial release gate: NOT READY\n- ' + fail.join('\n- ')); process.exit(1); }
console.log(`Editorial release gate: OK (published ${published.iso})`);
