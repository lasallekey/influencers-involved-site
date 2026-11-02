# BUILD_STATUS

Branch `claude/happy-brown-0ytqwr`; draft PR #2 is open. `main` is untouched, nothing is deployed, production DNS and the legacy site/registry are unchanged. All tests use synthetic data.

**Pre-launch audit:** see `docs/LAUNCH_READINESS_AUDIT.md` (conditional go; findings not yet implemented).

## State: all seven pages in one design language; staging deployed from this branch; awaiting final owner visual review
Only functional, responsive, accessibility or consistency fixes from here. Creative direction (incl. the per-page compositions) is in `docs/CREATIVE_DIRECTION.md`.

## Latest: email sender domain (Resend domain verified; staging sends as verification@influencersinvolved.org)
- Checker corrected: recognizes Resend's current CNAME form (DKIM TXT + `send` CNAME + `rsend` CNAME) as well as the classic MX + SPF form; no more false "missing MX/SPF under send". DNS, site and production untouched.
- Earlier notes:
- Staging email works end to end but Resend's shared test sender only delivers to the account owner (HTTP 403 for other recipients). Next: authenticate influencersinvolved.org in Resend and send as verification@influencersinvolved.org.
- `docs/EMAIL_DOMAIN_SETUP.md`: exact records (resend._domainkey TXT, `send` MX + SPF TXT, optional `_dmarc`), why they cannot affect Google Workspace mail, what never to touch, an approval checkpoint, and the sender switch (GitHub *variable* `STAGING_EMAIL_FROM`). **Awaiting owner approval of the record list; nothing has been added to DNS.**
- New read-only `scripts/check-email-dns.mjs` (run by the staging workflow, informational) reports Google/Resend mail-DNS state; Worker now logs the provider's redacted rejection reason. Tests: 41 passing.

## Previous: two final corrections
- **Charity search box removed** from the registration form (markup, filtering script, styles, status element, and the unused catalogue copy in the browser config). The native categorized dropdown, all 101 charities, "I haven't chosen a charity yet" and "Another charity" remain; backend validation and the catalogue are unchanged.
- **International donation wording corrected:** Zeffy accepts international card donations (our U.S. account processes in USD). The Donate page now has "U.S. & International Donations" with the approved description, fee statement and USD/bank-fee note; the old "not yet established" notice is gone from the site, config, tests and docs. Zeffy remains the single active provider; PayPal stays excluded.
- **Future enhancement only:** Donorbox with Stripe as a second independent channel for more currencies and regional options. Not on the site in any form; the static checks and e2e fail if Donorbox/Stripe/PayPal wording or links appear.

## Previous: registration and registry refinements
- **Homepage phone:** fixed (animation's final `transform:none` was overriding the SVG tilt and a CSS `transform-origin` double-applied it, cropping the phone and detaching the hand). Phone is now complete and held at desktop and mobile; e2e checks it.
- **Leadership removed** from About, structured data and docs; legal name, EIN, address and contact stay.
- **Optional profile URL** (platform + handle required; URL validated only if given; never guessed; handle-only profiles show as text). Migration `0002` rebuilds `social_accounts` and preserves data.
- **Registry hidden until exactly 20 eligible registrations** (`Active` and not a test record); API reveals `{"visible":false}` only; auto-reveals at 20, hides again if withdrawals drop below. Criteria in `docs/REGISTRY.md`. Test/automated records (reserved domains, `smoke+`, `+test`) are flagged and never counted.
- **"Our Pioneer Community" dashboard:** four figures in one row (Pioneers Registered, Social Accounts, Charities Selected, Countries Represented); sideways-scrolling single row on phones.
- **Charity catalogue:** 101 charities in 9 categories (shared/charities.json) with aliases; native grouped select + search; "I haven't chosen a charity yet" and "Another charity" pinned first; normalization de-duplicates counts; undecided is a stored status, excluded from counts, and the certificate says "a charity they will choose".
- No financial-estimate questions or "Total Raised" metric.

## Done
- **Site:** seven pages (`src/` → `site/`, `npm run build`), approved logos, human-centered homepage (unchanged), and six interior pages recomposed in the same language: blue illustrated heroes, page-specific compositions, shared people kit (`movement.css`, `src/partials/people.html`), white background, same buttons/links. Bricolage Grotesque + Source Sans 3, self-hosted. Zeffy + Facebook/Instagram/LinkedIn live; no PayPal; corrected U.S. & international donation wording (Zeffy, USD); YouTube/TikTok hidden until URLs are set in `src/config.json`.
- **API** (`worker/`, Cloudflare Worker + fresh D1): atomic idempotent registration; hashed single-use 24 h verification tokens; throttled resend; optional-email unsubscribe; verified + opted-in public listing; k-anonymous aggregates; honeypot; HMAC-keyed rate limits; origin checks. Pledge form, canvas certificate, registry display.
- **Staging pipeline:** `STAGING=1` build (visible "Staging preview" strip, noindex); separate staging Worker + free D1 (`--env staging`); GitHub Actions `ci.yml` (tests, committed-build check, staging config dry-run, browser e2e) and manual `staging.yml` (provision D1, migrate, deploy, secrets, smoke test); `scripts/smoke-staging.mjs`; owner guide `docs/STAGING.md`; ops guide `docs/OPERATIONS.md`; admin queries `worker/admin-queries.sql`.

## Tested
- `npm test`: Worker/API, catalogue, migration and site checks (see below) (registration, rollback, idempotency, duplicate email, consents, anonymity, validation, rate limits, origin checks, token replay/expiry, email-failure tolerance, resend throttle, unsubscribe, public-data privacy, aggregate suppression, site checks incl. "no staging banner in production build").
- Browser e2e (`scripts/e2e.mjs`) desktop 1366 + mobile 390: pages, mobile menu by keyboard, Zeffy/PayPal notice, validation, register → certificate download → verification email → verify → replay rejected → public listing shows only approved profile; no console errors.
- axe-core (WCAG 2.1 A/AA + best practice), 7 pages + 404 × desktop/mobile: 0 violations (re-run after the interior recomposition).
- Homepage pixel-compared before/after the shared-layer refactor: identical apart from sub-pixel anti-aliasing on hairline ripple rings.
- Real Workers runtime (workerd, local D1) with the staging environment: migrations + smoke test pass; `wrangler deploy --dry-run --env staging` valid.

- Latest additions tested: exactly 19 vs 20 eligible registrations; withdrawal below 20; anonymous and test-address handling; optional URLs; duplicate platform/handle collapse and cross-registration de-duplication; undecided and custom charities with normalization; catalogue integrity; migration preserving existing rows; browser: selector order and search, certificate wording (canvas text captured), phone illustration geometry, dashboard single-row layout (desktop equal columns, mobile scroller); axe-core 0 violations with the dashboard visible.

## Blocked / needs owner (see `docs/STAGING.md`)
- **Staging deploy:** owner adds `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` as GitHub secrets, then runs "Deploy staging". (This cloud session cannot reach Cloudflare or the email provider; the workflow deploys from GitHub's runners.)
- **Email:** free Resend key as `STAGING_EMAIL_API_KEY` for owner-only test delivery now; before launch verify influencersinvolved.org (SPF/DKIM/DMARC DNS — needs owner approval), confirm grants@ receives mail, then name the provider and retention period on the Privacy page.
- Zeffy destination to be opened and checked live; YouTube/TikTok URLs pending; real photography is a future enhancement.
- Production DNS/Pages cutover and merge to `main` need explicit owner approval.

## Next
- Owner runs staging and tests; I fix anything found. Then production configuration (separate DB, real SITE_URL) once approved.
