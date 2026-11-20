// Editorial content: reads src/content/editorial/*.md (front matter + Markdown) and renders the /editorial/ index and article pages.
// Dependency-free on purpose: a small Markdown renderer that never passes raw HTML through (everything is escaped), with tests in
// scripts/test/editorial.test.js. The build (scripts/build.mjs) wraps the returned fragments in the shared layout.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- front matter ---------- */

/** Parses a leading `---` block of `key: value` lines. Values may be double-quoted (with \" escapes). Returns { meta, body }. */
export function parseFrontMatter(raw) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!m) throw new Error('missing front matter');
  const meta = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const j = line.indexOf(':');
    if (j < 1) throw new Error(`bad front matter line: ${line}`);
    let v = line.slice(j + 1).trim();
    if (/^".*"$/.test(v)) v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    meta[line.slice(0, j).trim()] = v;
  }
  return { meta, body: raw.slice(m[0].length) };
}

/* ---------- Markdown (small, safe subset) ---------- */

const SAFE_URL = /^(https:\/\/[^\s]+|\/[^\s/][^\s]*|\/|mailto:[^\s]+)$/;

function slugify(t) {
  return String(t).toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
}

/** Inline: links, **strong**, *em*, `code`. All other text is escaped, so raw HTML in the source stays inert text. */
export function renderInline(text) {
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|`([^`]+)`/;
  let out = '', rest = String(text);
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    out += esc(rest.slice(0, m.index));
    if (m[1] !== undefined) {
      if (SAFE_URL.test(m[2])) {
        const external = /^https:/.test(m[2]);
        out += `<a href="${esc(m[2])}"${external ? ' rel="noopener"' : ''}>${renderInline(m[1])}</a>`;
      } else out += renderInline(m[1]); // unsafe or unsupported URL (javascript:, http:, data:): keep the words, drop the link
    } else if (m[3] !== undefined) out += `<strong>${renderInline(m[3])}</strong>`;
    else if (m[4] !== undefined) out += `<em>${renderInline(m[4])}</em>`;
    else out += `<code>${esc(m[5])}</code>`;
    rest = rest.slice(m.index + m[0].length);
  }
  return out + esc(rest);
}

const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** Renders Markdown to { html, title, dek, note, headings }. One H1 is required; the italic-only paragraph right after it is the dek,
 *  and a final italic-only paragraph is the editorial note (both returned separately so the template can place them). */
export function renderMarkdown(md) {
  const blocks = String(md).replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  const used = new Set(), headings = [];
  let title = null, dek = null, note = null, afterH1 = false, lastHeading = 'Table';
  const parts = [];
  const isItalicOnly = (b) => /^\*[^*\s][\s\S]*[^*\s]\*$/.test(b.trim()) && !/^\*\*/.test(b.trim()) && !b.includes('\n\n');
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i].trim();
    if (!b) continue;
    const h = /^(#{1,4})\s+(.+)$/.exec(b);
    if (h && !b.includes('\n')) {
      const level = h[1].length;
      if (level === 1) { if (title !== null) throw new Error('more than one H1'); title = h[2].trim(); afterH1 = true; continue; }
      let id = slugify(h[2]); for (let n = 2; used.has(id); n++) id = `${slugify(h[2])}-${n}`; used.add(id);
      headings.push({ level, id, text: h[2].trim() }); lastHeading = h[2].trim();
      parts.push(`<h${level} id="${id}">${renderInline(h[2].trim())}</h${level}>`);
      afterH1 = false; continue;
    }
    if (afterH1 && isItalicOnly(b) && dek === null) { dek = renderInline(b.slice(1, -1)); afterH1 = false; continue; }
    afterH1 = false;
    if (i === blocks.length - 1 && isItalicOnly(b)) { note = renderInline(b.slice(1, -1)); continue; }
    const lines = b.split('\n');
    if (lines.length >= 2 && /^\|.*\|$/.test(lines[0].trim()) && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(lines[1].trim())) {
      const head = splitRow(lines[0]), rows = lines.slice(2).map(splitRow);
      parts.push(`<p class="table-hint">Swipe or scroll sideways to see all columns.</p><div class="table-wrap" role="region" aria-label="${esc(lastHeading.replace(/<[^>]+>/g, ''))} (scrollable table)" tabindex="0"><table><thead><tr>${head.map((c) => `<th scope="col">${renderInline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, k) => (k === 0 ? `<th scope="row">${renderInline(c)}</th>` : `<td>${renderInline(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^---+$/.test(b)) { parts.push('<hr>'); continue; }
    if (lines.every((l) => /^[-*]\s+/.test(l))) { parts.push(`<ul>${lines.map((l) => `<li>${renderInline(l.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`); continue; }
    if (lines.every((l) => /^\d+[.)]\s+/.test(l))) { parts.push(`<ol>${lines.map((l) => `<li>${renderInline(l.replace(/^\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`); continue; }
    if (lines.every((l) => /^>\s?/.test(l))) { parts.push(`<blockquote><p>${renderInline(lines.map((l) => l.replace(/^>\s?/, '')).join(' '))}</p></blockquote>`); continue; }
    parts.push(`<p>${renderInline(lines.join(' '))}</p>`);
  }
  if (title === null) throw new Error('no H1');
  return { html: parts.join('\n'), title, dek, note, headings };
}

/* ---------- content loading ---------- */

const REQUIRED = ['id', 'slug', 'proposed_url', 'seo_title', 'meta_description', 'og_title', 'og_description', 'author'];

/** Loads and validates every article. Throws on duplicate ids/slugs, a URL that does not match the slug, or a missing field. */
export function loadArticles(dir, domain) {
  const items = readdirSync(dir).filter((n) => /^\d\d-.*\.md$/.test(n)).sort().map((file) => {
    const { meta, body } = parseFrontMatter(readFileSync(join(dir, file), 'utf8'));
    for (const k of REQUIRED) if (!meta[k]) throw new Error(`${file}: front matter is missing ${k}`);
    if (meta.proposed_url !== `${domain}/editorial/${meta.slug}/`) throw new Error(`${file}: proposed_url does not match ${domain}/editorial/${meta.slug}/`);
    return { file, meta, path: `/editorial/${meta.slug}/`, ...renderMarkdown(body) };
  });
  for (const key of ['id', 'slug']) if (new Set(items.map((a) => a.meta[key])).size !== items.length) throw new Error(`duplicate ${key}`);
  return items;
}

/* ---------- publication date ---------- */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** `2026-12-01T09:00:00-06:00` (ISO 8601 with an explicit offset) → { iso, display: "December 1, 2026" }. The displayed date is the date
 *  as written in that ISO string, so the visible date and the structured date always agree. null/empty → null (undated). Anything else throws. */
export function parsePublishedAt(v) {
  if (v === null || v === undefined || v === '') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(String(v));
  if (!m) throw new Error(`publishedAt must be ISO 8601 with a time zone offset, e.g. 2026-12-01T09:00:00-06:00 (got ${v})`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || Number.isNaN(Date.parse(v))) throw new Error(`publishedAt is not a real date: ${v}`);
  return { iso: String(v), display: `${MONTHS[mo - 1]} ${d}, ${y}`, ymd: `${m[1]}-${m[2]}-${m[3]}` };
}

/* ---------- pages ---------- */

const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

export function articleSchema(a, domain, published) {
  const o = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.meta.meta_description,
    mainEntityOfPage: `${domain}${a.path}`,
    author: { '@type': 'Organization', name: 'Influencers Involved, Inc. NFP', url: `${domain}/` },
    publisher: { '@type': 'Organization', name: 'Influencers Involved, Inc. NFP', url: `${domain}/` },
  };
  if (published) o.datePublished = published.iso; // only when a real publication date has been recorded; never guessed
  return ld(o);
}

/** Returns page descriptors { path, title, description, ogTitle, ogDescription, ogType, main, schemaTag, lastmod, pageClass, css } for the index and every article. */
export function buildEditorialPages({ dir, domain, publishedAt, staging = false }) {
  const published = parsePublishedAt(publishedAt);
  const articles = loadArticles(dir, domain);
  const byId = new Map(articles.map((a) => [a.meta.id, a]));
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  const seen = new Set();
  const card = (item, lead) => {
    const a = byId.get(item.id);
    if (!a) throw new Error(`index.json refers to unknown article ${item.id}`);
    if (seen.has(item.id)) throw new Error(`index.json lists ${item.id} twice`);
    seen.add(item.id);
    return `<li class="ed-card${lead ? ' ed-card-lead' : ''}"><h3><a href="${a.path}">${renderInline(a.title)}</a></h3><p>${renderInline(item.blurb)}</p></li>`;
  };
  const groups = index.groups.map((g, gi) => `<section class="ed-group ed-group-${g.kind}" aria-labelledby="ed-g${gi}"><h2 id="ed-g${gi}">${esc(g.heading)}</h2><ul class="ed-cards">${g.items.map((it) => card(it, g.kind === 'lead')).join('')}</ul></section>`).join('\n');
  if (seen.size !== articles.length) throw new Error(`index.json lists ${seen.size} of ${articles.length} articles`);
  const main = `<div class="ed-index">
<header class="ed-index-head wrap">
<p class="ed-kicker">${esc(index.kicker)}</p>
<h1>${esc(index.h1)}</h1>
<p class="ed-intro">${renderInline(index.intro)}</p>
<p class="ed-transparency">${renderInline(index.transparency)}</p>
</header>
<div class="wrap">
${groups}
<p class="ed-closing">${renderInline(index.closing)}</p>
</div>
</div>`;
  const pages = [{ path: '/editorial/', title: index.title, description: index.description, ogTitle: index.ogTitle, ogDescription: index.ogDescription, ogType: 'website', main, schemaTag: '', lastmod: published ? published.ymd : null, pageClass: 'page-editorial', css: 'editorial.css' }];
  for (const a of articles) {
    const dateLine = published ? `<span class="ed-date">Published <time datetime="${esc(published.iso)}">${esc(published.display)}</time></span>` : '';
    const art = `<div class="wrap">
<nav class="ed-crumbs" aria-label="Breadcrumb"><ol><li><a href="/editorial/">Editorial</a></li><li><span aria-current="page">${esc(a.meta.seo_title)}</span></li></ol></nav>
<article class="ed-article">
<header class="ed-article-head">
<h1>${renderInline(a.title)}</h1>
${a.dek ? `<p class="ed-dek">${a.dek}</p>` : ''}
<p class="ed-byline"><span>By ${esc(a.meta.author)}</span>${dateLine}</p>
</header>
<div class="ed-body">
${a.html}
</div>
${a.note ? `<aside class="ed-note" aria-label="Editorial note"><p>${a.note}</p></aside>` : ''}
</article>
<p class="ed-back"><a href="/editorial/">All GivingTuesday 2026 editorial</a></p>
</div>`;
    pages.push({ path: a.path, title: a.meta.seo_title, description: a.meta.meta_description, ogTitle: a.meta.og_title, ogDescription: a.meta.og_description, ogType: 'article', main: art, schemaTag: articleSchema(a, domain, published), lastmod: published ? published.ymd : null, pageClass: 'page-editorial page-article', css: 'editorial.css' });
  }
  return { pages, articles, published };
}
