// Renders src/ page fragments into the static site/ directory. No dependencies.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STAGING = process.env.STAGING === '1'; // staging preview: visible banner + noindex everywhere
const PRELAUNCH = process.env.PRELAUNCH === '1'; // production dark launch (before the domain cutover): no banner, but noindex everywhere
const NOINDEX = STAGING || PRELAUNCH;
// Google Analytics: live only in the real production build. Staging and the pre-launch dark launch run the whole consent flow
// but in "dry-run" mode (calls are recorded in the page, nothing is sent to Google), so test visits never pollute the property.
// ANALYTICS=live forces live collection in any build (deliberate testing only).
const ANALYTICS_MODE = NOINDEX && process.env.ANALYTICS !== 'live' ? 'dry-run' : 'live';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const out = join(root, 'site');
const config = JSON.parse(readFileSync(join(src, 'config.json'), 'utf8'));
const charityCatalogue = JSON.parse(readFileSync(join(root, 'shared/charities.json'), 'utf8'));
const peopleKit = readFileSync(join(src, 'partials', 'people.html'), 'utf8');
const countries = JSON.parse(readFileSync(join(root, 'shared/countries.json'), 'utf8'));

const NAV = [
  ['/', 'Home'],
  ['/challenge/', '1% Challenge'],
  ['/about/', 'About'],
  ['/transparency/', 'Transparency'],
  ['/donate/', 'Donate'],
  ['/contact/', 'Contact'],
  ['/privacy/', 'Privacy'],
];
const SOCIAL = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['youtube', 'YouTube'], ['tiktok', 'TikTok']];

// Local, dependency-free 24x24 platform glyphs (filled with currentColor). Instagram is drawn with basic shapes; the others are single paths.
const ICONS = {
  facebook: '<path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/>',
  instagram: '<rect x="2.6" y="2.6" width="18.8" height="18.8" rx="5.4" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="4.3" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="17.5" cy="6.5" r="1.4"/>',
  linkedin: '<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>',
  youtube: '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>',
  tiktok: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z"/>',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const opt = (v, label = v, extra = '') => `<option value="${esc(v)}"${extra}>${esc(label)}</option>`;

// A social link is published only when a real https URL is configured.
const socials = SOCIAL.filter(([k]) => typeof config.social[k] === 'string' && config.social[k].startsWith('https://'));

const tokens = {
  domain: config.domain,
  legalName: config.legalName,
  ein: config.ein,
  street: config.street,
  city: config.city,
  email: config.email,
  zeffyUrl: config.zeffyUrl,
  intlHeading: esc(config.donate.internationalHeading),
  intlDescription: esc(config.donate.internationalDescription),
  feeExplanation: esc(config.donate.feeExplanation),
  intlNote: esc(config.donate.internationalNote),
  apiBase: config.apiBase,
  countryOptions: countries.map(([c, n]) => opt(c, n, c === 'US' ? ' selected' : '')).join(''),
  // Placeholder, then the two always-visible special choices, then the categorized catalogue (native optgroups).
  charityOptions: [
    opt('', 'Choose a charity…'),
    opt('__undecided__', "I haven't chosen a charity yet — I'll decide later."),
    opt('__other__', 'Another charity — let me enter its name.'),
    ...charityCatalogue.map((cat) => `<optgroup label="${esc(cat.category)}">${cat.charities.map((c) => opt(c.name)).join('')}</optgroup>`),
  ].join(''),
  platformOptions: config.platforms.map((p) => opt(p)).join(''),
  people: peopleKit,
  // Icon-only links: the accessible name comes from aria-label (platform + new tab); the glyph is decorative.
  socialLinks: socials.map(([k, label]) => `<a class="soc" href="${esc(config.social[k])}" rel="me noopener" target="_blank" aria-label="Influencers Involved on ${label} (opens in a new tab)"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true" focusable="false">${ICONS[k]}</svg></a>`).join(''),
  sameAsJson: JSON.stringify(socials.map(([k]) => config.social[k])),
};

function render(tpl, extra = {}) {
  const all = { ...tokens, ...extra };
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in all)) throw new Error(`Unknown template token ${m}`);
    return all[k];
  });
}

function parsePage(file) {
  const raw = readFileSync(file, 'utf8');
  const i = raw.indexOf('\n---\n');
  const meta = {};
  for (const line of raw.slice(0, i).split('\n')) {
    const j = line.indexOf(':');
    if (j > 0) meta[line.slice(0, j).trim()] = line.slice(j + 1).trim();
  }
  return { meta, body: raw.slice(i + 5) };
}

const STAGING_BANNER = '<div class="stage-banner" role="note"><p>Staging preview: test data only. This is not the live website.</p></div>';
const layout = readFileSync(join(src, 'layout.html'), 'utf8');

mkdirSync(out, { recursive: true });
const sitemap = [];
for (const f of readdirSync(join(src, 'pages')).filter((n) => n.endsWith('.html'))) {
  const { meta, body } = parsePage(join(src, 'pages', f));
  const path = meta.path;
  const nav = NAV.map(([href, label]) => `<li><a href="${href}"${href === path ? ' aria-current="page"' : ''}>${label}</a></li>`).join('');
  const footNav = NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join('');
  const html = render(layout, {
    title: esc(meta.title),
    description: esc(meta.description),
    canonical: config.domain + path,
    path,
    pageClass: meta.class || '',
    headExtra: [meta.preload ? `<link rel="preload" href="${meta.preload}" as="font" type="font/woff2" crossorigin>` : '', meta.css ? `<link rel="stylesheet" href="/assets/${meta.css}">` : ''].filter(Boolean).join('\n'),
    nav,
    footNav,
    schemaTag: path === '/' ? `<script type="application/ld+json">${JSON.stringify(JSON.parse(render(readFileSync(join(src, 'schema.json'), 'utf8'))))}</script>` : '',
    main: render(body),
    robots: NOINDEX ? 'noindex,nofollow' : meta.robots || 'index,follow',
    banner: STAGING ? STAGING_BANNER : '',
  });
  const dir = path === '/' ? out : join(out, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  if (!meta.robots) sitemap.push(path);
}

// 404 page (small, no nav surprises)
{
  const { meta, body } = parsePage(join(src, 'pages-extra', '404.html'));
  const nav = NAV.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('');
  const footNav = NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join('');
  writeFileSync(join(out, '404.html'), render(layout, { title: esc(meta.title), description: esc(meta.description), canonical: config.domain + '/', path: '/404', pageClass: 'page-404', headExtra: '', nav, footNav, schemaTag: '', main: render(body), robots: 'noindex', banner: STAGING ? STAGING_BANNER : '' }));
}

writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((p) => `  <url><loc>${config.domain}${p}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(out, 'robots.txt'), NOINDEX ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${config.domain}/sitemap.xml\n`);

// Static files (css/js/fonts) copied recursively into site/assets.
const staticDir = join(src, 'static');
(function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const n of readdirSync(from)) {
    const f = join(from, n);
    statSync(f).isDirectory() ? copyDir(f, join(to, n)) : copyFileSync(f, join(to, n));
  }
})(staticDir, join(out, 'assets'));
// Runtime config for the browser: only public values.
writeFileSync(join(out, 'assets', 'site-config.js'), `window.II_CONFIG=${JSON.stringify({ apiBase: config.apiBase, email: config.email, platforms: config.platforms, analytics: { id: config.analytics.measurementId, mode: ANALYTICS_MODE } })};\n`);
// Security headers (honored by Cloudflare Workers assets/Pages). GitHub Pages ignores this file.
const api = config.apiBase ? ' ' + new URL(config.apiBase).origin : '';
writeFileSync(join(out, '_headers'), `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
${NOINDEX ? '  X-Robots-Tag: noindex, nofollow\n' : '  Strict-Transport-Security: max-age=2592000\n'}  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self'; img-src 'self' data: blob: https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com; connect-src 'self'${api} https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://*.googletagmanager.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'
/assets/*
  Cache-Control: public, max-age=600, must-revalidate
`);
// Asset file names are not fingerprinted, so they are revalidated every 10 minutes (cheap 304s): a deploy reaches every
// visitor within minutes instead of up to a day later, and new HTML never lives long beside old CSS/JS.
console.log(`Built ${sitemap.length} pages + 404 → site/ (${socials.length} social links published${STAGING ? ', STAGING build' : PRELAUNCH ? ', PRELAUNCH (noindex) build' : ''})`);
