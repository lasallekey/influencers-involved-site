# Influencers Involved — rebuild status
Updated: 2026-10-30

## Completed in this branch
- Fresh seven-route static website structure with approved copy and all three actual logo files.
- Clean responsive editorial styling, accessible menu, Zeffy donation CTA, Facebook/Instagram/LinkedIn links, no PayPal button.
- Pioneer form UI, independent consent controls, multiple social accounts, anonymous choice and certificate display after confirmed backend save.
- Separate new Cloudflare Worker + D1 schema and API source scaffold. No legacy data imported or accessed. No services deployed.
- Static and validation smoke tests authored for Node 20+.
- Sanitized Claude developer instructions and deployment handoff.

## Validation status
- Static construction checks completed for six standalone page HTML resources and the Challenge form.
- Approved logo PNG raw blobs copied from shared Drive; SHA-backed in Git repository.
- GitHub Actions smoke tests now PASS: 8/8 (run 41130950792). These cover static page structure and pure input validation, not deployed D1 or email.
- No real D1 transaction, email delivery, live accessibility or screenshot QA executed.
- This is a code-review milestone, not a live website or functioning registry.

## Outstanding (required before public launch)
1. Smoke checks pass in GitHub Actions; still inspect desktop/mobile visuals and correct meaningful issues.
2. Configure a brand-new Cloudflare D1 database and staging Worker, after owner authorizes access. Do not connect old Apps Script.
3. Test registration, duplicate/idempotency, permission handling, anonymous counts, verification, consent, rate limiting with synthetic records.
4. Confirm verified organizational sending domain, actual emails and unsubscribe/withdrawal processes; add anti-abuse controls as needed.
5. Finalize privacy service provider/retention disclosures, add production-ready operational backup/export process.
6. Add YouTube and TikTok URLs when supplied. Test Zeffy final checkout.
7. Obtain owner approval before production DNS change, `main` merge or cutover.

## Next action
Review main pages at 375px and desktop widths, verify frontend/backend staging integration with a fresh D1 and sender, then prepare pull request review. Keep this status file concise, updating only at meaningful milestones.
