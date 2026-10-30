# Influencers Involved — fresh rebuild (not deployed)

This branch implements the seven-page static website and contains a **new** Worker/D1 registration backend. It is **not** the active production site. Keep `main` and the legacy Apps Script/registry unchanged until explicitly approved.

## Public routes

`/`, `/challenge/`, `/about/`, `/transparency/`, `/donate/`, `/contact/`, `/privacy/`.

All public site pages use `assets/site.css`, `assets/site.js`, and the approved PNG assets. The 1% creator pledge goes directly to the creator's chosen charity. Zeffy donations on `/donate/` support Influencers Involved itself. PayPal is intentionally not advertised.

## Run static frontend locally or in cloud development environment

Use a static server at the repository root, e.g. `python3 -m http.server 8000`. Routes require a server serving directory indexes; double-clicking `index.html` from disk does not simulate published routing. No install step is needed for the static site.

For now, `assets/config.js` sets `apiBase: ''`; registration is visibly disabled. **Do not turn it on until a fresh Worker/D1 backend and email security have been tested.** The preview must not issue fictitious Pioneer IDs.

## Backend staging setup (requires separate authorized Cloudflare access)

See `worker/README.md`. New D1 database, Worker and authenticated email service are not provisioned by this code commit. Do not reuse old Sheets/Apps Script. Never place credentials in GitHub, `wrangler.toml` or public `assets/config.js`.

## Acceptance and review

Run `npm test` (Node.js 20+; no dependencies), inspect desktop/mobile at least 375px, 768px and 1280px; check menu, forms, contrast, focus order, Zeffy/social links, and privacy copy. Tests validate static structure and pure input rules, not a live D1 connection or transactional email. Full backend integration requires staging deployment with synthetic records.

Keep `main` and production DNS untouched. Request owner review before merging to the live publishing branch.
