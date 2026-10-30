# BUILD_STATUS

Branch: `claude/happy-brown-0ytqwr` (rebuild; `main` untouched). Legacy root files (`index.html`, `pioneer.*`, Apps Script) are reference only and unchanged. No legacy data was read, imported or modified; all tests use synthetic data.

## Done
- Seven-page static site (`src/` → `site/`, `npm run build`) in the approved II palette/logos; Zeffy + Facebook/Instagram/LinkedIn live; PayPal absent with the approved notice; YouTube/TikTok hidden until URLs are set in `src/config.json`.
- Worker API + fresh D1 schema (`worker/`): atomic idempotent registration, hashed single-use 24 h verification tokens, throttled resend, optional-email unsubscribe, verified+opted-in public listing, k-anonymous aggregate stats, honeypot, HMAC-keyed rate limits, CORS/origin checks.
- Pledge form (repeatable accounts, separate unchecked consents), canvas certificate (anonymous-safe), registry display.
- Docs: `docs/OPERATIONS.md`, admin recipes `worker/admin-queries.sql`, desktop/mobile screenshots in `docs/screenshots/`.

## Tested
- `npm test` — 25 passing: registration/rollback/idempotency/duplicate email, consents (Maybe ≠ opt-in), anonymous handling, URL/date/country validation, rate limit, origin checks, token replay/expiry/malformed, email-provider failure ≠ failed pledge, resend throttle, unsubscribe, public-listing privacy, aggregate suppression, static site checks.
- `node scripts/e2e.mjs` (Playwright against `npm run dev`) — all pass on desktop 1366 and mobile 390: page loads, no overflow, nav, mobile menu by keyboard, Zeffy/PayPal/notice, form validation, full registration → certificate download → emailed link → verify → replay rejected → public listing shows only approved profile, no console errors.
- `wrangler deploy --dry-run` bundles; real local D1 (workerd) smoke test of register / idempotent retry / duplicate email / stats passed.

## Blocked / needs owner
- **Push to GitHub is refused (403) from this session**, so the branch exists only locally until GitHub write access is re-linked.
- Cloudflare account access (create D1, deploy staging Worker, set secrets) — not available here, so no live staging URL yet.
- Email: provider choice (ask before any paid plan) + SPF/DKIM/DMARC for influencersinvolved.org + real inbox test; Privacy page must then name the provider and retention period.
- Zeffy destination must be opened and checked live; YouTube/TikTok URLs pending.
- Production DNS/Pages cutover and merge to `main` require owner approval.

## Next
- Push branch, open PR, deploy staging once Cloudflare access exists, run the email deliverability test, final design pass on the live preview.
