# FINAL LAUNCH READINESS REPORT

Influencers Involved, Inc. NFP — website rebuild and Phase 1 Pioneer registration
Branch `claude/happy-brown-0ytqwr`, draft PR #2 · Audit date 2026-11-02 · Audit only: nothing in this report has been implemented.

**How to read this report.** Every statement is tagged where it matters:

- **[Verified]** I observed it in this audit (code read, test run, script, or CI result).
- **[Owner-reported]** The owner told me; I could not independently check it from this sandbox.
- **[Assumption]** Believed true, not checked. It should be confirmed before it is relied on.
- **[Owner decision]** Cannot be settled by engineering; it needs authorization or a policy choice.

Scope, as instructed: security, registry/database, registration UX and accessibility, email, privacy and transparency, donations, production readiness. Completed and approved items (visual design, registry features, Resend domain authentication, inbox delivery, verification-link flow) were not re-tested without a specific reason. No DNS, credentials, production settings, legacy files or legacy data were touched.

---

## Remediation update (2026-11-02, after owner review)

The owner accepted the CONDITIONAL GO and asked for focused remediation without a redesign. The sections below are the original audit as written; **this table is the current status.** Evidence is the committed code and tests on this branch; "staging" results are from GitHub Actions runs recorded in `BUILD_STATUS.md` (CI and Deploy staging were green on the remediation commit).

| ID | Status now | What changed / what remains |
|---|---|---|
| P1-1 Privacy page | **Drafted, awaiting owner approval** | Placeholder removed; names Cloudflare, Resend, Zeffy, Google Workspace; states retention, 18+, deletion within 30 days, international handling. Policy and legal choices are listed in `docs/PRIVACY_POLICY_PROPOSAL.md`. No legal sign-off is claimed. |
| P1-2 Non-Latin charity names | **Resolved** | Unicode-aware `charityKey`; tests for ten scripts, de-duplication, and unchanged keys for all 101 catalogue names and aliases. |
| P1-3 Secret fallback | **Resolved** | No fallback. Without a 32+ character `TOKEN_SECRET` every `/api/*` route answers 503 and `/api/health` reports `secrets_configured:false`. Forged-link regression test added. |
| P1-4 Zeffy/social links | **Open, owner action** | Unchanged: needs a human check in a browser. |
| P1-5 Production path | **Prepared, not executed** | `[env.production]` (fresh database name, verified sender, cron, logs), manual approval workflow `production.yml`, dark-launch build, GitHub Pages guard (`_config.yml`, verified with a real Jekyll build), `scripts/dns-preflight.mjs`, full plan in `docs/PRODUCTION.md`. No production resource, DNS change, merge or deployment has happened. |
| P2-1 Inflated counts | **Documented, counting unchanged** | Limitation and lightest mitigations in `docs/REGISTRY.md`; "registry gate review" query added. No Turnstile. |
| P2-2 Retention enforcement | **Resolved** | Daily cron deletes expired rate-limit rows and verification records 7 days after use/expiry; never touches Pioneers. `docs/RETENTION.md`. |
| P2-3 Scanner-safe verification | **Resolved** | Email link opens a confirm page (token in the URL fragment); the token is consumed only by an explicit POST. Old `GET /api/verify` links redirect without consuming. Single-use and 24 h expiry unchanged. |
| P2-4 Honeypot | **Resolved** | Field renamed (not autofillable), a hit returns 400 and never a Pioneer ID or certificate; browser test confirms. |
| P2-5 Duplicate-email signal | Deferred | Unchanged (owner decision). |
| P2-6 Erasure | **Resolved** | `scripts/erase-pioneer.mjs`: dry run, explicit children-first deletes, recount, no personal data printed. Rehearsed locally (sqlite D1 shim, foreign keys off) and in the staging workflow against the real staging D1 with synthetic people: it **passed** (dry run found 1 registration/2 accounts/1 verification record and deleted nothing; erase left 0/0/0; the other person untouched; the address could register again). Run 41518701921. |
| P2-7 Observability | Partly | Workers Logs on, automatic invocation logs off, in both environments. Alerting deferred. |
| P2-8 Asset caching | **Resolved** | `/assets/*` revalidated every 10 minutes. |
| P2-9 HSTS | **Resolved** | 30-day HSTS on non-staging, non-dark-launch builds. |
| P2-10 Resend limits | Owner to confirm | Documented in `docs/PRODUCTION.md`. |
| P2-11 DMARC | Deferred | Post-launch. |
| P2-12 Branch protection / token scope | Owner action | Steps in `docs/PRODUCTION.md` section 2. |
| P2-13 Backup and restore | Documented | Restore rehearsal needs the production database; scheduled before cutover. |
| New: bounces from test addresses | **Resolved** | No email is attempted for reserved test domains (`.invalid`, `.test`, `example.*`), so smoke tests cannot hurt the sender reputation. |
| New: honest age rule | **Resolved** | Pledge checkbox now includes the 18+ confirmation; no extra data stored. |

Still open before launch: P1-1 approval, P1-4 human link check, the owner approvals and one-time setup listed in `docs/PRODUCTION.md` (GitHub environment and secrets, merge, Stage 1-3), and the restore rehearsal. Verdict: **CONDITIONAL GO stands**, with the remaining conditions now owner-side only.

---

## 1. Executive summary

The build is in good shape for a small nonprofit. The architecture is deliberately small (static site, one Worker, one D1 database, one email provider). The privacy-sensitive logic is correct where I checked it: tokens are stored only as SHA-256 hashes, are single-use and expire; registration writes are atomic and idempotent; the public registry stays `{visible:false}` below 20 eligible records; test and anonymous records are handled as designed; the CSP forbids inline script and style.

I found **no P0 (stop-ship security or data-loss) defect.** I found **five P1 items**. Two are code-level and small. Two need owner or legal input. One is a missing production plan. None of them needs a redesign.

| Area | Result |
|---|---|
| Security | Sound design; one fail-open default secret to close (P1-3) |
| Registry and database | Rules correct and tested; one international-name defect (P1-2) |
| Registration UX and accessibility | Good; automated checks clean; a few small robustness items (P2) |
| Email | Domain authenticated [Owner-reported]; token-consuming GET link is fragile with link scanners (P2) |
| Privacy and transparency | **Privacy page still contains a pre-launch placeholder and omits the provider and retention period (P1-1)** |
| Donations | Wording correct and Zeffy-only; live destination not yet confirmed by a human (P1-4) |
| Production readiness | No production config, deploy workflow, or cutover plan yet (P1-5) |

## 2. Overall readiness

| Dimension | Status | Notes |
|---|---|---|
| Staging (owner testing) | **Ready** | CI `test` and staging `deploy` both succeeded on the current head [Verified, GitHub check runs 2026-11-02] |
| Code quality and tests | Good | `npm test`: 44 of 44 pass; `npm run check`: 8 HTML files, 7 routes OK [Verified] |
| Public launch | **Not yet** | Blocked by the five P1 items below, mostly small |
| Estimated effort to clear P1 | Small | About half a day of engineering plus owner decisions and the cutover itself |

Test coverage is concentrated in the registry rules (32 of 44 tests), plus catalogue, migration, email-DNS and site-structure tests. Browser e2e and axe-core audits exist in CI; I did not re-run them [Assumption: still passing, as CI is green].

## 3. Confirmed P0 / P1 launch blockers

**P0: none found.**

### P1-1 — Privacy page is unfinished and under-discloses
- **What.** `src/pages/privacy.html` still contains the line "Retention period and the final named email provider will be confirmed here before public launch." It describes "a transactional email provider" without naming it (Resend), gives no retention period, and says the hashed IP "is deleted automatically after a short period" without stating the period. It has no age-eligibility statement and no statement about international visitors, transfers, or applicable privacy rights (for example GDPR or CCPA/CPRA).
- **Why it matters.** The site invites creators worldwide to submit names, emails, countries and social handles, with optional public display. A public placeholder undermines trust, and the page must not promise things the system does not do.
- **File.** `src/pages/privacy.html` (built to `site/privacy/index.html`).
- **Recommendation.** Finalize the text: name Resend as the email processor, Cloudflare as host and database, and Zeffy for donations; state concrete retention periods; state who may register (age); describe rights requests and how to make them; align every claim with what is implemented (see P2-2). Have a qualified person review the wording.
- **Must fix before launch.** Yes. **[Owner decision]** for the retention periods, age policy and legal review. Engineering can draft; I cannot give legal sign-off.

### P1-2 — Charity names in non-Latin scripts are rejected
- **What.** `charityKey` in `worker/src/charity.js` collapses every character outside `a-z0-9` to a space. A charity written in Cyrillic, Arabic, Hebrew, Greek, CJK, Devanagari and so on normalizes to an empty key, and `resolveCharity` then returns an error. A legitimate "Another charity" entry is refused. Accented Latin names survive only because NFKD normalization splits off the accents first.
- **Reproduced** with a scratch script outside the repository [Verified].
- **Why it matters.** The Donate page and the Challenge explicitly welcome international creators. A creator giving to a charity in Greek or Japanese cannot register, and the form's error would be confusing.
- **File.** `worker/src/charity.js` (the `.replace(/[^a-z0-9]+/g, ' ')` step).
- **Recommendation.** Use a Unicode-aware class (letters and numbers, for example `/[^\p{L}\p{N}]+/gu`) while keeping the existing alias, placeholder, URL and email rejection. Add tests for several scripts and for the existing 101-name catalogue (which must keep the same keys).
- **Must fix before launch.** Yes. Small change plus tests.

### P1-3 — Secret falls back to a public constant when `TOKEN_SECRET` is missing
- **What.** `worker/src/index.js` uses `env.TOKEN_SECRET || 'dev-only'` for both the IP-hashing key (rate limiting) and the unsubscribe token. If the secret is not set in production, anyone reading the public repository can compute a valid unsubscribe link for any Pioneer ID, and the stored IP hashes become reversible by brute force.
- **Reproduced** locally: a forged unsubscribe link was accepted when the secret was unset [Verified].
- **Why it matters.** Impact is moderate (forged links withdraw optional email consent; IP hashes are weakened), but the failure is silent and one forgotten `wrangler secret put` triggers it. `worker/wrangler.toml` only mentions the secret in a comment and nothing enforces it.
- **Files.** `worker/src/index.js` (lines near `clientBucket` and `unsubToken`), `worker/wrangler.toml`.
- **Recommendation.** Fail closed: if `TOKEN_SECRET` is absent outside the local dev server, refuse the affected endpoints (or all `/api/*` except `/api/health`) and report `secrets_configured:false` from `/api/health`. Add the secret to the production checklist and the deploy workflow's preflight.
- **Must fix before launch.** Yes. Small change plus a test.

### P1-4 — External links and donation destination not yet confirmed live
- **What.** I cannot open external sites from this sandbox. The Zeffy form URL and the three social profile URLs are taken from the owner's instructions, and the Zeffy link points where the instructions say. Nobody has yet confirmed in a browser that the Zeffy form belongs to II's U.S. account, accepts a card from abroad, and shows USD and the optional Zeffy contribution. The project instructions also say to check the donation destination before production launch.
- **Why it matters.** A wrong or dead donation link is the costliest possible launch defect for a nonprofit.
- **Recommendation.** The owner opens the Zeffy form and the three social links once, from a normal browser, and confirms: right organization, a test small donation (or a preview) reaches II's Zeffy account, and the page displays USD. `scripts/check-site.mjs` can be rerun from a runner with outbound access.
- **Must fix before launch.** Yes (a five-minute human check). **[Owner decision/action]**

### P1-5 — No production configuration, deploy path, or cutover plan
- **What.** [Verified] `worker/wrangler.toml` top level has `database_id = "REPLACE_WITH_ID_FROM_wrangler_d1_create"`, no `routes`, no `[observability]`, and `EMAIL_FROM = "Influencers Involved <grants@influencersinvolved.org>"` (the authenticated sender the owner chose is `verification@influencersinvolved.org`). `.github/workflows` has `ci.yml` and `staging.yml` only; there is no production deploy workflow or approval gate. The repository has no `.nojekyll` or Pages config, and the legacy site is served from the repository root, so a merge to `main` does not by itself publish the new `site/` correctly (and, if Pages is pointed at the repository root, it would publish `docs/`, `worker/` and the legacy files too).
- **Why it matters.** The cutover is the highest-risk step. It needs a written plan with a known rollback, and the owner must authorize it.
- **Recommendation.** Decide the hosting model (see section 7), then produce: a production D1 database and migrations, production secrets, the correct `EMAIL_FROM`, route or custom-domain binding, a manually approved deploy workflow, and a rehearsed rollback. Do not merge PR #2 until the hosting model is settled.
- **Must fix before launch.** Yes. **[Owner decision]**, because it involves DNS, a possible merge to `main`, and live deployment. Nothing here may proceed without explicit approval.

---

## 4. P2 — Recommended improvements

Most can ship with launch; none is a blocker on its own. "Before launch?" is my recommendation.

| ID | Finding | File | Recommendation | Before launch? |
|---|---|---|---|---|
| P2-1 | **Public counts can be inflated.** Eligibility is `Active AND is_test=0`; verification is not required to count. One person with 20 throwaway addresses can unlock the registry and inflate the four dashboard numbers (register limit is 10 per IP per hour, so it takes only a couple of hours). The public listing itself is protected because it needs verified email plus permission. | `worker/src/index.js`, `docs/REGISTRY.md` | Cheapest fixes: add Cloudflare Turnstile (free) to the form, or count only verified registrations toward the 20-record gate. The owner has said verification is not a condition for a pledge, so a Turnstile check is the less intrusive option. | Recommended **[Owner decision]** |
| P2-2 | **Retention claims are only probabilistically enforced.** `overLimit` purges old `rate_limits` rows on about 5% of requests, so with little traffic, rows (hashed IP buckets) can stay well past "a short period". Expired verification rows are never purged. | `worker/src/index.js` | Add a daily Cron Trigger that deletes expired rate-limit rows and old consumed/expired verification rows, then state the actual periods on the Privacy page. Until then, soften the page wording. | Yes, together with P1-1 |
| P2-3 | **GET `/api/verify` consumes the token.** Email security scanners (Microsoft Safe Links, some gateways) fetch links before the person clicks, which burns the single-use token; the person then sees "invalid". Recovery exists (resend link), and verification is not a condition for the pledge or certificate. | `worker/src/index.js` `verify` | Make the link open a static page that calls a POST to consume the token, or accept a harmless first GET and require a click on a confirm button. | Recommended |
| P2-4 | **Honeypot field is named `website`** with a visible "Website" label (hidden by CSS, `aria-hidden`, `tabindex=-1`). Browser autofill can fill an off-screen field with that name. The Worker then returns a decoy 201 with a made-up ID and stores nothing, so a real creator is told they succeeded and are silently dropped. | `src/pages/challenge.html`, `worker/src/index.js` | Rename to a non-semantic name (and `autocomplete="off"`, already present), and add a minimum-fill-time check. Consider logging honeypot hits (without personal data) so silent drops are visible. | Recommended |
| P2-5 | **Duplicate email returns 409 `email_registered`.** This lets anyone test whether an address is registered. `/api/resend-verification` was already designed to answer identically for known and unknown addresses. | `worker/src/index.js` `register` | Accept the privacy trade-off knowingly, or return the generic path and mail the existing address. | Optional **[Owner decision]** |
| P2-6 | **Erasure recipe depends on `ON DELETE CASCADE`**; the smoke-cleanup script deletes children explicitly. The recipe has not been exercised against real D1. | `worker/admin-queries.sql` | Make the recipe delete child rows explicitly, and rehearse it once on staging. A privacy request must be answerable within days. | Yes (small) |
| P2-7 | **No observability.** Production config has no `[observability]`; the Worker logs only a few redacted lines. No one learns that email sending is failing or that registrations are erroring. | `worker/wrangler.toml` | Enable Workers logs; add a basic failure alert (email send failures, 5xx rate). Keep personal data out of logs, as the code already does. | Recommended |
| P2-8 | **Static assets cache for 24 h under unversioned names.** After a deploy, visitors can get new HTML with old CSS/JS for up to a day. | `scripts/build.mjs` (`_headers`) | Fingerprint asset filenames, or use a short `max-age` with `must-revalidate` for CSS/JS. | Recommended |
| P2-9 | **No HSTS.** Appropriate to add once the production domain is on HTTPS permanently. | `scripts/build.mjs` (`_headers`) | Add `Strict-Transport-Security` at cutover; begin with a modest max-age. | At cutover |
| P2-10 | **Resend free-tier limits** [Assumption: about 100 emails/day and 3,000/month; confirm in the dashboard]. A launch spike above the daily cap makes verification emails fail with HTTP errors; registration still succeeds, and `send_status` records the failure. | `worker/src/email.js` | Confirm the current limits; decide whether to upgrade (a paid service needs owner approval). Add a documented way to list and re-send failed verifications. | Confirm limits |
| P2-11 | **DMARC is `p=none`** [Owner-reported; the DKIM, `send` and `rsend` records are verified in Resend]. Fine for launch; it gives no enforcement. | DNS (not in repo) | After a few weeks of clean reports, move to `quarantine`. Do not touch Google Workspace MX/SPF/DKIM. | Post-launch OK |
| P2-12 | **Branch protection and token scope.** No required checks or reviews on `main` [Assumption: not configured]; Cloudflare API token scope and expiry not reviewed. | GitHub/Cloudflare settings | Require the CI check and a review before merge to `main`; scope the Cloudflare token to the one account and the Workers/D1 permissions it needs, with an expiry date. | Yes, before the merge |
| P2-13 | **Backups and restore are undocumented in practice.** `docs/OPERATIONS.md` describes `wrangler rollback` and restoring from an export, but no restore has been rehearsed. D1 also offers point-in-time recovery (Time Travel) [Assumption: retention depends on plan; confirm]. | `docs/OPERATIONS.md` | Take a baseline export before launch, rehearse a restore into a scratch database once, and record the real Time Travel window. | Recommended |

## 5. P3 — Post-launch enhancements

- **P3-1** Manual screen-reader and keyboard pass of the registration form and certificate flow (automated axe checks report 0 violations, but they do not replace a human pass).
- **P3-2** `docs/REGISTRY.md` says public responses are cached for 60 seconds; that is true per browser only (no edge cache rule exists). Correct the wording or add a cache rule.
- **P3-3** `/api/health` reveals whether email is configured. Harmless, but limit it to a boolean "ok" publicly if desired.
- **P3-4** The shared per-IP limit (10 registrations per hour) could affect a school or workshop behind one address. Monitor after launch; raise or add Turnstile if it bites.
- **P3-5** Sitemap lacks `lastmod`; add it from the build date.
- **P3-6** `docs/OPERATIONS.md` calls migrations "additive"; `0002` rebuilds `social_accounts`. Wording only; there is no down-migration, so restore from a backup is the reversal path.
- **P3-7** Legacy `README_DEPLOYMENT.md` in the repository root references an internal mailbox. The repository is public; the project instructions say not to delete old files without owner approval **[Owner decision]**, so I left it.
- **P3-8** Add YouTube and TikTok links when real URLs exist (the build already omits them cleanly).
- **P3-9** Optional second donation channel (Donorbox with Stripe) remains a future enhancement only; nothing is added or stubbed. PayPal is entirely absent [Verified by repository search].
- **P3-10** Real photography to replace illustrations, when available.

---

## 6. Security and privacy assessment

### What I verified as sound
- **Tokens.** 256-bit random verification tokens; only SHA-256 stored; single-use enforced with a conditional `UPDATE` inside a batch, so a race cannot consume one twice; 24-hour expiry; a new resend invalidates older links; resend throttled per address (gap and daily cap) and per IP [Verified in `worker/src/index.js`; replay and expiry covered by tests].
- **Registration integrity.** One batch writes the Pioneer, all social profiles and the first verification record atomically; idempotency keys make retries safe; duplicate emails and duplicate platform/handle pairs are handled [Verified, tests].
- **Input handling.** Server-side validation of every field; parameterized SQL everywhere (every `prepare` uses `bind`; the only interpolated fragment is the constant `ELIGIBLE`); handles, URLs (https only), countries and charities are normalized; placeholders, URLs and emails are rejected as charity names.
- **Public surface.** Only `/api/stats`, `/api/pioneers`, `/api/health`, and the token-bearing verify/unsubscribe links are public GETs. Below 20 eligible registrations `/api/stats` returns exactly `{visible:false}` and the listing returns nothing. The listing exposes only verified, permissioned, non-anonymous, non-test records [Verified, tests].
- **Anonymous and test records.** Anonymous Pioneers count in aggregates but are never named; test addresses (reserved domains, `smoke+`, `+test`) are flagged `is_test` and never counted.
- **Browser hardening.** CSP with no inline script/style, `frame-ancestors 'none'`, `nosniff`, `X-Frame-Options: DENY`, strict referrer and permissions policy; no analytics or advertising cookies; origin check on the write endpoints; self-hosted fonts.
- **Secrets hygiene.** No credentials in the repository; the email API key is a Worker secret; provider error logs redact email addresses and token-like strings.
- **Email consent.** Optional news and optional collaboration contact are separate, unchecked by default, and a single unsubscribe link withdraws both; verification and certificate do not depend on them.

### What is weak (all itemized above)
- A public fallback secret (P1-3).
- Stated retention not mechanically enforced (P2-2).
- Count manipulation by throwaway emails (P2-1).
- Email-enumeration signal on duplicate registration (P2-5).
- Token-consuming GET link (P2-3).

### Privacy posture in one paragraph
Data collected is modest and purposeful (name, email, country, social handles, charity, consents). Email addresses are private and never exposed. Public display needs explicit permission and a verified email. The unresolved parts are policy rather than code: the final Privacy page text, retention periods, age eligibility, international-visitor language, and a designated person and process for correction and erasure requests (P1-1, P2-6).

## 7. Production deployment prerequisites

All of these are **[Owner decision/authorization]** unless marked as engineering.

1. **Hosting model.** The Worker already serves `site/` and `/api/*` together on one origin (Workers Assets). The simplest production design is a **separate production Worker plus a fresh production D1 database**, attached to `influencersinvolved.org` through Cloudflare. Pointing the domain at Cloudflare changes DNS and needs written approval; the Google Workspace mail records and the Resend records (DKIM TXT, `send` and `rsend` CNAMEs) must be carried over unchanged, and the legacy site stays reachable until cutover. A lower-risk alternative is first launching on the Worker's `workers.dev` address (no DNS change) for a soft launch, and cutting the domain later.
2. **New production D1 database** and `wrangler d1 migrations apply` (engineering, once the database exists). Do not point production at the staging database; do not import legacy Pioneer data.
3. **Production secrets** set in Cloudflare: `TOKEN_SECRET` (long random value), `EMAIL_API_KEY` (a production key; consider a key separate from staging). No secret may appear in the repository.
4. **Configuration (engineering):** `EMAIL_FROM` set to the verified `verification@influencersinvolved.org` sender; `SITE_URL=https://influencersinvolved.org`; routes or custom domain; `[observability]` enabled.
5. **A production deploy workflow** that runs only on manual approval and uses an environment gate, plus the fail-closed secret check (P1-3).
6. **GitHub Pages guard.** Decide whether the legacy Pages site stays live until cutover. Do not merge PR #2 into `main` while Pages serves the repository root, because the merge would also publish the new tree's `docs/`, `worker/` and other non-site files there (or break the legacy site). Either keep Pages off the root, or restrict what it publishes.
7. **Email readiness gate.** Re-run `scripts/check-email-dns.mjs` against the real domain; confirm SPF, DKIM and DMARC alignment from an actual delivered message's headers (not just the provider dashboard); confirm that `grants@` receives mail, since the site publishes it for corrections and removals.
8. **Human checks (P1-4):** Zeffy form, three social links.
9. **Final Privacy page and legal review** (P1-1).
10. **Smoke test on production** with a clearly synthetic address, then remove that record with `worker/cleanup-smoke.sql` so no test data is counted.

## 8. Rollback and recovery readiness

| Layer | Readiness |
|---|---|
| Legacy site | **Intact and untouched**: it is the natural rollback target for a DNS cutover. Keep it running until the new site is proven. |
| Worker/site code | `wrangler rollback` or redeploy the previous commit is documented in `docs/OPERATIONS.md` [Verified]. Not yet rehearsed. |
| Database | Migrations `0001` and `0002` are forward-only; there are no down-migrations. Recovery is by export and restore, or Time Travel [Assumption: window per plan]. A restore drill has not been done (P2-13). |
| DNS | Rollback is only as quick as the TTLs you set before the change. Lower TTLs on any record that will move, ahead of time, and record the old values before editing. |
| Email | If sending fails, registration still succeeds and the person can request a resend; failures are recorded in `send_status`. There is no automatic retry queue (acceptable for Phase 1). |
| Privacy requests | Recipe exists in `worker/admin-queries.sql`; needs the explicit-delete hardening and one rehearsal (P2-6). |

**Verdict:** adequate for a low-volume launch **if** a pre-launch export is taken and the cutover keeps the legacy site available. Rollback is untested rather than absent.

## 9. Prioritized action plan

Nothing below has been started. Items marked ◆ need the owner.

1. ◆ Settle the hosting and cutover model (section 7, item 1) and the Pages question (item 6). *Unblocks everything in production.*
2. Fix P1-2: Unicode-aware charity normalization, with tests. *Small.*
3. Fix P1-3: fail closed when `TOKEN_SECRET` is missing; add a health flag and test. *Small.*
4. ◆ Decide retention periods, age eligibility, and legal review scope; then finalize the Privacy page (P1-1), naming Resend, Cloudflare and Zeffy.
5. Add the scheduled cleanup (P2-2) so the retention periods stated in step 4 are true; harden the erasure recipe (P2-6).
6. ◆ Decide the count-protection approach (P2-1: Turnstile vs verified-only) and the duplicate-email behavior (P2-5).
7. Make the verification link scanner-safe (P2-3); rename the honeypot and add a timing check (P2-4).
8. Production configuration: `EMAIL_FROM`, `SITE_URL`, route, observability; approved production deploy workflow; asset-cache fix (P2-8); HSTS at cutover (P2-9).
9. ◆ Create the production D1 database and set production secrets; apply migrations.
10. ◆ Take a baseline export and rehearse restore; confirm Resend and Time Travel limits (P2-10, P2-13); set branch protection and scope the Cloudflare token (P2-12).
11. ◆ Human link checks: Zeffy and social links (P1-4); one real-inbox verification test with the production sender.
12. ◆ Production smoke test, cleanup, and go/no-go sign-off; then cutover and 48 hours of close monitoring.
13. Post-launch: items in section 5; move DMARC toward enforcement (P2-11).

## 10. Final recommendation

## **CONDITIONAL GO**

**Staging: GO.** Keep testing there.

**Public launch: GO once the five P1 items are closed and the owner authorizes the cutover.** Specifically:

1. P1-1: Privacy page finalized and reviewed (owner and legal).
2. P1-2: International charity names accepted (engineering).
3. P1-3: Secret fails closed (engineering).
4. P1-4: Zeffy and social links confirmed by a person (owner).
5. P1-5: Production configuration, deploy path and cutover/rollback plan approved (owner).

I recommend also doing P2-2, P2-3, P2-4, P2-6 and P2-12 before launch, since each is small and removes a real failure mode; the remaining P2 and P3 items can follow launch.

I would **not** call this NO-GO: nothing found threatens data safety or requires re-architecture. I would not call it an unconditional GO: a visible placeholder on the Privacy page, a rejection bug for international charity names, and an undefined production path are exactly the kinds of defects that are cheap to fix now and embarrassing to fix after launch.

### Items that need owner authorization (not engineering)
Privacy wording, retention, age and legal review · Turnstile or verified-only counts · hosting model and any DNS change (preserving Google Workspace and Resend records) · production database and secrets · production deploy workflow and merge to `main` · Resend plan or any paid service · branch protection and token scoping · live checks of Zeffy and social links · whether to remove the legacy deployment README from the public repository.

### Assumptions to confirm
Resend free-tier limits; D1 Time Travel retention for the account's plan; branch protection state; Resend domain verification and DNS records as the owner reported them; automated e2e and axe results as of the last green CI run.

*End of report. No fixes have been implemented. Awaiting the owner's instructions.*
