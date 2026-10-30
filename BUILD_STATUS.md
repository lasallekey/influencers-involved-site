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

## Homepage design proposal (awaiting owner review — homepage only)
- Direction "the feed": the pledge is a post and its ripple is the audience. Blue hero with an illustrated pledge post and fanned creator posts; ripple diagrams for the three steps; a story-format sample certificate; a leaf-green band stating that the 1% never passes through II; two full-bleed paths.
- Built with guidance from Anthropic's Frontend Design skill (read from its public SKILL.md, not installed): start from the subject's world, avoid stat-hero/eyebrow/accent-word/card-grid defaults, one orchestrated motion moment (hero entrance; respects reduced motion).
- Scoped to the homepage: `src/pages/home.html` + `src/static/home.css` (loaded only there) + self-hosted Bricolage Grotesque. The other six pages and the backend are unchanged (pixel-compared). The shared footer tagline still uses the earlier serif until the direction is approved.
- Screenshots: `docs/screenshots/homepage-proposal/` (desktop, tablet, mobile; hero + full page).

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
- Owner review of the homepage design proposal, then apply the chosen direction to the other six pages; deploy staging once Cloudflare access exists; run the email deliverability test; final design pass on the live preview.
