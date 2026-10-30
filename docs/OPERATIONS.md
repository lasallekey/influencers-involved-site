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
- PayPal: there is no PayPal button anywhere. The approved plain notice is on `/donate/`. When an international method exists, change `src/pages/donate.html`.

## One-time staging setup (needs the owner's Cloudflare login — not done in this branch)
Staging needs no DNS change: it runs at a `*.workers.dev` URL.
```bash
npm install
npx wrangler login
npx wrangler d1 create ii-pioneer-registry            # copy the database_id into worker/wrangler.toml
npx wrangler d1 migrations apply ii-pioneer-registry --remote --config worker/wrangler.toml
npx wrangler secret put TOKEN_SECRET --config worker/wrangler.toml     # any long random string
npx wrangler secret put EMAIL_API_KEY --config worker/wrangler.toml    # from the email provider
# set SITE_URL in worker/wrangler.toml to the staging URL, then:
npm run build && npm run deploy:staging
```
Secrets are entered at the prompt and live only in Cloudflare. Never commit them. Without `EMAIL_API_KEY` the site still works: pledges save, certificates issue, and the success page offers a resend later.

## Email sender (verification links)
The Worker posts JSON to `EMAIL_API_URL` (default: a Resend-compatible API) from `EMAIL_FROM`. Before turning it on:
1. Pick one transactional provider (some are free at this volume; **ask the owner before any paid plan**). Cloudflare's own email sending can replace it if the account is eligible — only `src/email.js` changes.
2. Add the provider's DNS records for `influencersinvolved.org` (SPF, DKIM) plus a DMARC record. This is a DNS change → **owner approval required**.
3. Confirm `grants@influencersinvolved.org` really receives mail, send yourself a test registration, and check it lands in the inbox (not spam).
Until then the code is tested with a mock provider only.

## Looking at the data (private)
Only authorized people who can sign in to Cloudflare can read records. Use **Cloudflare dashboard → Workers & Pages → D1 → ii-pioneer-registry → Console**, or `wrangler d1 execute`. Ready-made filtered queries (contactable collaborators, news subscribers, unverified emails, totals, one person's record, withdraw/erase) are in `worker/admin-queries.sql`. Export results as CSV from the dashboard, or `wrangler d1 export ii-pioneer-registry --remote --output backup.sql` for a full backup (store it privately). There is intentionally no admin web page.

## Privacy requests
People write to grants@influencersinvolved.org. Verify they control the address, then use the "Privacy requests" statements at the end of `worker/admin-queries.sql`. Optional-email withdrawal also works by itself through the unsubscribe link in any optional email.

## Rollback
- **Site/API code:** `npx wrangler rollback --config worker/wrangler.toml` (or redeploy the previous commit). Data is untouched.
- **Database:** migrations are additive. Restore from an export with `wrangler d1 execute … --file backup.sql` into a fresh database if ever needed. Time Travel (point-in-time restore) is also available in D1.
- **Production cutover** (owner approval required): the current domain is served by GitHub Pages from the repository root (legacy files). Moving to the Worker means changing DNS / Pages settings; keep the old setup untouched until the new one is verified, so reverting is a DNS switch back.

## Security model in one paragraph
Browsers only ever call the Worker. The Worker holds the D1 binding and secrets; there is no database key in any public file. Writes validate every field, run as one transaction, are idempotent, honeypotted and rate-limited by an HMAC of the client address (raw addresses are not stored; rows expire in hours). Verification tokens are 256-bit random values; only their SHA-256 is stored; links are single-use and expire in 24 h. Public endpoints return only aggregate counts and verified + opted-in + approved profiles. D1 is encrypted at rest by Cloudflare and accessed over TLS (not end-to-end encryption — the Privacy page says so).

## Launch checklist (what still depends on the owner)
- [ ] Cloudflare database/Worker created, secrets set (staging, then production).
- [ ] Email provider chosen, SPF/DKIM/DMARC live, real inbox test passed. Then update the Privacy page with the provider's name and the retention period.
- [ ] Open the Zeffy link and confirm it is the II form (receipt branding, currency, eligibility).
- [ ] YouTube and TikTok URLs supplied (or leave hidden).
- [ ] Owner approves DNS/Pages cutover and merge of this branch.
