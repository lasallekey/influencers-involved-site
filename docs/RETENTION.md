# Retention of temporary records

What the code deletes automatically, when, and why. The Privacy page describes exactly this; if either changes, change both.
Pioneer registrations (`pioneers`, `social_accounts`) are **never** deleted automatically.

| Record | Purpose | Kept | Deleted by | Why this period |
|---|---|---|---|---|
| `rate_limits` (keyed hash of the visitor address + hourly counter) | Stop one visitor flooding registration/verification/resend | Counters only matter inside their one-hour window. Everything older than the previous hour is removed by the daily cleanup; about 5% of requests also purge opportunistically. Worst case about a day (≤ 26 h). | Cron `17 3 * * *` (UTC) → `runCleanup` in `worker/src/index.js` | The one-hour window is all the limiter needs; a daily sweep is the simplest reliable schedule. The address itself is never stored, only a keyed HMAC. |
| `email_verifications` (SHA-256 of a one-time link, send status, timestamps) | One-time email verification, resend throttling (3 per 24 h, 5-minute gap) | Link valid 24 h. Row deleted **7 days after it is used or expires** (whichever applies). | same daily cleanup | 24 h is the link lifetime. The 7-day tail gives support time to answer "my link says used/expired" and keeps the resend throttle's 24 h history, then removes the record. The Pioneer row keeps only `Verified/Pending` and `email_verified_at`. |
| `pioneers` / `social_accounts` | The registry itself | While the person participates, until they ask to be removed (or applicable law requires otherwise) | Manual, verified request: `scripts/erase-pioneer.mjs` | The registry is the product; nothing is auto-expired. Unverified registrations stay (their pledge and certificate are complete). |
| D1 point-in-time history ("Time Travel") | Provider safety net for recovery | Provider-controlled: [Assumption] 7 days on the Workers Free plan, 30 on Paid. The Privacy page says "up to 30 days". | Cloudflare | Deleted data can survive in this history until it ages out. |
| Cloudflare logs | Operations | Automatic per-request "invocation logs" are switched **off** in `wrangler.toml`; only our own redacted `console` lines (errors, provider rejections, cleanup counts) are kept, per Cloudflare's log retention. Cloudflare's network layer still processes visitor addresses under its own policy. | Cloudflare | Avoid logging request details we do not need. |
| Resend delivery records | Provider-side email logs | Per Resend's policy | Resend | Outside II's control; named on the Privacy page. |

## How it is verified
- `worker/test/registry.test.js` → "scheduled cleanup removes expired temporary records and never touches Pioneers…" seeds expired, spent, recent and current rows and asserts exactly which are deleted (including that Pioneers, accounts and verification *status* survive), that a second run does nothing, and that the Worker's `scheduled` handler runs it.
- Local run: `npm test`. The Cron Trigger is declared for staging and production in `worker/wrangler.toml` (`[env.*.triggers]`); after deploy, Cloudflare dashboard → Workers → ii-pioneer-registry-staging → Settings → Triggers shows it, and the `cleanup {...}` console line shows each run's deletion counts.

## Changing a period
Edit `RATE_LIMIT_KEEP_WINDOWS` / `VERIFICATION_KEEP_MS` in `worker/src/index.js`, update the table above and the Privacy page's "How long we keep information", run `npm test`.
