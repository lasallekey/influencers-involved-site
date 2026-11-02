// Read-only DNS comparison for the Cloudflare move. It NEVER changes DNS.
//   node scripts/dns-preflight.mjs influencersinvolved.org ns1.cloudflare.example,ns2.cloudflare.example
// Compares what the domain publishes today (through normal public resolvers) with what the NEW Cloudflare nameservers
// would publish once the zone is active, record by record. Run it before changing nameservers at the registrar (and again
// after), so nothing that email or the legacy website depends on goes missing. Exit code 1 = at least one difference.
import { promises as dns } from 'node:dns';

/** Names and types that must be identical on both sides. Mail records are mandatory; the website names too until cutover. */
export const WATCH = [
  ['', 'MX'], ['', 'TXT'], ['', 'A'], ['', 'AAAA'], ['', 'CAA'],
  ['www', 'CNAME'], ['www', 'A'],
  ['google._domainkey', 'TXT'],
  ['_dmarc', 'TXT'],
  ['resend._domainkey', 'TXT'], ['resend._domainkey', 'CNAME'],
  ['send', 'CNAME'], ['send', 'MX'], ['send', 'TXT'],
  ['rsend', 'CNAME'], ['rsend', 'MX'], ['rsend', 'TXT'],
  // Look-for names only: reported when they exist, never created by guessing. Typical Google Workspace / GitHub Pages / provider leftovers.
  ['www', 'AAAA'], ['www', 'TXT'],
  ['mail', 'CNAME'], ['calendar', 'CNAME'], ['drive', 'CNAME'], ['docs', 'CNAME'], ['sites', 'CNAME'], ['groups', 'CNAME'],
  ['autodiscover', 'CNAME'], ['_domainconnect', 'CNAME'],
  ['_github-pages-challenge-lasallekey', 'TXT'],
];

const norm = (v) => String(v).toLowerCase().replace(/\.$/, '').trim();
/** Normalizes a Node resolver answer to a sorted list of comparable strings. */
export function flatten(type, answer) {
  const rows = (answer || []).map((a) => (type === 'MX' ? `${a.priority} ${norm(a.exchange)}` : type === 'TXT' ? (Array.isArray(a) ? a.join('') : String(a)).trim() : type === 'CAA' ? `${a.critical || 0} ${a.issue || a.issuewild || a.iodef || ''}` : norm(a)));
  return rows.sort();
}
/** Pure comparison of two {key → sorted list} snapshots. */
export function compare(current, proposed) {
  const diffs = [];
  for (const key of new Set([...Object.keys(current), ...Object.keys(proposed)])) {
    const a = current[key] || [], b = proposed[key] || [];
    const missing = a.filter((x) => !b.includes(x)), extra = b.filter((x) => !a.includes(x));
    if (missing.length || extra.length) diffs.push({ key, missing, extra });
  }
  return diffs;
}

export async function snapshot(resolver, domain) {
  const out = {};
  for (const [label, type] of WATCH) {
    const name = label ? `${label}.${domain}` : domain;
    try { out[`${label || '@'} ${type}`] = flatten(type, await resolver.resolve(name, type)); } catch { out[`${label || '@'} ${type}`] = []; }
  }
  return out;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const [domain, nsList] = [process.argv[2], process.argv[3]];
  if (!domain || !nsList) { console.error('Usage: node scripts/dns-preflight.mjs <domain> <cloudflare-ns1,cloudflare-ns2>'); process.exit(2); }
  const ips = (await Promise.all(nsList.split(',').map((h) => dns.resolve4(h.trim()).catch(() => [])))).flat();
  if (!ips.length) { console.error('Could not resolve the Cloudflare nameserver names. Check the spelling shown in Cloudflare.'); process.exit(2); }
  // Both sides are asked at their AUTHORITATIVE nameservers (never through a recursive resolver, which would follow CNAMEs and
  // show the target's A/MX/TXT under names like www, send and rsend). This is exactly what Cloudflare would serve vs what serves today.
  const curNs = await new dns.Resolver().resolveNs(domain).catch(() => []);
  const curIps = (await Promise.all(curNs.map((h) => dns.resolve4(h).catch(() => [])))).flat();
  if (!curIps.length) { console.error('Could not find the domain\'s current authoritative nameservers.'); process.exit(2); }
  const now = new dns.Resolver(); now.setServers(curIps); const next = new dns.Resolver(); next.setServers(ips);
  console.log(`Current authoritative nameservers: ${curNs.join(', ')}\nCloudflare nameservers asked: ${nsList}`);
  const diffs = compare(await snapshot(now, domain), await snapshot(next, domain));
  if (!diffs.length) console.log(`OK: the new nameservers publish exactly the same ${WATCH.length} watched record sets as today. Safe to change nameservers.`);
  for (const d of diffs) console.log(`DIFFERENT  ${d.key}\n    missing at Cloudflare: ${d.missing.join(' | ') || '—'}\n    extra at Cloudflare:   ${d.extra.join(' | ') || '—'}`);
  process.exit(diffs.length ? 1 : 0);
}
