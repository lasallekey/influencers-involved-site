// Release-day source check for the GivingTuesday editorial batch. Fetches each official source page and checks that the specific
// claims the articles rely on are still on it. Read-only; needs outbound HTTPS. It does NOT gate CI (live sites change and fail
// for reasons unrelated to this repo): a human reads the table, then records the result in docs/editorial/RELEASE_RECORD.md.
//   NODE_USE_ENV_PROXY=1 node scripts/editorial-source-check.mjs            (prints a Markdown table; exit 1 if any check failed)
// It identifies itself honestly and does not try to evade blocking: a page that answers 4xx/5xx is reported as UNVERIFIED for a person to open.
const UA = 'InfluencersInvolved-EditorialQA/1.0 (+https://influencersinvolved.org)';
const S = (id, url, ...expect) => ({ id, url, expect });
export const CHECKS = [
  S('GT About', 'https://www.givingtuesday.org/about/', /2012/, /92nd Street Y/, /independent nonprofit/i),
  S('GT U.S. date', 'https://www.givingtuesday.org/united-states/', /December 1, 2026/),
  S('GT Participate', 'https://www.givingtuesday.org/participate/', /GivingTuesday/),
  S('GT FAQ', 'https://www.givingtuesday.org/about/faq/', /voice, goods, your time, or your money/i),
  S('FTC Giving to a charity', 'https://consumer.ftc.gov/articles/giving-charity', /charit/i),
  S('FTC Donating safely', 'https://consumer.ftc.gov/features/donating-safely-and-avoiding-scams', /donat/i),
  S('IRS TEOS', 'https://www.irs.gov/charities-non-profits/search-for-tax-exempt-organizations', /Tax Exempt Organization Search/i, /filings/i),
  S('SAFE Haven announcement', 'https://www.safehavenforcats.org/news/giving-tuesday/', /December 1, 2026/, /TRIPLE MATCHED, up to \$30,000/i, /ONE DAY ONLY/i, /Every Cat Has a Story/i, /Purrfect Book Club/i),
  S('SAFE Haven event', 'https://www.safehavenforcats.org/event-sh/giving-tuesday-2026/', /Give \$25, and it becomes \$75/, /Give \$50, and it becomes \$150/, /Give \$100, and it becomes \$300/, /safehavenforcats\.org\/donate\//),
  S('SAFE Haven about', 'https://www.safehavenforcats.org/about-us/', /Founded in 1994/, /no-kill/i, /spay\/neuter/i, /Raleigh/),
  S('STAF campaign', 'https://staf.org/giving-tuesday/', /\$100,000 fundraising goal/, /#JustOneMore/, /Rex/, /Bubba/, /staf\.org\/give\/donate-now/),
  S('STAF announcement', 'https://staf.org/blog/giving-tuesday-dec-1/', /tied up and abandoned in a park/i, /lost his home when his owner fell ill/i, /December 1, 2026/),
  S('STAF about', 'https://staf.org/about/', /all-volunteer, no-kill sanctuary/i, /Greater Cincinnati/),
  S('STAF adopt', 'https://staf.org/adopt/', /adopt/i),
  S('Dogs for Better Lives toolkit', 'https://dogsforbetterlives.org/social-media-toolkit-2026/', /December 1, 2026/, /Raise \$50,000/, /matched up to \$25,000/i, /Share DBL/i),
  S('Dogs for Better Lives giving page', 'https://dogsforbetterlives.org/giving-tuesday/', /\$50,000 goal/, /matched up to \$25,000/i),
  S('Dogs for Better Lives about', 'https://dogsforbetterlives.org/about-us/', /Hearing/, /Autism Assistance Dogs/, /Facility Dogs/, /free of charge/i, /Central Point, Oregon/, /Falmouth, Massachusetts/),
  S('Operation Pets Alive event', 'https://operationpetsalive.org/event/giving-tuesday-2026/', /December 1, 2026/, /medical care, food, beds, toys and transport/i, /not in a position to donate/i, /all-volunteer/i, /Montgomery County/),
];

const text = (html) => html.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;|&#8217;/g, "'").replace(/\s+/g, ' ');

async function run() {
  const rows = []; let bad = 0;
  for (const c of CHECKS) {
    let status = 0, miss = [];
    try {
      const r = await fetch(c.url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
      status = r.status; const raw = await r.text(), t = text(raw);
      if (r.ok) miss = c.expect.filter((re) => !re.test(t) && !re.test(raw)).map(String); // visible text first, then raw HTML (for link targets)
    } catch (e) { status = `error: ${e.cause?.code || e.message}`; }
    const verdict = status === 200 ? (miss.length ? `CHANGED (missing ${miss.join(', ')})` : 'SUPPORTED') : 'UNVERIFIED (open in a browser)';
    if (verdict !== 'SUPPORTED') bad++;
    rows.push(`| ${c.id} | ${c.url} | ${status} | ${verdict} |`);
  }
  console.log(`Source check ${new Date().toISOString()}\n\n| Source | URL | HTTP | Result |\n|---|---|---|---|\n${rows.join('\n')}\n\n${bad ? `${bad} of ${CHECKS.length} need a human look.` : 'All sources supported.'}`);
  process.exit(bad ? 1 : 0);
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) run();
