# Send verification emails from verification@influencersinvolved.org

Goal: authenticate **influencersinvolved.org** in Resend (free plan) and switch the sender from Resend's test address to `verification@influencersinvolved.org`. The website code needs no change: the sender is a single setting.

**Nothing in this guide changes Google Workspace mail or the website.** Resend's records live on a separate host name (`send`) plus one DKIM key; none of them touch the root `@` MX records that deliver your Google mail. I will never edit DNS; you add the records yourself, and only after you approve the list (step 3).

## 0. Two things to know first
1. **Who hosts your DNS?** Records are added where the domain's *nameservers* point, which is often the registrar (GoDaddy, Namecheap, Squarespace/Google Domains…) or Cloudflare. If you're not sure: in your registrar, open DNS settings for influencersinvolved.org; or ask me to read it from the staging log (the "Mail DNS status" step prints it).
2. **Receiving mail stays with Google.** `verification@influencersinvolved.org` already exists as a Google Workspace alias, so replies and bounces to that address reach your inbox as usual. Resend only *sends*.

## 1. Add the domain in Resend
Resend → **Domains → Add Domain** → enter `influencersinvolved.org` → pick the region closest to your readers (US East is fine) → **Add**.
Resend now shows a table of DNS records **unique to your account**. Leave that tab open.

## 2. The records you should expect
Resend has two forms of the same setup, and the dashboard is authoritative. Your account uses the **CNAME form** (confirmed in Resend: a DKIM TXT, an `rsend` CNAME and a `send` CNAME, all Verified). Older accounts get the **classic MX + TXT form**. A CNAME at `send` means there is deliberately **no MX or TXT at that same name**; the read-only checker understands both.

**CNAME form (your domain):**

| Type | Host | Value |
|------|------|-------|
| TXT | `resend._domainkey` | `p=MIGf…` (long public key, copy exactly) |
| CNAME | `rsend` | the target Resend shows |
| CNAME | `send` | the target Resend shows |
| TXT *(optional)* | `_dmarc` | `v=DMARC1; p=none;` only if no DMARC record exists |

**Classic form (for reference):**

| # | Type | Host / Name | Value | Notes |
|---|------|-------------|-------|-------|
| 1 | **TXT** | `resend._domainkey` | `p=MIGf…` (a long public key, copy exactly) | DKIM. Proves mail really comes from your domain. |
| 2 | **MX** | `send` | `feedback-smtp.<region>.amazonses.com`, **priority 10** | Return-path/bounces for Resend's sending. **Host is `send`, not the root.** |
| 3 | **TXT** | `send` | `v=spf1 include:amazonses.com ~all` | SPF for the `send` host only. |
| 4 | TXT *(optional)* | `_dmarc` | `v=DMARC1; p=none;` | **Only if you do not already have a `_dmarc` record.** |

Entry tips: most DNS hosts want just `send` / `resend._domainkey` as the host (they append the domain). If yours wants the full name, use `send.influencersinvolved.org`. Leave TTL on Auto/default. Paste values without extra spaces or quotes (unless your host insists on quotes for TXT).

### Why these are safe next to Google Workspace
| Existing record | Where | Touched? |
|---|---|---|
| Google mail **MX** (`aspmx.l.google.com` …) | root `@` | **No.** Resend's MX is on `send`, a different name. |
| Google **SPF** TXT (`v=spf1 include:_spf.google.com …`) | root `@` | **No.** Resend's SPF is a separate record on `send`. A domain may only have *one* SPF record per name, which is why we do not add Resend to the root one. |
| Google **DKIM** (`google._domainkey`) | | **No.** Resend's key is `resend._domainkey`. |
| **DMARC** (`_dmarc`) | | Add record 4 **only if none exists**. If one exists, leave it. Two DMARC records break DMARC. |
| Website records (A / CNAME / `www`) and anything for the live site | | **No.** Not part of this. |

### Do NOT do these
- Do not add any MX record on the root `@` (Resend's optional *Receiving* feature asks for one; leave Receiving **off**; it would take your Google mail away).
- Do not edit or delete existing Google MX, SPF or DKIM records.
- Do not add a second SPF record at the root, or a second `_dmarc`.
- Do not change website DNS (A/CNAME/www) or nameservers.

## 3. Approval checkpoint (before anything is added)
Send me the table Resend shows (host names and record types are fine; the DKIM value is a *public* key, but you can paste just its first 20 characters) and tell me which DNS provider you use. I will check that:
- the hosts are `resend._domainkey` and `send` (not the root),
- there is no MX at the root and no duplicate SPF/DMARC with what's already published (the staging log shows the current state),
and reply **"safe to add"** with exact entries for your DNS provider. You then add them. If you prefer, add them yourself and tell me when done.

## 4. After you add the records
1. In Resend, open the domain → **Verify DNS Records**. It can take a few minutes to a few hours; Resend shows each record turning green and the domain **Verified**.
2. Re-run the staging workflow (Actions → Deploy staging → Re-run all jobs). Its summary prints **"Mail DNS status"**: the Resend DKIM and return-path (and `rsend`) lines should read OK and Google's must still read OK. The checker accepts either the CNAME form or the classic MX + SPF form.

## 5. Switch the sender
GitHub → repo **Settings → Secrets and variables → Actions → Variables** (not Secrets) → **New repository variable**
- Name: `STAGING_EMAIL_FROM`
- Value: `Influencers Involved <verification@influencersinvolved.org>`

Re-run **Deploy staging**. The summary should say it is sending as `verification@influencersinvolved.org`. (To undo: delete the variable and re-run; it falls back to `onboarding@resend.dev`.)

## 6. Test
Register on staging with **any** email address, for example a `yourname+test1@gmail.com` alias (it still arrives in your inbox and is never counted in the public registry). In the received message open *Show original* (Gmail) and confirm **SPF: PASS, DKIM: PASS, DMARC: PASS**. Also try an Outlook/Yahoo address and a spam-folder check. If the message doesn't arrive, the staging log now records the provider's reason (addresses redacted), e.g. "domain is not verified".

## 7. Before production (not now)
- Name the email provider (Resend) and state retention on the Privacy page; the text currently says "a transactional email provider that II configures for its own domain".
- Set the production sender the same way (a separate decision when we plan the launch; it is not part of this step).
- Consider tightening DMARC from `p=none` to `quarantine` only after a few weeks of clean reports.
- Resend free plan limits: 100 emails/day, 3,000/month, one domain. Paid plans only with your approval.
