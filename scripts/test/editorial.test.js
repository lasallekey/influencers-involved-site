import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseFrontMatter, renderMarkdown, renderInline, parsePublishedAt, loadArticles, buildEditorialPages, articleSchema } from '../editorial.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'src', 'content', 'editorial');
const DOMAIN = 'https://influencersinvolved.org';

test('front matter is parsed (quoted values with punctuation) and never part of the body', () => {
  const { meta, body } = parseFrontMatter('---\nid: GT1\nseo_title: "A: B, \\"C\\""\npublication_date: USE_ACTUAL_DATE\n---\n# H\n');
  assert.equal(meta.seo_title, 'A: B, "C"'); assert.equal(meta.publication_date, 'USE_ACTUAL_DATE'); assert.equal(body, '# H\n');
  assert.throws(() => parseFrontMatter('# no front matter'));
});

test('markdown: raw HTML and unsafe links stay inert; formatting and safe links work', () => {
  assert.equal(renderInline('<script>alert(1)</script> & **bold** *it*'), '&lt;script&gt;alert(1)&lt;/script&gt; &amp; <strong>bold</strong> <em>it</em>');
  assert.ok(!renderInline('[x](javascript:alert(1))').includes('href')); // the link is dropped; only inert text remains
  assert.ok(!renderInline('[x](data:text/html,hi)').includes('href'));
  assert.equal(renderInline('[x](http://insecure.example/)'), 'x');
  assert.equal(renderInline('[ok](https://example.org/a?b=1&c=2)'), '<a href="https://example.org/a?b=1&amp;c=2" rel="noopener">ok</a>');
  assert.equal(renderInline('[in](/editorial/x/)'), '<a href="/editorial/x/">in</a>');
  const inj = renderInline('[a](https://e.org/"onmouseover="alert(1))'); // a quote in a URL cannot break out of the attribute
  assert.ok(inj.includes('&quot;onmouseover=&quot;') && !/"onmouseover/.test(inj));
});

test('markdown: one H1 becomes the title, dek and note are separated, tables get scoped headers and a scroll cue', () => {
  const r = renderMarkdown('# Title\n\n*The dek.*\n\nBody with [link](https://example.org).\n\n## Section\n\n| A | B |\n|---|---|\n| one | [two](https://example.org) |\n\n*Closing note.*\n');
  assert.equal(r.title, 'Title'); assert.equal(r.dek, 'The dek.'); assert.equal(r.note, 'Closing note.');
  assert.ok(!r.html.includes('<h1')); assert.ok(r.html.includes('<h2 id="section">Section</h2>'));
  assert.ok(r.html.includes('<th scope="col">A</th>') && r.html.includes('<th scope="row">one</th>') && r.html.includes('class="table-hint"') && r.html.includes('tabindex="0"'));
  assert.throws(() => renderMarkdown('# One\n\n# Two'), /more than one H1/);
  assert.throws(() => renderMarkdown('No heading'), /no H1/);
});

test('publication date: null is undated, ISO with offset is accepted, anything else is rejected', () => {
  assert.equal(parsePublishedAt(null), null);
  assert.deepEqual(parsePublishedAt('2026-12-01T09:30:00-06:00'), { iso: '2026-12-01T09:30:00-06:00', display: 'December 1, 2026', ymd: '2026-12-01' });
  for (const bad of ['2026-12-01', '2026-12-01T09:00:00', 'Dec 1 2026', '2026-13-01T00:00:00Z', 'USE_ACTUAL_DATE']) assert.throws(() => parsePublishedAt(bad), bad);
});

test('the seven supplied articles load: unique ids and slugs, URLs match slugs, one H1 each, dek and disclosure present', () => {
  const a = loadArticles(dir, DOMAIN);
  assert.equal(a.length, 7);
  assert.deepEqual(a.map((x) => x.meta.id), ['GT26-01', 'GT26-02', 'GT26-03', 'GT26-04', 'GT26-05', 'GT26-06', 'GT26-07']);
  for (const x of a) { assert.ok(x.title.length > 20 && x.dek && x.note, x.file); assert.ok(!/^---|seo_title/.test(x.html), x.file); assert.ok(x.note.includes('Influencers Involved'), x.file); }
  assert.match(a[2].html, /short guide to documented 2026 animal-related GivingTuesday campaigns/, 'logged terminology correction present');
});

test('invalid content is refused: wrong URL for a slug, duplicate ids', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ed-'));
  cpSync(dir, tmp, { recursive: true });
  const f = join(tmp, '01-givingtuesday-2026-guide.md');
  writeFileSync(f, readFileSync(f, 'utf8').replace('/editorial/givingtuesday-2026-guide/', '/editorial/wrong/'));
  assert.throws(() => loadArticles(tmp, DOMAIN), /proposed_url/);
  const tmp2 = mkdtempSync(join(tmpdir(), 'ed-')); cpSync(dir, tmp2, { recursive: true });
  const g = join(tmp2, '02-givingtuesday-for-content-creators.md'); writeFileSync(g, readFileSync(g, 'utf8').replace('id: GT26-02', 'id: GT26-01'));
  assert.throws(() => loadArticles(tmp2, DOMAIN), /duplicate id/);
});

test('pages: undated build has no date and no datePublished; dated build shows one visible date that matches the schema', () => {
  const undated = buildEditorialPages({ dir, domain: DOMAIN, publishedAt: null }).pages;
  assert.equal(undated.length, 8); assert.equal(undated[0].path, '/editorial/');
  for (const p of undated.slice(1)) { assert.ok(!p.main.includes('<time'), p.path); assert.ok(!p.schemaTag.includes('datePublished'), p.path); assert.equal(p.lastmod, null); }
  const dated = buildEditorialPages({ dir, domain: DOMAIN, publishedAt: '2026-12-01T09:00:00-06:00' }).pages;
  for (const p of dated.slice(1)) {
    assert.ok(p.main.includes('<time datetime="2026-12-01T09:00:00-06:00">December 1, 2026</time>'), p.path);
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*)<\/script>/.exec(p.schemaTag)[1]);
    assert.equal(ld.datePublished, '2026-12-01T09:00:00-06:00'); assert.equal(ld['@type'], 'Article'); assert.equal(ld.author.name, 'Influencers Involved, Inc. NFP');
    assert.equal(p.lastmod, '2026-12-01');
  }
});

test('JSON-LD is safely serialized (a "<" can never close the script element)', () => {
  const a = { title: 'A </script><b> title', path: '/editorial/x/', meta: { meta_description: 'd </script>' } };
  const tag = articleSchema(a, DOMAIN, null);
  assert.equal((tag.match(/<\/script>/g) || []).length, 1);
  assert.ok(JSON.parse(/>(.*)<\/script>/.exec(tag)[1]).headline.includes('</script>'));
});

test('index lists each article exactly once, using the article titles, with real anchors', () => {
  const index = buildEditorialPages({ dir, domain: DOMAIN, publishedAt: null }).pages[0];
  const hrefs = [...index.main.matchAll(/<a href="(\/editorial\/[^"]+\/)"/g)].map((m) => m[1]);
  assert.equal(hrefs.length, 7); assert.equal(new Set(hrefs).size, 7);
  assert.ok(index.main.includes('<h1>Editorial</h1>') && !index.schemaTag);
});

test('release gate refuses to pass while the publication date and founder authorization are unrecorded', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('node', ['scripts/editorial-release-gate.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /publishedAt is not recorded/); assert.match(r.stderr, /Founder authorization/);
});

test('every external link in the articles is covered by the release-day source check; none goes through Zeffy or a tracker', async () => {
  const { CHECKS } = await import('../editorial-source-check.mjs');
  const covered = new Set(CHECKS.map((c) => c.url));
  const urls = new Set();
  for (const a of loadArticles(dir, DOMAIN)) for (const m of a.html.matchAll(/href="(https:\/\/[^"]+)"/g)) urls.add(m[1].replace(/&amp;/g, '&'));
  for (const u of urls) {
    if (u.startsWith('https://influencersinvolved.org/')) continue;
    assert.ok(covered.has(u), `not covered by editorial-source-check: ${u}`);
    assert.ok(!/zeffy|utm_|ref=|affiliate/i.test(u), u);
  }
  assert.equal([...urls].filter((u) => !u.startsWith('https://influencersinvolved.org/')).length, 17); // the brief's 18 includes the II Challenge link; the source check also covers the GivingTuesday U.S. date page that is cited only in the register
});

test('the production workflow runs the editorial release gate before anything is created, migrated or deployed', () => {
  const wf = readFileSync(join(root, '.github/workflows/production.yml'), 'utf8');
  const at = (needle) => { const i = wf.indexOf(needle); assert.ok(i > -1, `missing: ${needle}`); return i; };
  const gate = at('run: npm run check:editorial-release');
  for (const later of ['d1-provision.mjs production', 'migrations apply', 'wrangler deploy --env production', 'wrangler secret put']) assert.ok(gate < at(later), `gate must come before ${later}`);
  assert.ok(at('npm run build') < gate, 'the gate inspects the freshly built site');
  assert.ok(!/continue-on-error/.test(wf.slice(wf.lastIndexOf('- name:', gate), gate + 400)), 'the gate step must not be allowed to fail silently');
});

test('GT26-02 supports its "many forms of generosity" statement with the official FAQ page', () => {
  const a = loadArticles(dir, DOMAIN).find((x) => x.meta.id === 'GT26-02');
  assert.match(a.html, /GivingTuesday&#39;s <a href="https:\/\/www\.givingtuesday\.org\/about\/faq\/" rel="noopener">official participation resources<\/a> include many forms of generosity besides fundraising\./);
  assert.ok(!a.html.includes('givingtuesday.org/participate/'));
});

test('every article invites readers to the Challenge registration at /challenge/#join; the guides carry it most prominently; no absolute or bare challenge links remain', () => {
  const articles = loadArticles(dir, DOMAIN);
  assert.equal(articles.length, 7);
  for (const a of articles) {
    const src = readFileSync(join(dir, a.file), 'utf8');
    const links = [...src.matchAll(/\]\(([^)\s]*challenge[^)\s]*)\)/g)].map((m) => m[1]);
    assert.ok(links.length >= 1, `${a.meta.slug}: no Challenge link`);
    for (const l of links) assert.equal(l, '/challenge/#join', `${a.meta.slug}: Challenge links must go to the registration form`);
    if (['GT26-01', 'GT26-02'].includes(a.meta.id)) assert.ok(links.length >= 2, `${a.meta.slug}: the general and creator guides carry the clearest invitations (two or more)`);
  }
});

test('the built articles link to /challenge/#join and the Challenge page has a #join target', () => {
  const challenge = readFileSync(join(root, 'site', 'challenge', 'index.html'), 'utf8');
  assert.match(challenge, /id="join"/);
  for (const slug of ['givingtuesday-2026-guide', 'givingtuesday-for-content-creators', 'how-to-choose-a-givingtuesday-charity', 'givingtuesday-2026-animal-charity-campaigns', 'safe-haven-for-cats-givingtuesday-2026', 'staf-just-one-more-givingtuesday-2026', 'dogs-for-better-lives-givingtuesday-2026']) {
    const html = readFileSync(join(root, 'site', 'editorial', slug, 'index.html'), 'utf8');
    assert.match(html, /href="\/challenge\/#join"/, slug);
    assert.doesNotMatch(html, /href="https:\/\/influencersinvolved\.org\/challenge\/"/, slug);
  }
});

test('the voice stays honest: no article promises donations, partnerships or equates a pledge with giving already done', () => {
  for (const a of loadArticles(dir, DOMAIN)) {
    const src = readFileSync(join(dir, a.file), 'utf8');
    assert.doesNotMatch(src, /\b(official partner|in partnership with|guaranteed?|will raise|donations? (?:are|is) guaranteed)\b/i, a.meta.slug);
    assert.doesNotMatch(src, /pledge[^.]{0,40}(is|=|equals) (a )?donation/i, a.meta.slug);
  }
});
