# Domain launch runbook: Squarespace (registrar) → Cloudflare (DNS) → production Worker

Final architecture: domain registration/renewal stays at **Squarespace**; DNS moves to **Cloudflare Free**; the website and Pioneer database are the existing production Worker + D1; organizational email stays **Google Workspace**; verification email stays **Resend**. Nothing here changes any nameserver. Every step marked ◆ is yours.

## What can and cannot be done from the build session
The build session has **no Cloudflare credentials and no outbound DNS/Cloudflare access**; the only Cloudflare token lives in GitHub and is scoped to Workers + D1 (no zone or DNS permission). So adding the zone and copying records are dashboard steps (◆ below), and the verification runs on GitHub's runners (`dns-inventory.yml`). Nothing has been added to Cloudflare, Squarespace, Google or Resend by me.

## What is live today (read 2026-11-02 from Squarespace's own nameservers `nsc1-4.squarespacedns.com`, by `dns-inventory.yml`, run 41538468846)
| Name | Type | Value |
|---|---|---|
| `@` | MX | `1 smtp.google.com` (the only MX) |
| `@` | TXT | `v=spf1 include:_spf.google.com ~all` (the only SPF) |
| `@` | A | `185.199.108.153`, `.109.153`, `.110.153`, `.111.153` (GitHub Pages); no AAAA at the apex |
| `www` | CNAME | `lasallekey.github.io` |
| `google._domainkey` | TXT | `v=DKIM1; k=rsa; p=MIIBIjANBg…` (2048-bit; copy the full value from the panel/Cloudflare scan) |
| `_dmarc` | TXT | `v=DMARC1; p=none;` |
| `resend._domainkey` | TXT | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDUYH7…` |
| `send` | CNAME | `send.forge.rmta.net` |
| `rsend` | CNAME | `rsend.forge.rmta.net` |
| `_domainconnect` | CNAME | `_domainconnect.domains.squarespace.com` (Squarespace's own auto-setup helper; **not needed in Cloudflare**, safe to leave out) |
No CAA, no AAAA, no `mail`/`calendar`/`autodiscover` or other look-for names exist. **DNSSEC is ON** (a DS record is published at the registry), see step 5. Records that exist at names I did not ask about cannot be seen from outside: the Squarespace panel is the final word.

## Records that must exist in Cloudflare before nameservers move
Copy each value **exactly** from the Squarespace DNS panel (screenshot it first: that screenshot is also the rollback record). Do not retype from memory and do not accept a template.

| Record | Rule in Cloudflare |
|---|---|
| Google Workspace **MX**: the single `smtp.google.com` record (priority as shown in Squarespace) | Copy exactly. **Do not add** the five classic `ASPMX` records or any template MX. |
| SPF: the one `v=spf1 …` TXT at the root | Copy exactly; there must be exactly one SPF record. |
| Google DKIM: TXT at `google._domainkey` (or the selector shown in Squarespace) | Copy exactly (long value; make sure it is not truncated or quoted twice). |
| DMARC: TXT at `_dmarc` (currently `p=none`) | Copy exactly. |
| Resend DKIM: TXT at `resend._domainkey` | Copy exactly. |
| Resend `send` CNAME and `rsend` CNAME (and any `send` MX/TXT shown) | Copy exactly and set **DNS only (grey cloud)**. A proxied (orange) CNAME here breaks Resend. |
| GitHub Pages website: apex A (and AAAA if present) and `www` CNAME | Copy exactly and set **DNS only (grey cloud)** until cutover, so traffic still goes straight to GitHub Pages. |
| Any other TXT (site-verification), CAA, or custom record in the Squarespace panel | Copy exactly. If you are unsure what something is, leave it in and tell me; do not delete it. |

Cloudflare's automatic import is a convenience, not proof: it can miss records. The comparison below is the proof.

## Cloudflare settings: keep these off
- **Do not enable Email Routing** (it would add its own MX/SPF and take mail from Google). If Cloudflare offers it, skip.
- Plan: **Free**. Do not turn on paid add-ons. Leave proxying off for everything except the Worker's own domain after cutover.
- DNSSEC at Cloudflare: leave for later (adding it needs a DS record at Squarespace; optional after launch).

## Steps
1. ◆ **Cloudflare:** Add a domain → `influencersinvolved.org` → Free → let it scan. Review the imported records against the table above; fix mismatches; set the proxy status as stated. Cloudflare then shows **two assigned nameservers** (they are not secrets). Do **not** change anything at Squarespace yet.
2. ◆ **GitHub → Settings → Secrets and variables → Actions → Variables:** create `CLOUDFLARE_NAMESERVERS` with those two names, comma-separated.
3. ◆ **Run the checker:** Actions → *DNS inventory (read-only)* → Run workflow (or it runs when its branch is pushed). Its run summary has (a) the live inventory read from Squarespace's current authoritative nameservers, (b) DNSSEC and registrar facts, (c) the comparison with Cloudflare. It must say the new nameservers publish **exactly the same** watched records. Send me the summary (it contains only public DNS data). Anything marked DIFFERENT is fixed in Cloudflare before going on.
4. **I review** the summary and report records copied, missing or conflicting, and whether Google and Resend are protected.
5. ◆ **DNSSEC is ON, so do this first, and it is the slowest step:** at Squarespace turn DNSSEC **off** (remove the DS record). Resolvers cache the old DS record for up to about a day (the `.org` DS TTL is commonly 24 h), so **wait at least 24-48 hours** and re-run the inventory until it says DS record: none *before* step 6. Changing nameservers while the old DS record is still cached makes validating resolvers (for example Google's 8.8.8.8) refuse to resolve the domain: website and email would look down for those users. You can do steps 1-4 during the wait. Optional afterwards: enable DNSSEC in Cloudflare and add the DS record it shows at Squarespace.
6. ◆ **Switch nameservers at Squarespace (after you authorize it):** Squarespace → Domains → `influencersinvolved.org` → DNS settings → **Nameservers** → use custom nameservers → enter the two Cloudflare names. [Assumption: Squarespace's exact menu labels; if you do not see "Nameservers" or "custom", send me a screenshot and I will adjust the instructions.] Leave the registration, renewal, WHOIS privacy and any transfer lock as they are.
7. ◆ Wait for Cloudflare to show the zone **Active**. Then re-run the DNS inventory: it should now show Cloudflare as the authoritative nameservers and identical records. Send a test email to and from `grants@` and open the legacy website to confirm both still work.
8. **Cutover** (separate approval): the draft PR "Domain cutover configuration" sets the Worker's custom domains. See below.

## Cutover and rollback
Prerequisites: zone Active, step 7 passed, privacy page approved, baseline D1 export taken.
1. ◆ In Cloudflare DNS delete only the grey-cloud legacy **apex A/AAAA** and **`www` CNAME** (Cloudflare will not attach a custom domain over them). The legacy site goes dark now; do steps 1–3 together in a quiet hour. Do not touch MX, TXT, DKIM, `send`, `rsend`.
2. ◆ Merge the cutover PR, then run *Deploy production* with **cutover_complete** ticked and the confirmation phrase.
3. Verify the seven pages on `https://influencersinvolved.org`, form submit, verification email → "Confirm my email", Zeffy button, footer links; mail still flows.
4. Add the free Cloudflare redirect rule `www.influencersinvolved.org → https://influencersinvolved.org`.
**Rollback:** in Cloudflare, remove the two Worker custom domains and recreate the legacy GitHub Pages records exactly as in your Squarespace screenshot, **DNS only** (GitHub Pages standard: A `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`; AAAA `2606:50c0:8000::153`…`8003::153`; `www` CNAME `lasallekey.github.io`). The old site returns within the record TTL. To undo the nameserver move itself: Squarespace → nameservers → back to its own (the original records are still there). Mail and Resend records are never part of the rollback.
