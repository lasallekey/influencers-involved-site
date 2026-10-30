# BUILD_STATUS

Branch: `claude/happy-brown-0ytqwr` (rebuild; `main` untouched), pushed; draft PR #2 is open. `main` is unchanged and nothing is deployed. Legacy root files (`index.html`, `pioneer.*`, Apps Script) are reference only and unchanged. No legacy data was read, imported or modified; all tests use synthetic data.

## Done
- Seven-page static site (`src/` → `site/`, `npm run build`) in the approved II palette/logos; Zeffy + Facebook/Instagram/LinkedIn live; PayPal absent with the approved notice; YouTube/TikTok hidden until URLs are set in `src/config.json`.
- Worker API + fresh D1 schema (`worker/`): atomic idempotent registration, hashed single-use 24 h verification tokens, throttled resend, optional-email unsubscribe, verified+opted-in public listing, k-anonymous aggregate stats, honeypot, HMAC-keyed rate limits, CORS/origin checks.
- Pledge form (repeatable accounts, separate unchecked consents), canvas certificate (anonymous-safe), registry display.
- Docs: `docs/OPERATIONS.md`, admin recipes `worker/admin-queries.sql`, desktop/mobile screenshots in `docs/screenshots/`.

## Design pass 2 (visual redesign)
- UI UX Pro Max installed project-level (`.claude/skills/ui-ux-pro-max/`, CLI 2.15.0, offline template install; package reviewed first: no install hooks, no network on this path, nothing global). Used as a checklist only; its auto-recommended "Liquid Glass / black-gold" style was rejected as off-brand.
- New system: Newsreader (display) + Source Sans 3 (text), both self-hosted (OFL, ~150 KB, no third-party requests); deep-navy/paper palette from the logos; pillar-capital and ripple motifs drawn in CSS; editorial two-column sections; solid sticky header with "Become a Pioneer" CTA (not an extra nav destination); navy footer.
- Homepage recomposed: poster hero, manifesto band, three-step journey, sample certificate (labelled "Sample layout"), "two pillars" paths, closing call. Same approved copy, seven-page structure and functionality.

## Human-centered refinement (homepage only — awaiting owner review)
- Audit vs the owner's addendum found five issues (no people; headline as a rule not an invitation; only two audiences served; too much explanation; trust/donation distinction scattered). All five addressed on the homepage.
- Homepage now: illustrated hero ("Turn your influence into impact."), three illustrated steps, "Find your place" (creators → registration; companies and charities → Contact; donors → Donate), a compact trust strip, and one closing invitation. Original diverse-people illustrations; no photos, quotes, partners or statistics.
- The four reference sites were unreachable from the cloud session (network allowlist), so the research summary rests on the addendum. Stated in `docs/CREATIVE_DIRECTION.md`, which is the concise version-controlled direction for future sessions (voice, honesty rules, visual identity, asset licenses).
- Other six pages and the backend are unchanged. Next after approval: harmonize those six pages and the shared footer tagline.
- Screenshots: `docs/screenshots/homepage-refinement/`.

## Tested
- `npm test` — 25 passing: registration/rollback/idempotency/duplicate email, consents (Maybe ≠ opt-in), anonymous handling, URL/date/country validation, rate limit, origin checks, token replay/expiry/malformed, email-provider failure ≠ failed pledge, resend throttle, unsubscribe, public-listing privacy, aggregate suppression, static site checks.
- `node scripts/e2e.mjs` (Playwright against `npm run dev`) — all pass on desktop 1366 and mobile 390: page loads, no overflow, nav, mobile menu by keyboard, Zeffy/PayPal/notice, form validation, full registration → certificate download → emailed link → verify → replay rejected → public listing shows only approved profile, no console errors.
- `wrangler deploy --dry-run` bundles; real local D1 (workerd) smoke test of register / idempotent retry / duplicate email / stats passed.

## Blocked / needs owner
- Cloudflare account access (create D1, deploy staging Worker, set secrets) — not available here, so no live staging URL yet.
- Email: provider choice (ask before any paid plan) + SPF/DKIM/DMARC for influencersinvolved.org + real inbox test; Privacy page must then name the provider and retention period.
- Zeffy destination must be opened and checked live; YouTube/TikTok URLs pending.
- Production DNS/Pages cutover and merge to `main` require owner approval.

## Next
- Owner review of the refined homepage, then harmonize the other six pages and the shared footer tagline; deploy staging once Cloudflare access exists; run the email deliverability test; final design pass on the live preview.
