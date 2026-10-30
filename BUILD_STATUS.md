# BUILD_STATUS

Branch `claude/happy-brown-0ytqwr`; draft PR #2 is open. `main` is untouched, nothing is deployed, production DNS and the legacy site/registry are unchanged. All tests use synthetic data.

## State: all seven pages in one design language; staging deployed from this branch; awaiting final owner visual review
Only functional, responsive, accessibility or consistency fixes from here. Creative direction (incl. the per-page compositions) is in `docs/CREATIVE_DIRECTION.md`.

## Done
- **Site:** seven pages (`src/` → `site/`, `npm run build`), approved logos, human-centered homepage (unchanged), and six interior pages recomposed in the same language: blue illustrated heroes, page-specific compositions, shared people kit (`movement.css`, `src/partials/people.html`), white background, same buttons/links. Bricolage Grotesque + Source Sans 3, self-hosted. Zeffy + Facebook/Instagram/LinkedIn live; no PayPal; approved international notice; YouTube/TikTok hidden until URLs are set in `src/config.json`.
- **API** (`worker/`, Cloudflare Worker + fresh D1): atomic idempotent registration; hashed single-use 24 h verification tokens; throttled resend; optional-email unsubscribe; verified + opted-in public listing; k-anonymous aggregates; honeypot; HMAC-keyed rate limits; origin checks. Pledge form, canvas certificate, registry display.
- **Staging pipeline:** `STAGING=1` build (visible "Staging preview" strip, noindex); separate staging Worker + free D1 (`--env staging`); GitHub Actions `ci.yml` (tests, committed-build check, staging config dry-run, browser e2e) and manual `staging.yml` (provision D1, migrate, deploy, secrets, smoke test); `scripts/smoke-staging.mjs`; owner guide `docs/STAGING.md`; ops guide `docs/OPERATIONS.md`; admin queries `worker/admin-queries.sql`.

## Tested
- `npm test`: 25 passing (registration, rollback, idempotency, duplicate email, consents, anonymity, validation, rate limits, origin checks, token replay/expiry, email-failure tolerance, resend throttle, unsubscribe, public-data privacy, aggregate suppression, site checks incl. "no staging banner in production build").
- Browser e2e (`scripts/e2e.mjs`) desktop 1366 + mobile 390: pages, mobile menu by keyboard, Zeffy/PayPal notice, validation, register → certificate download → verification email → verify → replay rejected → public listing shows only approved profile; no console errors.
- axe-core (WCAG 2.1 A/AA + best practice), 7 pages + 404 × desktop/mobile: 0 violations (re-run after the interior recomposition).
- Homepage pixel-compared before/after the shared-layer refactor: identical apart from sub-pixel anti-aliasing on hairline ripple rings.
- Real Workers runtime (workerd, local D1) with the staging environment: migrations + smoke test pass; `wrangler deploy --dry-run --env staging` valid.

## Blocked / needs owner (see `docs/STAGING.md`)
- **Staging deploy:** owner adds `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` as GitHub secrets, then runs "Deploy staging". (This cloud session cannot reach Cloudflare or the email provider; the workflow deploys from GitHub's runners.)
- **Email:** free Resend key as `STAGING_EMAIL_API_KEY` for owner-only test delivery now; before launch verify influencersinvolved.org (SPF/DKIM/DMARC DNS — needs owner approval), confirm grants@ receives mail, then name the provider and retention period on the Privacy page.
- Zeffy destination to be opened and checked live; YouTube/TikTok URLs pending; real photography is a future enhancement.
- Production DNS/Pages cutover and merge to `main` need explicit owner approval.

## Next
- Owner runs staging and tests; I fix anything found. Then production configuration (separate DB, real SITE_URL) once approved.
