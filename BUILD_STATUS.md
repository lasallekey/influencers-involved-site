# BUILD_STATUS

Branch: `claude/happy-brown-0ytqwr` (rebuild; `main` untouched). Legacy root files (`index.html`, `pioneer.*`, Apps Script) are reference only and unchanged.

## Done
- Static 7-page site (`src/` → `site/` via `npm run build`), approved logos processed into `site/assets/`.
- Worker API + fresh D1 schema (`worker/`): register (atomic, idempotent), email verification (hashed single-use tokens), resend throttle, optional-email unsubscribe, filtered public listing, k-anonymous aggregate stats.
- Pledge form, certificate (canvas), registry display wired to the API.

## Tested
- `npm test`: Worker/API tests against real SQLite (see `worker/test/`).

## Blocked / needs owner
- Cloudflare account access (D1 create, Worker deploy, secrets) — not available to this session.
- Email sender: provider choice + SPF/DKIM/DMARC verification for influencersinvolved.org.
- YouTube / TikTok URLs (hidden until supplied). Zeffy destination must be checked live before launch.

## Next
- Browser e2e + desktop/mobile screenshots, link checks, docs (`docs/OPERATIONS.md`), pull request.
