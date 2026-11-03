# Google Analytics 4 (consent-gated)

Measurement ID `G-K34TWL28XS` (`src/config.json` → `analytics.measurementId`). Implementation: `src/static/analytics.js`, banner and footer control in `src/layout.html`, styles at the end of `src/static/site.css`, hooks in `src/static/site.js`.

## How consent works
- A new visitor sees a banner with **Reject analytics** and **Accept analytics**, identical in size, colour and weight. Until a choice is made, nothing is requested from Google, no `gtag`/`dataLayer` exists and no `_ga` cookie is set.
- The footer button **Cookie preferences** (every page) reopens the choice. Choosing Reject after Accept sets `ga-disable-G-K34TWL28XS`, sends a consent "denied" update, and deletes `_ga`, `_ga_*`, `_gid`, `_gat*`, `_gcl*` cookies (host and parent domain).
- The choice is stored in the browser's `localStorage` key `ii_consent` (`granted`/`denied`); it is never sent anywhere. A browser Global Privacy Control signal is treated as Reject (no banner, nothing loads) until the visitor chooses otherwise.
- Google's script loads only from `analytics.js` after Accept. No page HTML references Google (the build check fails if one does). The CSP allows only `www.googletagmanager.com` (script) and Google Analytics collection hosts (connect/img).

## What is sent
`send_page_view` is off; `analytics.js` sends the page view itself with `page_location` rebuilt as origin + path (no query string, no `#fragment`) and a sanitized `page_referrer`. Google signals, ad personalization and ad storage are off. Events (allow-listed by name and by parameter value; anything else is dropped before it reaches `gtag`):

| Event | When | Parameters |
|---|---|---|
| `pioneer_form_start` | first focus inside the registration form (not a conversion) | none |
| `pioneer_registered` | the Worker confirmed a saved registration (201; a replayed retry is not counted twice) | `account_count` 1-10, `charity_status` `selected`/`undecided` |
| `pioneer_email_verified` | the person pressed "Confirm my email" and the Worker answered `ok` | none |
| `certificate_download` | clicked the certificate download | none |
| `donate_click` | click on a Zeffy donation link | none |

Never sent: names, emails, handles, charity names, Pioneer IDs, certificate data, verification tokens, query strings, fragments. Defence in depth for tokens: `site.js` removes `#verify=…` from the address bar at load, `analytics.js` builds URLs from the path only, and the e2e suite fails if a token or personal value appears anywhere in the data layer or in any request.

## Staging and the pre-launch build
Staging (`STAGING=1`) and the pre-launch dark-launch build (`PRELAUNCH=1`) run the entire consent flow in **dry-run** mode: Google is never contacted, calls are recorded in `window.__iiGa` (open the browser console and type `__iiGa` after accepting to inspect exactly what would be sent). Only the normal production build sends data (`ANALYTICS=live` forces live collection for a deliberate test).

## Owner actions in the Google Analytics property (cannot be done from the code)
1. **Data retention:** Admin → Data collection and modification → Data retention → *2 months* (the page promises 2 months; GA4's default is 2 months, confirm it).
2. **Google signals:** keep **off** (Data collection → Google signals). Do not link Google Ads.
3. **Enhanced measurement:** turn **off** "Form interactions" and "Site search" (they are not needed and can read form/URL details); page views are sent by us, so also turn off "Page changes based on browser history events" to avoid duplicate/unsanitized views.
4. **Key events:** mark `pioneer_registered` and `pioneer_email_verified` as key events (conversions). `pioneer_email_verified` is the "verified registration" figure; it fires in whichever browser the person confirms in, and verification is optional, so it will be lower than `pioneer_registered`.
5. **Internal traffic / IP:** nothing to configure (GA4 does not store IP addresses); optionally filter your own visits.
6. **Check after launch:** Admin → DebugView or Reports → Realtime with the banner accepted.

## Tests
`scripts/test/analytics.test.js` (fake browser: no load before consent, reject, accept, URL sanitising, allow-list, withdrawal, GPC, dry-run), `scripts/check-site.mjs` (every page has the banner and footer control, none references Google), `scripts/e2e.mjs` section 9 (real browser with Google endpoints intercepted: banner, equal buttons, nothing sent before consent, all seven pages, withdraw, registration + verification flows with a full leak scan).
