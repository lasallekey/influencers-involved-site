# GivingTuesday 2026 editorial: release record

**Status: PREPARED on a feature branch. NOT PUBLISHED. NOT AUTHORIZED.** A clean PR and a staging preview are not authorization to publish.

Founder authorization: NOT GRANTED
Release-day fact check: PENDING

`npm run check:editorial-release` fails until both lines above are changed (to `GRANTED (<who, date>)` / `COMPLETED (<who, date>)`) in the founder-authorized release commit, together with the recorded publication date (see "Release steps").

## Pages (all eight built and staged; none published)

| ID | Page | Exact URL | Status |
|---|---|---|---|
| Index | Editorial | https://influencersinvolved.org/editorial/ | READY (pending authorization) |
| GT26-01 | GivingTuesday 2026: What It Is and How You Can Take Part | https://influencersinvolved.org/editorial/givingtuesday-2026-guide/ | READY (pending authorization) |
| GT26-02 | GivingTuesday for Content Creators | https://influencersinvolved.org/editorial/givingtuesday-for-content-creators/ | READY (pending authorization) |
| GT26-03 | How to Choose a GivingTuesday Charity | https://influencersinvolved.org/editorial/how-to-choose-a-givingtuesday-charity/ | READY (pending authorization) |
| GT26-04 | Four Animal-Related Charity Campaigns | https://influencersinvolved.org/editorial/givingtuesday-2026-animal-charity-campaigns/ | READY (pending authorization) |
| GT26-05 | SAFE Haven for Cats | https://influencersinvolved.org/editorial/safe-haven-for-cats-givingtuesday-2026/ | READY (pending authorization) |
| GT26-06 | Save The Animals Foundation (#JustOneMore) | https://influencersinvolved.org/editorial/staf-just-one-more-givingtuesday-2026/ | READY (pending authorization) |
| GT26-07 | Dogs for Better Lives | https://influencersinvolved.org/editorial/dogs-for-better-lives-givingtuesday-2026/ | READY (pending authorization) |

Sitemap: 15 canonical URLs (the seven core pages, `/editorial/`, and the seven articles). Staging preview: the "Deploy staging" run for this branch (URL in that run's summary); it is noindex by design.

## Issues

| # | Severity | Issue | Status |
|---|---|---|---|
| 1 | Release gate | **Publication date is not recorded.** `src/content/editorial/publication.json` has `publishedAt: null`, so the pages currently show no date and the Article schema has no `datePublished`. It must be set to the real release time (ISO 8601 with time zone) in the founder-authorized release commit. Never the November 19 prep date. | OPEN, by design |
| 2 | Release gate | **Release-day fact check not done.** Sources were checked on 2026-11-20 (below); the brief requires a re-check on the actual release date (`scripts/editorial-source-check.mjs`). | OPEN, by design |
| 3 | Editorial, low | Article 02's "many forms of generosity" statement linked GivingTuesday's `/participate/` page, a campaign-planning hub. **Resolved at the founder's request:** the link now points to the official FAQ page (`/about/faq/`), which states "voice, goods, your time, or your money". Link target only; no other change to the article. | RESOLVED |
| 4 | Editorial, info | After December 1 the prospective wording ("on December 1", "plans to") needs a retrospective pass (brief rule 9). | FOLLOW-UP |
| 5 | Info | Staging and pre-launch builds keep `rel=canonical` pointing at the production URL, as every other page on this site already does; they are `noindex` and carry the staging banner, so this does not create duplicate-content risk. | NO ACTION |
| 6 | Info | External schema validators (Schema.org Validator, Google Rich Results Test) need a public URL and were not run; structural validation is automated (below). Run them once after an authorized release. | POST-RELEASE |

No page is BLOCKED. Heartland Animal Shelter and Operation Pets Alive are not features (Operation Pets Alive appears in the roundup only), as specified.

## Corrections to the supplied copy

Two. (1) As logged in the package: GT26-03, penultimate section, "verified 2026 animal-related" to "documented 2026 animal-related". The supplied `articles/` files already contain it (checked against `original_source_archive/`: the archive has "verified"); no other body edit was made. (2) Founder-requested: in GT26-02 the participation-resources link target changed from `https://www.givingtuesday.org/participate/` to `https://www.givingtuesday.org/about/faq/` (the anchor text and the rest of the article are unchanged). Front matter is used as import metadata and is never rendered.

## Fact verification (2026-11-20, UTC; repeat on release day)

Method: every source page was fetched (honest `InfluencersInvolved-EditorialQA/1.0` user agent) and checked for the specific wording the articles rely on, first by reading the pages and then by the repeatable script `scripts/editorial-source-check.mjs`. Result of the script run at 2026-11-20T00:3x Z:

| Source | URL | HTTP | Result |
|---|---|---|---|
| GT About | https://www.givingtuesday.org/about/ | 200 | SUPPORTED |
| GT U.S. date | https://www.givingtuesday.org/united-states/ | 200 | SUPPORTED |
| GT Participate | https://www.givingtuesday.org/participate/ | 200 | SUPPORTED |
| GT FAQ | https://www.givingtuesday.org/about/faq/ | 200 | SUPPORTED |
| FTC Giving to a charity | https://consumer.ftc.gov/articles/giving-charity | 200 | SUPPORTED |
| FTC Donating safely | https://consumer.ftc.gov/features/donating-safely-and-avoiding-scams | 200 | SUPPORTED |
| IRS TEOS | https://www.irs.gov/charities-non-profits/search-for-tax-exempt-organizations | 200 | SUPPORTED |
| SAFE Haven announcement | https://www.safehavenforcats.org/news/giving-tuesday/ | 200 | SUPPORTED |
| SAFE Haven event | https://www.safehavenforcats.org/event-sh/giving-tuesday-2026/ | 200 | SUPPORTED |
| SAFE Haven about | https://www.safehavenforcats.org/about-us/ | 200 | SUPPORTED |
| STAF campaign | https://staf.org/giving-tuesday/ | 200 | SUPPORTED |
| STAF announcement | https://staf.org/blog/giving-tuesday-dec-1/ | 200 | SUPPORTED |
| STAF about | https://staf.org/about/ | 200 | SUPPORTED |
| STAF adopt | https://staf.org/adopt/ | 200 | SUPPORTED |
| Dogs for Better Lives toolkit | https://dogsforbetterlives.org/social-media-toolkit-2026/ | 200 | SUPPORTED |
| Dogs for Better Lives giving page | https://dogsforbetterlives.org/giving-tuesday/ | 200 | SUPPORTED |
| Dogs for Better Lives about | https://dogsforbetterlives.org/about-us/ | 200 | SUPPORTED |
| Operation Pets Alive event | https://operationpetsalive.org/event/giving-tuesday-2026/ | 200 | SUPPORTED |

Claim-level confirmation read directly from the pages:

| Claim used in the articles | Official wording found | Result |
|---|---|---|
| GivingTuesday is Dec 1, 2026 | "December 1, 2026" (U.S. page) | Supported |
| Origin 2012 at the 92nd Street Y; independent nonprofit | "created in 2012 ... born and incubated at the 92nd Street Y ... now an independent nonprofit" | Supported |
| Many forms of giving | FAQ: "voice, goods, your time, or your money" | Supported |
| SAFE Haven triple match | "every gift ... will be TRIPLE MATCHED, up to $30,000, for ONE DAY ONLY"; examples $25 to $75, $50 to $150, $100 to $300 | Supported. Match mechanics not interpreted beyond the charity's words. Donation route: safehavenforcats.org/donate/general-donations/ |
| SAFE Haven background | "Founded in 1994 ... Raleigh's no-kill shelter and low-cost spay/neuter clinic" | Supported |
| SAFE Haven campaign theme | "Every Cat Has a Story"; "The Purrfect Book Club: Six Tales of Love, Hope & Nine Lives" | Supported |
| STAF goal | "$100,000 fundraising goal" (goal, no raised-to-date figure on the page) | Supported |
| Rex / Bubba | "found tied up and abandoned in a park"; Bubba "lost his home when his owner fell ill" | Supported (attributed to STAF) |
| STAF background | "Cincinnati's all-volunteer, no-kill sanctuary for cats and dogs"; Greater Cincinnati | Supported |
| Dogs for Better Lives goal and match | Toolkit: "GOAL: Raise $50,000 to fund the journey of a future Service Dog", "All donations matched up to $25,000"; giving page: "every dollar will be matched up to $25,000"; progress shows 0 raised until 12/1 | Supported (goal and cap, not results) |
| Dogs for Better Lives programs | Hearing, Autism Assistance, Facility Dogs; placed "free of charge"; campuses Central Point, Oregon and Falmouth, Massachusetts | Supported |
| Operation Pets Alive | Dec 1, 2026; "medical care, food, beds, toys and transport"; "If you're not in a position to donate, you can also help by sharing"; all-volunteer 501(c)(3), Montgomery County | Supported |
| IRS lookup | "search for an organization's tax exempt status and filings" | Supported |
| FTC pages | Both articles reachable and on topic (HTTP 200). Note: a first manual request that identified itself as a browser-compatible client received "Page Not Found"; requests that identify the tool honestly succeed. | Supported |

Not asserted anywhere: partnership, endorsement, funds raised, match funding received, interviews or eyewitness reporting. Donation links point straight to each charity's own pages; no link in the editorial section goes through Zeffy or carries tracking parameters (enforced by `scripts/check-site.mjs` and `scripts/test/editorial.test.js`).

## Tests and automated evidence

- `npm test`: unit tests include `scripts/test/editorial.test.js` (front-matter parsing, Markdown safety/tables, publication date handling, link-graph source coverage, JSON-LD serialization, release gate).
- `npm run build`, `npm run check` (15-URL sitemap; per page: one canonical, one H1, unique title/description, og tags, breadcrumb, byline, disclosure, Article JSON-LD matches the visible page, no forbidden schema types, no images, only official hosts, link graph from the brief, one index entry per article, footer Editorial link on every core page, accessible table markup), `git diff --exit-code -- site`.
- Browser suite (`scripts/e2e.mjs`): the original core and registration tests unchanged, plus editorial checks for all eight routes at 1366 px and 360 px (200, no horizontal overflow, one H1, one canonical, no skipped heading levels, consent banner and footer link present, index links open the articles, breadcrumb returns, table scrolls with a visible cue at 360 px, no analytics before consent).
- Accessibility: axe-core 4.10 (WCAG 2.0/2.1 A and AA) on all eight pages at 1366 px and 360 px: **0 violations** (one real contrast bug on the mobile index card was found this way and fixed). Manual keyboard order and focus-visible styling were exercised in the browser suite and the screenshots.

## Production versus staging robots (built and inspected 2026-11-20)

```
## production build (npm run build)
robots.txt: User-agent: * Allow: / Disallow: /api/  Sitemap: https://influencersinvolved.org/sitemap.xml 
meta robots (editorial index): <meta name="robots" content="index,follow"
meta robots (article): <meta name="robots" content="index,follow"
X-Robots-Tag header: 0
staging banner on article: 0
sitemap urls: 15  sitemap line in robots: 1
analytics mode: "mode":"live"
canonical: <link rel="canonical" href="https://influencersinvolved.org/editorial/givingtuesday-2026-guide/"
## STAGING=1
robots.txt: User-agent: * Disallow: / 
meta robots (editorial index): <meta name="robots" content="noindex,nofollow"
meta robots (article): <meta name="robots" content="noindex,nofollow"
X-Robots-Tag header: 1
staging banner on article: 1
sitemap urls: 15  sitemap line in robots: 0
analytics mode: "mode":"dry-run"
canonical: <link rel="canonical" href="https://influencersinvolved.org/editorial/givingtuesday-2026-guide/"
## PRELAUNCH=1
robots.txt: User-agent: * Disallow: / 
meta robots (editorial index): <meta name="robots" content="noindex,nofollow"
meta robots (article): <meta name="robots" content="noindex,nofollow"
X-Robots-Tag header: 1
staging banner on article: 0
sitemap urls: 15  sitemap line in robots: 0
analytics mode: "mode":"dry-run"
canonical: <link rel="canonical" href="https://influencersinvolved.org/editorial/givingtuesday-2026-guide/"
```

## Structured data

One `Article` object per article (headline = visible H1, description = meta description, `mainEntityOfPage` = canonical, `author` and `publisher` = the Organization "Influencers Involved, Inc. NFP", `datePublished` only once a real date is recorded). No `image`, `dateModified`, FAQ, Review, Rating, Event or Person markup. The index carries no Article schema. JSON-LD is serialized with `<` escaped. All of this is asserted in `scripts/check-site.mjs` against the built HTML.

## Licensing and asset record

| Item | Source | Rights |
|---|---|---|
| Article text | Supplied editorial package (Influencers Involved) | Owned by II |
| Page art / hero images | **None.** Text-led pages by design (`hero_image_brief` fields are briefs only and are not rendered) | n/a |
| Social preview image | Existing site-owned generic `/assets/og-image.png` (already used by every page) | Owned by II |
| Third-party charity artwork, logos, photographs, book covers | **None used or copied** (`check-site.mjs` fails the build if an editorial page contains an `<img>`) | n/a |
| Fonts, icons, CSS | Existing self-hosted fonts and site CSS; new `editorial.css` is original | Existing licenses / owned |
| Markdown renderer | Written in this repository (`scripts/editorial.mjs`), no new dependency | Owned |

## Release steps (after, and only after, explicit founder authorization)

1. On the release day run `NODE_USE_ENV_PROXY=1 node scripts/editorial-source-check.mjs`; read any row that is not SUPPORTED. If a central claim fails, mark that page BLOCKED here, remove it from `index.json`, delete it from `src/content/editorial/`, rebuild (the sitemap and index update from the same registry) and get the founder's decision on the reduced scope.
2. Release commit on this branch: set `publishedAt` in `src/content/editorial/publication.json` to the real release time, e.g. `2026-12-01T09:00:00-06:00` (ISO 8601 with offset); update the two marker lines at the top of this file; run `npm run build`; commit `site/`.
3. Run `npm run check:editorial-release` (must print OK), `npm test`, `npm run check`, and confirm CI. The production workflow now runs the same gate as an enforced step, right after the site is built and before the database, migrations, deploy or secrets steps, so a missing date, authorization or release-day verification stops the run before anything changes. (Until the editorial release is recorded, that also blocks any other production deployment from this workflow.)
4. Merge, then run `.github/workflows/production.yml` on `main` (create database: off, cutover complete: on, smoke test: on) with the approval gate, exactly as for earlier releases.
5. Verify live: the eight routes return 200, canonical, date, H1 and source links; `https://influencersinvolved.org/sitemap.xml` lists 15 URLs; `robots.txt` allows crawling; analytics consent works on an editorial page.
6. Site owner: submit the sitemap in Search Console and inspect priority URLs. Indexing is not guaranteed by any date.

## Rollback

Editorial pages are static files plus one footer link. To roll back: revert the release (merge) commit and redeploy through the same production workflow, or use `wrangler rollback --env production`. The sitemap returns to the seven core pages. No D1 data, registration code, payment or email configuration is involved, so no data action is needed. The founder approves any production rollback.

## Founder decision

Do you authorize merging and publishing this GivingTuesday editorial batch?
