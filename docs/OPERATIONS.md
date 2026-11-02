# Operations guide

Short and practical. Nothing here needs a server you maintain: one Cloudflare Worker serves the static site (`site/`) and the registry API (`/api/*`) from one origin, backed by one D1 database.

## What exists in this repository
| Path | Purpose |
|---|---|
| `src/` → `site/` | Page sources → built static site (`npm run build`). `site/` is committed so it can be deployed as-is. |
| `src/config.json` | Public settings: Zeffy URL, social links, charity examples, contact details. |
| `worker/` | API (`src/`), database schema (`migrations/`), tests, admin recipes (`admin-queries.sql`). |
| `scripts/dev-server.mjs` | Local preview with an in-memory database and synthetic data (`npm run dev`). |
| Repo root (`index.html`, `pioneer.*`, `*.gs`) | **Legacy**, untouched, reference only. No legacy data is imported or read. |

## Edit public settings
- Zeffy link, social URLs, address, charity examples: edit `src/config.json`, run `npm run build`, commit.
- **YouTube / TikTok**: set `social.youtube` / `social.tiktok` to the real `https://…` URL. They appear in every footer automatically; `null` hides them.
- Donations: Zeffy is the only active provider; its link is `zeffyUrl` in `src/config.json` and the U.S. & international wording is under `donate` in the same file. There is no PayPal anywhere. Donorbox with Stripe is a possible future second channel (more currencies/regional methods); it is deliberately not on the site, and nothing should be added until it is set up and approved.

## Staging
Step-by-step (no command line needed): see [`STAGING.md`](STAGING.md). In short: add two GitHub secrets, run the "Deploy staging" workflow, open the URL it prints. The workflow also runs `npm test`, builds a staging-marked site, creates a separate free D1 database, applies migrations, deploys, sets secrets and smoke-tests. CI (`.github/workflows/ci.yml`) runs the tests, rebuilds `site/` to confirm it is committed, validates the Worker config and runs the browser end-to-end on every pull request.

Production is prepared but **not deployed**: see [`PRODUCTION.md`](PRODUCTION.md) (separate `[env.production]`, fresh database, manual approval workflow, dark launch, Cloudflare zone and cutover steps, rollback, backups). Always deploy with an explicit `--env`; `worker/wrangler.toml` has no default environment.

## Email sender (verification links)
The Worker posts JSON to `EMAIL_API_URL` (default: a Resend-compatible API) from `EMAIL_FROM`. Before turning it on:
1. Pick one transactional provider (some are free at this volume; **ask the owner before any paid plan**). Cloudflare's own email sending can replace it if the account is eligible — only `src/email.js` changes.
2. Add the provider's DNS records for `influencersinvolved.org` (SPF, DKIM) plus a DMARC record. This is a DNS change → **owner approval required**.
3. Confirm `grants@influencersinvolved.org` really receives mail, send yourself a test registration, and check it lands in the inbox (not spam).
Until then the code is tested with a mock provider only.

## Looking at the data (private)
Only authorized people who can sign in to Cloudflare can read records. Use **Cloudflare dashboard → Workers & Pages → D1 → ii-pioneer-registry → Console**, or `wrangler d1 execute`. Ready-made filtered queries (contactable collaborators, news subscribers, unverified emails, totals, one person's record, withdraw/erase) are in `worker/admin-queries.sql`. Export results as CSV from the dashboard, or `wrangler d1 export ii-pioneer-registry --remote --output backup.sql` for a full backup (store it privately). There is intentionally no admin web page.

## Privacy requests
People write to grants@influencersinvolved.org. Target: verified deletion requests completed within 30 days.
1. **Verify** the requester controls the registered address (reply from it, or have them reply to a message you send to it, or quote their Pioneer ID plus a message from the address).
2. **Dry run** (shows counts only; prints no names, emails or handles):
   `node scripts/erase-pioneer.mjs <registered email or Pioneer ID> --env production`
3. **Erase** (children first: verification records, social accounts, then the registration; then it re-counts and fails loudly if anything remains):
   `node scripts/erase-pioneer.mjs <registered email or Pioneer ID> --env production --confirm`
   It needs `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` in your shell or can be run by an authorized developer session. Use `--env staging` for staging.
4. Tell the person it is done and that copies in the provider's recovery history expire within up to 30 days. Also delete the person from any private exports or lists you keep. Keep a note of the request date and completion date (not their data) in your own records.
Withdrawal without erasure (stop counting/listing, keep the record) and corrections use the statements at the end of `worker/admin-queries.sql`. Optional-email withdrawal also works by itself through the unsubscribe link in any optional email.
**Rehearsal:** every staging deploy runs `scripts/rehearse-erasure.mjs` against the deployed staging database with synthetic people (two registrations, dry run, erase one by Pioneer ID, confirm the other is untouched and the address can register again). Locally the same code is exercised by `scripts/test/erase.test.js` and a worker test that registers real rows through the API.

## Rollback
- **Site/API code:** `npx wrangler rollback --env <staging|production> --config worker/wrangler.toml` (or redeploy the previous commit). Data is untouched.
- **Database:** migrations `0001` and `0002` are forward-only (no down-migrations; `0002` rebuilds `social_accounts`). Recovery is D1 Time Travel (point-in-time) or restoring a private export into a fresh database. Full steps: [`PRODUCTION.md`](PRODUCTION.md) §7-8.
- **Production cutover** (owner approval required): the current domain is served by GitHub Pages from the repository root (legacy files; a root `_config.yml` makes sure only those are published). Cutover and its reversal are DNS steps, fully described in [`PRODUCTION.md`](PRODUCTION.md).

## Security model in one paragraph
Browsers only ever call the Worker. The Worker holds the D1 binding and secrets; there is no database key in any public file. Writes validate every field, run as one transaction, are idempotent, honeypotted and rate-limited by an HMAC of the client address (raw addresses are not stored; counters are deleted automatically, [RETENTION.md](RETENTION.md)). Verification tokens are 256-bit random values; only their SHA-256 is stored; links are single-use and expire in 24 h, and the email link only opens a confirmation page: the token is consumed by an explicit button press (POST), so email-link scanners cannot use it up. If `TOKEN_SECRET` is missing the API refuses to run. Public endpoints return only aggregate counts and verified + opted-in + approved profiles. D1 is encrypted at rest by Cloudflare and accessed over TLS (not end-to-end encryption — the Privacy page says so).

## Launch checklist (what still depends on the owner)
- [ ] Cloudflare database/Worker created, secrets set (staging done; production per `PRODUCTION.md`).
- [ ] Email provider chosen, SPF/DKIM/DMARC live, real inbox test passed. Then update the Privacy page with the provider's name and the retention period.
- [ ] Open the Zeffy link and confirm it is the II form (receipt branding, currency, eligibility).
- [ ] YouTube and TikTok URLs supplied (or leave hidden).
- [ ] Owner approves DNS/Pages cutover and merge of this branch.
