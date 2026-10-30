# Staging: get a live test site in about 15 minutes

Staging is a separate copy of the site on Cloudflare's **free** tier, with its **own empty database**. It never touches the live website, production DNS, or the old Pioneer registry. Every page carries a "Staging preview: test data only" strip and tells search engines to ignore it.

You do four things once. Credentials go into GitHub's secret store, never into chat or the code, and GitHub's servers do the deploying.

## 1. Cloudflare account (free)
1. Sign in to https://dash.cloudflare.com with the organization's Cloudflare account.
2. Open **Workers & Pages** once. If it asks you to pick a `workers.dev` subdomain, choose one (for example `influencersinvolved`). It is free and only names your test URL.
3. Copy your **Account ID** (shown on the Workers & Pages overview, right-hand side).

## 2. Create a limited API token
**My Profile → API Tokens → Create Token → Create Custom Token**
- Permissions: **Account · Workers Scripts · Edit**, **Account · D1 · Edit**, **Account · Account Settings · Read**
- Account Resources: *Include → your account only*
- Optional but wise: set an expiry (for example 30 days).
Copy the token once; Cloudflare will not show it again.

## 3. Give GitHub the two values
GitHub repository → **Settings → Secrets and variables → Actions → New repository secret**
- `CLOUDFLARE_API_TOKEN` = the token
- `CLOUDFLARE_ACCOUNT_ID` = the Account ID

If you can't see Settings, the repository owner (`lasallekey`) needs to add them.

## 4. Deploy
The "Deploy staging" workflow runs by itself on every push to the PR branch (staging only). After adding the secrets, open the **Actions** tab, pick the latest **Deploy staging** run, and click **Re-run all jobs** (or just ask me to push a small update).
After about three minutes the run summary shows your staging URL (`https://ii-pioneer-registry-staging.<subdomain>.workers.dev`). The workflow creates the database, applies the schema, deploys, and runs an automatic smoke test. Until the secrets exist, the run simply skips itself with a notice.

## 5. Email (optional now, free)
Without email, everything works except the verification message: pledges save and certificates download normally.
1. Create a free account at https://resend.com (free tier: 100 emails/day). **Sign up with the email address you will test with.**
2. **API Keys → Create API key** (sending access).
3. GitHub → add repository secret `STAGING_EMAIL_API_KEY` = that key, then **re-run "Deploy staging"**.
Until a domain is verified, Resend's shared test sender (`onboarding@resend.dev`) delivers only to the address you signed up with, which is exactly what you need for testing: register on staging using that same address and you will receive the verification email.

**Before launch (not now, needs your approval):** verify `influencersinvolved.org` in Resend by adding its SPF/DKIM DNS records plus a DMARC record, confirm that `grants@influencersinvolved.org` receives mail, then set the GitHub *variable* `STAGING_EMAIL_FROM` (and later the production setting) to `Influencers Involved <grants@influencersinvolved.org>`. That is a DNS change, so I will ask first.

## What to test (you, on your phone and laptop)
1. Home, then each menu page: copy reads well, no horizontal scrolling on the phone, Menu button works.
2. **Become a Pioneer** → submit with two social accounts → you see a Pioneer ID → **download the certificate**.
3. Check your inbox (needs step 5) → click the verification link → you return to the Challenge page with a confirmation. Click it again: it must say the link is not valid.
4. Register again with the same email: you should be told it already joined.
5. Register once as **public** and once **anonymous**, verify the public one, wait up to 5 minutes, and confirm only the public, approved profile appears under "Pioneers so far" (anonymous people only add to the totals).
6. On **Donate**: the Zeffy button opens the Zeffy form; the international notice shows; there is no PayPal button.
7. Footer: Facebook, Instagram and LinkedIn open the right pages.

## Costs and limits
Nothing here costs money. Cloudflare Workers free plan (100,000 requests/day), D1 free plan (5 GB, 5M reads/day), GitHub Actions free minutes, Resend free tier. I will ask before anything with a price. Staging test records live only in the staging database; delete them or the whole staging Worker and database in the Cloudflare dashboard whenever you like.

## Safety
The token can only edit Workers and D1 in your account. Delete or let it expire after testing. Nothing about staging changes DNS, `main`, the live site, or the legacy registry.
