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

// Seven routes, in the sitemap, no extras.
const sm = readFileSync(join(root, 'sitemap.xml'), 'utf8');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace('https://influencersinvolved.org', ''));
if (locs.length !== 7 || !['/', '/challenge/', '/about/', '/transparency/', '/donate/', '/contact/', '/privacy/'].every((r) => locs.includes(r))) problems.push(`sitemap routes wrong: ${locs}`);

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`site check OK: ${pages.length} html files, ${locs.length} routes`);
