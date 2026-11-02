// Read-only inventory of what influencersinvolved.org publishes today, plus DNSSEC and registrar-lock facts.
// It never changes anything and needs no credentials; run it where DNS and the internet are reachable (a GitHub runner).
//   node scripts/dns-inventory.mjs influencersinvolved.org
// Sources: the zone's current authoritative nameservers (asked directly), two public resolvers, Cloudflare's DNS-over-HTTPS
// (for DS/DNSKEY) and the public RDAP registry record. DNS cannot be listed, only asked name by name: the names below are the
// ones that matter for this project. The authoritative inventory of EVERY record is the Squarespace DNS panel (and Cloudflare's own
// scan); anything the panel shows that is not listed here must be copied from the panel exactly, never guessed.
import { promises as dns } from 'node:dns';
import { appendFileSync } from 'node:fs';
import { WATCH, flatten, compare, snapshot } from './dns-preflight.mjs';

/** Reads a DoH JSON answer: { present, ad, data[] }. */
export function parseDoh(j) {
  const ans = (j && j.Answer) || [];
  return { present: ans.length > 0, ad: !!(j && j.AD), data: ans.map((a) => String(a.data)) };
}

/** Plain-English facts from an RDAP domain record. */
export function summarizeRdap(r) {
  const status = (r.status || []).map(String);
  const reg = ((r.entities || []).find((e) => (e.roles || []).includes('registrar')) || {}).vcardArray;
  const registrar = reg && reg[1] ? (reg[1].find((x) => x[0] === 'fn') || [])[3] : undefined;
  const ev = (name) => ((r.events || []).find((e) => e.eventAction === name) || {}).eventDate;
  return {
    registrar: registrar || 'unknown',
    nameservers: (r.nameservers || []).map((n) => String(n.ldhName).toLowerCase()).sort(),
    dnssecSigned: !!(r.secureDNS && r.secureDNS.delegationSigned),
    transferLocked: status.some((s) => /client\s*transfer\s*prohibited/i.test(s)),
    status,
    expires: ev('expiration'), registered: ev('registration'),
  };
}

const doh = async (name, type) => {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' } });
  return parseDoh(await r.json());
};

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const domain = process.argv[2];
  if (!domain) { console.error('Usage: node scripts/dns-inventory.mjs <domain>'); process.exit(2); }
  const out = [];
  const say = (l = '') => { out.push(l); console.log(l); };
  const pub = new dns.Resolver(); pub.setServers(['1.1.1.1', '8.8.8.8']);
  const nsNames = (await pub.resolveNs(domain).catch(() => [])).map((n) => n.toLowerCase());
  const nsIps = (await Promise.all(nsNames.map((h) => dns.resolve4(h).catch(() => [])))).flat();
  say(`## Current DNS inventory for ${domain}\n`);
  say(`Authoritative nameservers today: ${nsNames.join(', ') || '(none found)'}\n`);
  const auth = new dns.Resolver(); auth.setServers(nsIps.length ? nsIps : ['1.1.1.1']);
  const [fromAuth, fromPub] = [await snapshot(auth, domain), await snapshot(pub, domain)];
  say('| Name and type | Value(s) at the current authoritative nameservers |\n|---|---|');
  for (const [k, v] of Object.entries(fromAuth)) if (v.length) say(`| ${k} | ${v.map((x) => '`' + x.replace(/\|/g, '\\|') + '`').join('<br>')} |`);
  const none = Object.entries(fromAuth).filter(([, v]) => !v.length).map(([k]) => k);
  say(`\nWatched names with no record: ${none.join(', ') || 'none'}`);
  for (const t of ['NS', 'SOA']) { try { const a = await auth.resolve(domain, t); say(`\n${t} at the zone: ${JSON.stringify(a)}`); } catch { /* ignore */ } }
  // A recursive resolver follows CNAMEs, so it shows the target's A/AAAA/MX/TXT under names that are CNAMEs (www, send, rsend).
  // That is not a real difference; skip those keys.
  const cnameNames = new Set(Object.entries(fromAuth).filter(([k, v]) => k.endsWith(' CNAME') && v.length).map(([k]) => k.split(' ')[0]));
  const diffs = compare(fromAuth, fromPub).filter((d) => !cnameNames.has(d.key.split(' ')[0]) || d.key.endsWith(' CNAME'));
  say(diffs.length ? `\n**Authoritative vs public resolvers differ** (recent change or caching):\n${diffs.map((d) => `- ${d.key}: authoritative-only ${d.missing.join(' | ') || '—'}; resolver-only ${d.extra.join(' | ') || '—'}`).join('\n')}` : '\nPublic resolvers agree with the authoritative nameservers on every watched record.');

  say('\n### DNSSEC and registrar');
  try {
    const ds = await doh(domain, 'DS'), key = await doh(domain, 'DNSKEY');
    say(`- DS record at the registry: ${ds.present ? 'PRESENT (' + ds.data.length + ')' : 'none'}; DNSKEY published by the zone: ${key.present ? 'yes' : 'no'}. ` + (ds.present || key.present ? '**DNSSEC is ON: it must be turned off at the registrar (and the DS record removed) BEFORE nameservers change, or the domain will stop resolving for validating resolvers.**' : 'DNSSEC is not enabled; nothing to disable.'));
  } catch (e) { say(`- DNSSEC check failed: ${e.message}`); }
  try {
    const tld = domain.split('.').pop();
    const boot = await (await fetch('https://data.iana.org/rdap/dns.json')).json();
    const base = ((boot.services.find((x) => x[0].includes(tld)) || [])[1] || [])[0];
    if (!base) throw new Error(`no RDAP service listed for .${tld}`);
    const r = await fetch(`${base.replace(/\/$/, '')}/domain/${domain}`, { headers: { accept: 'application/rdap+json' } });
    const s = summarizeRdap(await r.json());
    say(`- Registrar: ${s.registrar}; registered ${s.registered || '?'}; expires ${s.expires || '?'}`);
    say(`- Registry status: ${s.status.join(', ') || '?'}`);
    say(`- Transfer lock: ${s.transferLocked ? 'ON (normal and fine; it does not block changing nameservers)' : 'not shown'}`);
    say(`- RDAP says DNSSEC signed: ${s.dnssecSigned ? 'YES' : 'no'}; registry nameservers: ${s.nameservers.join(', ') || '?'}`);
  } catch (e) { say(`- RDAP lookup failed: ${e.message}`); }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n');
}
