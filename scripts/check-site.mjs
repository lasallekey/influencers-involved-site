// Static checks on the built site: internal links resolve, required public links exist, forbidden content is absent.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const problems = [];
const pages = [];
(function walk(d) { for (const n of readdirSync(d)) { const f = join(d, n); statSync(f).isDirectory() ? walk(f) : n.endsWith('.html') && pages.push(f); } })(root);

const resolve = (href) => {
  const p = href.split('#')[0].split('?')[0];
  if (!p) return true;
  const f = join(root, p);
  return existsSync(f) ? (statSync(f).isDirectory() ? existsSync(join(f, 'index.html')) : true) : false;
};

for (const f of pages) {
  const html = readFileSync(f, 'utf8');
  const name = f.slice(root.length);
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(https:|mailto:|#|data:)/.test(u)) { if (/^http:/.test(u)) problems.push(`${name}: insecure link ${u}`); continue; }
    if (u.startsWith('http:')) problems.push(`${name}: insecure link ${u}`);
    else if (u.startsWith('/') && !resolve(u)) problems.push(`${name}: broken internal link ${u}`);
  }
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) { if (html.split(`id="${m[1]}"`).length > 2) problems.push(`${name}: duplicate id ${m[1]}`); }
  if (/paypal/i.test(html)) problems.push(`${name}: mentions PayPal`);
  if (/donorbox|\bstripe\b/i.test(html)) problems.push(`${name}: mentions a donation provider that is not active (Donorbox/Stripe)`);
  if (/have not yet established a separate international/i.test(html)) problems.push(`${name}: outdated international-donation notice`);
  if (/\sstyle="/.test(html)) problems.push(`${name}: inline style attribute (CSP)`);
  if (/<script(?![^>]*(src=|application\/ld\+json))[^>]*>/.test(html)) problems.push(`${name}: inline script`);
  // Only the two confirmed official channels may link to YouTube/TikTok.
  for (const m of html.matchAll(/(?:href)="(https?:\/\/[^"]*(?:youtube\.com|youtu\.be|tiktok\.com)[^"]*)"/gi)) if (!['https://www.youtube.com/@InfluencersInvolved', 'https://www.tiktok.com/@influencersinvolved'].includes(m[1])) problems.push(`${name}: unconfirmed YouTube/TikTok URL ${m[1]}`);
  { const socs = [...html.matchAll(/<a class="soc" href="([^"]+)"[^>]*aria-label="Influencers Involved on ([A-Za-z]+) \(opens in a new tab\)"><svg/g)]; if (socs.length < 5) problems.push(`${name}: expected the five social icon links, found ${socs.length}`); }
  if (!/<title>[^<]{10,}<\/title>/.test(html) || !/name="description" content="[^"]{40,}"/.test(html)) problems.push(`${name}: missing title/description`);
  if (!/rel="canonical"/.test(html)) problems.push(`${name}: missing canonical`);
  // Analytics: consent UI everywhere; Google is only ever loaded by analytics.js after consent, never referenced in page HTML.
  if (!/src="\/assets\/analytics\.js"/.test(html) || !/id="consent"/.test(html) || !/data-consent="accept"/.test(html) || !/data-consent="reject"/.test(html) || !/data-consent-open/.test(html)) problems.push(`${name}: consent banner / Cookie preferences control missing`);
  if (/googletagmanager|google-analytics|gtag\(/i.test(html)) problems.push(`${name}: Google Analytics referenced directly in HTML (must load only after consent)`);
}

// Required public facts and links
const all = pages.map((f) => readFileSync(f, 'utf8')).join('\n');
const need = ['https://www.youtube.com/@InfluencersInvolved', 'https://www.tiktok.com/@influencersinvolved', 'Analytics and cookies', 'Cookie preferences', 'https://www.zeffy.com/en-US/donation-form/support-influencers-involved', 'https://www.facebook.com/InfluencersInvolved', 'https://www.instagram.com/influencersinvolved', 'https://www.linkedin.com/company/influencersinvolved', 'EIN 39-2242545', '800 W Central Rd, Suite 120', 'grants@influencersinvolved.org', 'U.S. &amp; International Donations', 'Support Influencers Involved from the United States or abroad. Donate securely by card through Zeffy.', '100% of your intended donation goes to Influencers Involved, with no platform or processing fees deducted by Zeffy. A separate optional contribution to Zeffy may be offered at checkout.', 'Donations are processed in U.S. dollars (USD). Your bank may apply currency conversion or foreign transaction fees. Card availability may vary by country.'];
for (const n of need) if (!all.includes(n)) problems.push(`missing required content: ${n}`);

// Structured data lists exactly the five official accounts.
{ const m = /<script type="application\/ld\+json">([^<]+)<\/script>/.exec(readFileSync(join(root, 'index.html'), 'utf8')); const same = m ? JSON.parse(m[1]).sameAs : [];
  const want = ['https://www.facebook.com/InfluencersInvolved', 'https://www.instagram.com/influencersinvolved', 'https://www.linkedin.com/company/influencersinvolved', 'https://www.youtube.com/@InfluencersInvolved', 'https://www.tiktok.com/@influencersinvolved'];
  if (JSON.stringify([...same].sort()) !== JSON.stringify([...want].sort())) problems.push(`structured data sameAs wrong: ${JSON.stringify(same)}`); }

// Nothing private may ship in the public output.
const bundle = [...pages, join(root, 'assets/site.js'), join(root, 'assets/analytics.js'), join(root, 'assets/site-config.js')].map((f) => readFileSync(f, 'utf8')).join('\n');
for (const bad of [/primushomecare/i, /@gmail\.com/i, /api[_-]?key/i, /BEGIN [A-Z ]*PRIVATE KEY/, /ho@influencersinvolved/i, /inflencers/i]) if (bad.test(bundle)) problems.push(`forbidden pattern in public output: ${bad}`);

if (!process.env.STAGING && /stage-banner|Staging preview/.test(all)) problems.push('staging banner present in a production build');

// Fifteen routes in the sitemap (seven core + the editorial index + seven articles), no extras, no duplicates.
const CORE = ['/', '/challenge/', '/about/', '/transparency/', '/donate/', '/contact/', '/privacy/'];
const EDITORIAL = ['/editorial/', '/editorial/givingtuesday-2026-guide/', '/editorial/givingtuesday-for-content-creators/', '/editorial/how-to-choose-a-givingtuesday-charity/', '/editorial/givingtuesday-2026-animal-charity-campaigns/', '/editorial/safe-haven-for-cats-givingtuesday-2026/', '/editorial/staf-just-one-more-givingtuesday-2026/', '/editorial/dogs-for-better-lives-givingtuesday-2026/'];
const sm = readFileSync(join(root, 'sitemap.xml'), 'utf8');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace('https://influencersinvolved.org', ''));
if (locs.length !== 15 || new Set(locs).size !== 15 || ![...CORE, ...EDITORIAL].every((r) => locs.includes(r))) problems.push(`sitemap routes wrong: ${locs}`);

// ---- Editorial: one canonical, H1, real byline, schema, links, sources, no media, no payment routing ----
{
  const OFFICIAL = /^(www\.givingtuesday\.org|consumer\.ftc\.gov|www\.irs\.gov|www\.safehavenforcats\.org|staf\.org|dogsforbetterlives\.org|operationpetsalive\.org|influencersinvolved\.org)$/;
  const read = (r) => readFileSync(join(root, r, 'index.html'), 'utf8');
  const idx = read('/editorial/');
  const titles = new Set(), descs = new Set();
  const indexAnchors = [...idx.matchAll(/<a href="(\/editorial\/[^"]+\/)"/g)].map((m) => m[1]);
  for (const r of EDITORIAL) {
    const html = read(r), name = r;
    const canon = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map((m) => m[1]);
    if (canon.length !== 1 || canon[0] !== `https://influencersinvolved.org${r}`) problems.push(`${name}: canonical wrong (${canon})`);
    if ((html.match(/<h1[ >]/g) || []).length !== 1) problems.push(`${name}: needs exactly one H1`);
    if ((html.match(/<meta property="og:title"/g) || []).length !== 1 || (html.match(/<meta property="og:type"/g) || []).length !== 1) problems.push(`${name}: duplicate or missing og tags`);
    const ogType = /<meta property="og:type" content="([^"]+)"/.exec(html)[1];
    if (ogType !== (r === '/editorial/' ? 'website' : 'article')) problems.push(`${name}: og:type ${ogType}`);
    const t = /<title>([^<]+)<\/title>/.exec(html)[1], d = /name="description" content="([^"]+)"/.exec(html)[1];
    if (titles.has(t) || descs.has(d)) problems.push(`${name}: title or description is not unique`);
    titles.add(t); descs.add(d);
    if (/^seo_title:|^og_title:|^publication_date:|USE_ACTUAL_DATE|hero_image_brief/m.test(html)) problems.push(`${name}: front matter leaked into the page`);
    if (/<img\b/i.test(html.replace(/<header class="site-header">[\s\S]*?<\/header>|<footer[\s\S]*<\/footer>/g, ''))) problems.push(`${name}: editorial pages must not embed third-party or unreviewed images`);
    const main = /<main[\s\S]*?<\/main>/.exec(html)[0];
    for (const m of main.matchAll(/href="(https?:\/\/[^"]+)"/g)) { const h = new URL(m[1]).hostname; if (!OFFICIAL.test(h)) problems.push(`${name}: unexpected external host ${h}`); if (/zeffy/i.test(h)) problems.push(`${name}: donations to featured charities must not route through Zeffy`); }
    if (/zeffy/i.test(main)) problems.push(`${name}: mentions Zeffy`);
    if (r !== '/editorial/') {
      if (!main.includes('<nav class="ed-crumbs" aria-label="Breadcrumb"><ol><li><a href="/editorial/">Editorial</a></li>')) problems.push(`${name}: breadcrumb back to /editorial/ missing`);
      if (!/<p class="ed-byline"><span>By Influencers Involved<\/span>/.test(main)) problems.push(`${name}: byline missing`);
      if (!/<aside class="ed-note"/.test(main)) problems.push(`${name}: independent-editorial disclosure missing`);
      const ldm = /<script type="application\/ld\+json">([^<]+)<\/script>/.exec(html);
      if (!ldm) problems.push(`${name}: Article JSON-LD missing`);
      else {
        const ld = JSON.parse(ldm[1]), h1 = /<h1>([\s\S]*?)<\/h1>/.exec(main)[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        if (ld['@type'] !== 'Article' || ld.headline !== h1 || ld.mainEntityOfPage !== `https://influencersinvolved.org${r}` || ld.author?.['@type'] !== 'Organization' || ld.author?.name !== 'Influencers Involved, Inc. NFP' || ld.description !== d.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")) problems.push(`${name}: Article JSON-LD does not match the visible page`);
        const time = /<time datetime="([^"]+)">([^<]+)<\/time>/.exec(main);
        if (!!time !== !!ld.datePublished || (time && time[1] !== ld.datePublished)) problems.push(`${name}: visible date and datePublished disagree`);
        for (const bad of ['FAQPage', 'Review', 'AggregateRating', 'Event', 'Person', 'dateModified', 'image']) if (JSON.stringify(ld).includes(`"${bad}"`) || ld[bad]) problems.push(`${name}: schema must not include ${bad}`);
      }
      const n = indexAnchors.filter((a) => a === r).length;
      if (n !== 1) problems.push(`${name}: expected exactly one index entry, found ${n}`);
    } else if (/application\/ld\+json/.test(html)) problems.push('/editorial/: the index must not carry Article schema');
  }
  if (indexAnchors.length !== 7) problems.push(`index lists ${indexAnchors.length} article links, expected 7`);
  // Link graph from the brief: who must link to whom.
  const need = { guide: ['givingtuesday-for-content-creators', 'how-to-choose-a-givingtuesday-charity'], creators: ['how-to-choose-a-givingtuesday-charity'], choose: ['givingtuesday-2026-animal-charity-campaigns'], roundup: ['safe-haven-for-cats-givingtuesday-2026', 'staf-just-one-more-givingtuesday-2026', 'dogs-for-better-lives-givingtuesday-2026'], feature: ['givingtuesday-2026-animal-charity-campaigns', 'givingtuesday-for-content-creators'] };
  const g = { 'givingtuesday-2026-guide': need.guide, 'givingtuesday-for-content-creators': need.creators, 'how-to-choose-a-givingtuesday-charity': need.choose, 'givingtuesday-2026-animal-charity-campaigns': need.roundup };
  for (const f of ['safe-haven-for-cats-givingtuesday-2026', 'staf-just-one-more-givingtuesday-2026', 'dogs-for-better-lives-givingtuesday-2026']) g[f] = need.feature;
  for (const [slug, targets] of Object.entries(g)) { const html = read(`/editorial/${slug}/`); for (const t of targets) if (!html.includes(`href="/editorial/${t}/"`)) problems.push(`/editorial/${slug}/: must link to /editorial/${t}/`); }
  // The Editorial entry is discoverable from the footer of every core page.
  for (const r of CORE) if (!read(r === '/' ? '' : r).includes('<a href="/editorial/">Editorial</a>')) problems.push(`${r}: footer link to /editorial/ missing`);
  // The comparison table keeps its semantics.
  const rt = read('/editorial/givingtuesday-2026-animal-charity-campaigns/');
  if ((rt.match(/<th scope="col">/g) || []).length !== 3 || (rt.match(/<th scope="row">/g) || []).length !== 4 || !/class="table-hint"/.test(rt) || !/<div class="table-wrap" role="region" aria-label="[^"]+" tabindex="0">/.test(rt)) problems.push('animal roundup: accessible table markup missing');
}

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`site check OK: ${pages.length} html files, ${locs.length} routes`);
