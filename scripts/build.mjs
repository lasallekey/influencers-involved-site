// Renders src/ page fragments into the static site/ directory. No dependencies.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const out = join(root, 'site');
const config = JSON.parse(readFileSync(join(src, 'config.json'), 'utf8'));
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
  intlNotice: config.internationalNotice,
  apiBase: config.apiBase,
  countryOptions: countries.map(([c, n]) => opt(c, n, c === 'US' ? ' selected' : '')).join(''),
  charityOptions: [...config.charities.map((c) => opt(c)), opt('__other__', 'Other / My charity is not listed')].join(''),
  platformOptions: config.platforms.map((p) => opt(p)).join(''),
  socialLinks: socials.map(([k, label]) => `<a href="${esc(config.social[k])}" rel="me noopener" target="_blank">${label}<span class="sr-only"> (opens in a new tab)</span></a>`).join(''),
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

const layout = readFileSync(join(src, 'layout.html'), 'utf8');
const dateStr = new Date().toISOString().slice(0, 10);

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
    robots: meta.robots || 'index,follow',
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
  writeFileSync(join(out, '404.html'), render(layout, { title: esc(meta.title), description: esc(meta.description), canonical: config.domain + '/', path: '/404', pageClass: 'page-404', headExtra: '', nav, footNav, schemaTag: '', main: render(body), robots: 'noindex' }));
}

writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((p) => `  <url><loc>${config.domain}${p}</loc><lastmod>${dateStr}</lastmod></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${config.domain}/sitemap.xml\n`);

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
writeFileSync(join(out, 'assets', 'site-config.js'), `window.II_CONFIG=${JSON.stringify({ apiBase: config.apiBase, email: config.email, platforms: config.platforms })};\n`);
// Security headers (honored by Cloudflare Workers assets/Pages). GitHub Pages ignores this file.
const api = config.apiBase ? ' ' + new URL(config.apiBase).origin : '';
writeFileSync(join(out, '_headers'), `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'${api}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'
/assets/*
  Cache-Control: public, max-age=86400
`);
console.log(`Built ${sitemap.length} pages + 404 → site/ (${socials.length} social links published)`);
