# Proposed final Privacy page: policy decisions for owner approval

The proposed text is already in `src/pages/privacy.html` (built to `site/privacy/`, visible on staging). The pre-launch placeholder is gone. **This is a drafting proposal, not legal advice or legal sign-off.** Items marked ◆ are policy or legal decisions for the owner (and, if wanted, a lawyer). Nothing below is final until you approve it.

## What the page now says, and what the code does

| Page statement | Where it is true in the code | Status |
|---|---|---|
| Phase 1 open to adults 18+; form asks you to confirm | The required pledge checkbox now reads "I confirm that I am 18 or older and …" (`src/pages/challenge.html`). Age is not stored separately: no extra data is collected. | ◆ policy |
| What we collect: name, email, country, charity or "not yet", pledge date, accounts (link optional), display choices, optional consents, verification status, consent date/version; no income, payment details or proof of giving | `worker/src/validate.js`, `worker/migrations/*` | verified |
| Network address kept only as a keyed hash + request count, deleted automatically, at most about a day | `rate_limits`, `runCleanup` ([RETENTION.md](RETENTION.md)) | verified (tests) |
| No advertising cookies; analytics cookies only after the visitor accepts; page addresses without `?`/`#`; no registration data sent; 2-month retention; GPC honoured; withdraw via "Cookie preferences" | `src/static/analytics.js`, tests, [ANALYTICS.md](ANALYTICS.md) | verified in code and tests; ◆ retention setting and Google terms are in the owner's GA property |
| Public listing only for verified + publicly opted-in + approved profiles; anonymous never identified; email never shown | `publicPioneers` and its tests | verified (tests) |
| Optional emails separate, unchecked, revocable; unsubscribe link in each optional email | form + `unsubscribe` | verified |
| We do not sell or rent personal information | no such flow exists | ◆ commitment |
| Providers: Cloudflare (hosting, D1 encrypted at rest/TLS, network logs), Resend (email delivery), Zeffy (donations, own policy, not linked to registration), Google Workspace (mail to the contact address) | `wrangler.toml`, `src/email.js`, Zeffy link | verified; ◆ confirm each provider's terms/DPA if you need them |
| Verification links: single-use, 24 h, hashed record deleted 7 days after use/expiry | `verifyConfirm`, `runCleanup` | verified (tests) |
| Registrations kept while participating, subject to law, until removal requested | no automatic expiry on `pioneers` | ◆ policy |
| Verified deletion requests normally done within 30 days; legal exceptions | `scripts/erase-pioneer.mjs` (rehearsed in staging CI) | ◆ commitment |
| Deleted data may remain in provider recovery history up to 30 days | D1 Time Travel [Assumption: 7 days Free / 30 Paid] | ◆ verify your plan's window |
| Rights (see/correct/withdraw/delete) offered to everyone, wherever they live; may have extra local rights; may contact local authority | manual process via the contact address | ◆ policy and legal applicability |
| Data handled in the U.S. and where providers operate | Cloudflare global network, Resend (U.S.) | ◆ legal wording for cross-border transfer |

## Retention periods chosen, and why
- **Abuse-prevention counters: deleted within about a day.** The limiter only needs the current one-hour window; the daily sweep is the simplest dependable schedule. The address is stored only as a keyed hash.
- **Verification-link records: deleted 7 days after use or expiry.** Links live 24 h; the extra days let support explain "used/expired" messages and keep the resend throttle history, then the record disappears. The registry keeps only "verified" and the date.
- **Registrations: kept while participating.** The registry is the program; automatic expiry would silently remove people who pledged. ◆ If you prefer a long-stop (for example removing never-verified records after N years), say so and it can be added.
- **Deletion: 30 days.** Matches common practice (and is no longer than the strictest regime's one-month norm), while leaving time to verify the requester.
- **Recovery history: up to 30 days.** The provider's built-in point-in-time recovery, described honestly so "deleted" is not overstated.

## Decisions for the owner
1. ◆ **Adults 18+ only** for Phase 1; keep the checkbox wording as above?
2. ◆ **Retention** table above (24 h/7 days/while participating) and **30-day deletion promise**.
3. ◆ **"We do not sell or rent personal information"**: keep as a stated commitment?
4. ◆ **Rights for everyone** (access, correction, deletion, withdrawal regardless of residence) instead of limiting to a specific law.
5. ◆ **Applicable-law review:** whether GDPR/UK GDPR, CCPA/CPRA, Illinois law (the organization's state) or others apply to you, and whether a controller/representative statement, lawful-basis wording or standard contractual clauses are needed. I have not made legal conclusions.
6. ◆ **Named processors:** Cloudflare, Resend, Zeffy, Google Workspace. Add any you do not want named, or any I have missed.
7. ◆ **Who handles requests:** the page names only the shared contact mailbox. Decide who monitors it and how identity is checked (current process: reply from the registered address or quote the Pioneer ID).
8. ◆ **Effective date:** the page says "Last updated: November 2026"; set the real date at launch.

## Added with Google Analytics (decisions for the owner)
9. ◆ **Consent model:** opt-in for everyone (not only EU/UK visitors), equal Accept/Reject, a footer "Cookie preferences" control, and Global Privacy Control always treated as Reject (it overrides an earlier Accept; stored choice kept for when the signal is off). Simple and defensible; say so if you want a different regional approach.
10. ◆ **Retention:** the page says user-level and event-level Google Analytics data is deleted after 2 months and that aggregated reports may remain longer. Set the same value in the GA property (see `docs/ANALYTICS.md`) or change the page.
11. ◆ **Cookie lifetime and names** stated on the page (`_ga`, `_ga_K34TWL28XS`, up to two years) follow Google's defaults; adjust if you change them in GA.
12. ◆ **Google as a processor / data-processing terms:** accept Google's data processing terms in the GA property if you have not, and confirm whether you want to mention cross-border transfer more formally.
13. ◆ **Legal review:** applicability of ePrivacy/GDPR/CCPA to analytics cookies. No legal sign-off is claimed.

## Not decided here (explicitly left out)
Data-protection officer, cookie banner (none needed while no non-essential cookies exist), children's-privacy statutes for under-18 participants (excluded by the 18+ rule), breach-notification procedure, and any lawyer-reviewed sections.
