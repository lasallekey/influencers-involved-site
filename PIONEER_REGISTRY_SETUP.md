# Pioneer Registry deployment

The live website is hosted on GitHub Pages. Because GitHub Pages is static, pledge retention requires a small server-side endpoint. This project uses a private Google Sheet plus a Google Apps Script web app.

## Registry spreadsheet

Private Google Sheet:

`https://docs.google.com/spreadsheets/d/1F6iRlQ4a02JZiAR_hXqjD2E3zFp1UCcDPojcS-53FDo/edit`

The workbook contains:

- **Pioneers Private** — private contact, consent, pledge, verification, and proof records.
- **Public Progress** — aggregate counts and consented public profiles only.
- **Settings** — registry rules and deployment configuration.

Do not publish or share the private sheet publicly.

## Deploy the Apps Script backend

1. Open the private registry spreadsheet.
2. Choose **Extensions → Apps Script**.
3. Delete the starter code in `Code.gs`.
4. Copy the complete contents of `PIONEER_REGISTRY_APPS_SCRIPT.gs` from this repository into `Code.gs`.
5. Save the Apps Script project as **II Pioneer Registry Backend**.
6. Select **Deploy → New deployment**.
7. Choose **Web app**.
8. Set **Execute as** to **Me**.
9. Set **Who has access** to **Anyone**.
10. Click **Deploy** and authorize the requested Spreadsheet and Mail permissions.
11. Copy the deployment URL ending in `/exec`.
12. Paste that URL into `Settings!B9` in the registry spreadsheet.
13. Provide the `/exec` URL so the website form and public progress dashboard can be connected.

Google may ask for authorization because the script writes to the private registry and sends a one-time email-verification message to each pioneer.

## Data collected

Required registry fields:

- Pioneer pledge ID and timestamp
- Public creator or channel name
- Social handle and profile URL
- Primary platform
- Email address, kept private
- 1% pledge and selected cause or charity
- Public-display preference
- Public-listing consent
- Next-phase contact consent
- Country or region and audience-size band when supplied
- Email-verification and proof status

## Public/private boundary

Never expose through the public website or public API:

- Email addresses
- Verification tokens
- Proof-document references
- Admin notes
- Nonconsented names, handles, or profile URLs
- Withdrawn records

The public dashboard may show:

- Total Pioneer Pledges
- Email-confirmed pioneers
- Verified charitable actions
- Platforms and countries represented
- Aggregate audience bands
- Profiles only when the pioneer expressly selected public listing

## Withdrawal and contact rules

- A pioneer can request withdrawal or correction through the organization’s published contact channel.
- Mark withdrawn records as `Withdrawn`; exclude them from public reporting and future outreach.
- Contact pioneers about the next phase only when `Next-Phase Contact Consent` is `Yes`.
- Include an unsubscribe or preference-change method in every campaign message.

## Website connection after deployment

After the `/exec` URL is available, update `index.html` to:

1. Require an email address and social profile URL.
2. Present separate choices for public display, public listing, and future contact.
3. Submit the pledge to the Apps Script endpoint before showing the certificate.
4. Tell the pioneer to verify their email.
5. Load aggregate progress through the endpoint’s JSONP stats response:

`DEPLOYMENT_URL?action=stats&callback=renderPioneerStats`

6. Display consented public Pioneer profiles and aggregate movement progress.
