# Fresh Pioneer registration backend — Cloudflare Worker + D1

**Status:** Code scaffold only. No database created, no Worker deployed, no production records changed. Do not expose this endpoint as production until the conditions below are met.

## Create staging database and Worker

1. Sign in to the II-owned Cloudflare account (do **not** put sign-in credentials in code).
2. Create an **empty new** D1 database named `ii-pioneers-staging`, for example `npx wrangler d1 create ii-pioneers-staging`.
3. Copy `wrangler.toml.example` to `wrangler.toml` in `worker/`, fill the new database UUID, staging origin and a **verified** sender identity. Do not commit your local `wrangler.toml` if it contains environment-specific account information.
4. Initialize the **new** schema with `npx wrangler d1 execute ii-pioneers-staging --remote --file=schema.sql` from `worker/`. Keep a record of the schema version and database ID privately.
5. Set `IP_HASH_PEPPER` (random secret) via `npx wrangler secret put IP_HASH_PEPPER`. This is required for request throttling.
6. Choose one authenticated transactional sender. Code supports Resend's API: verify the II sending domain and configure SPF, DKIM, DMARC first; add `RESEND_API_KEY` as a Worker secret and a valid `EMAIL_FROM`. If no verified sender is ready, registration persists with `email_status=not_sent` and no public profile listing; do not launch publicly in that state.
7. Deploy to an isolated **staging** Worker only after owner authorizes Cloudflare operations. If deployment would create an unexpected expense or modify live DNS, stop and request approval.
8. Set the frontend's **public** `assets/config.js` `apiBase` to the staging Worker HTTPS origin. Never put secret keys there.

The Worker provides:
- `GET /api/health` — health response only (not a full DB/email readiness test).
- `GET /api/public` — safe aggregate counts and opted-in, email-verified public Pioneer profiles. Never returns email/consents.
- `POST /api/register` — validated multi-profile registration with D1 transactional batch and idempotency key; ID/certificate only upon confirmed persistence.
- `GET /api/verify?token=` — single-use expiring hashed-token confirmation. Verification does not mean proof of donation or marketing consent.
- `POST /api/resend` — throttled, generic-response email confirmation resend for an unverified registered email.

## Before public launch

- Test schema on an entirely fresh database with synthetic Pioneers only, including duplicate emails, idempotent retries and multiple social profiles.
- Verify consent separation, anonymous public exclusion, public opt-in + email-verified listing, token replay, expired token handling, disabled/revoked consents, and secure data deletion/correction.
- Confirm signed/verified sending domain and actual inbox delivery (SPF/DKIM/DMARC), sender compliance and unsubscribe procedures for optional outreach. No marketing sending is implemented.
- Configure Cloudflare WAF and/or Turnstile for additional abuse prevention. This scaffold uses an IP-keyed daily throttle (only a salted hash stored), but cannot claim complete bot protection.
- Consider a dedicated verification-domain route before live email delivery. The Worker links currently lead to its own HTTPS `/api/verify` endpoint.
- Finalize privacy wording to name deployed processors, retention, correction and withdrawal process, cookies and other needed disclosures. The current page intentionally labels parts of this as pre-launch review.
- Configure back-ups/export and retention/deletion cadence. Never send private record exports to public GitHub.
- Complete external donation and social-link checks. YouTube/TikTok remain hidden until actual profiles supplied.
- **No production DNS change, `main` merge, existing site replacement or legacy data migration without owner approval.**

## Private operations

Use Cloudflare's authenticated D1 dashboard SQL console or authorized Wrangler CLI. No admin web UI is built.

Examples (execute against the PRIVATE new D1 only; never expose query results publicly):

```sql
SELECT id,creator_name,email,country,created_at,verified_at
FROM pioneers WHERE verified_at IS NOT NULL AND news_opt_in=1 ORDER BY created_at DESC;

SELECT p.creator_name,p.email,p.collaboration_types,p.created_at
FROM pioneers p
WHERE p.verified_at IS NOT NULL AND p.collaboration_email_opt_in=1 AND p.collaboration IN ('yes','maybe')
ORDER BY p.created_at DESC;

SELECT COUNT(*) AS pioneers FROM pioneers;
SELECT COUNT(*) AS social_accounts FROM social_accounts;
```

For a correction/withdrawal, verify the requester through an appropriate private process and document the change. For deletion, first export a private backup within approved retention rules, then delete only the selected new Pioneer ID (social accounts and verifications use cascading foreign keys). Don't delete by guessed name. Update backup/retention practices after legal/privacy review.

Keep the old Pioneer spreadsheet and Apps Script untouched.
