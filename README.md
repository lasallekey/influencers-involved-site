# Influencers Involved — website rebuild

Static seven-page site plus a small Cloudflare Worker + D1 registry for the 1% Influence Challenge Pioneer pledge.

```bash
npm run build   # src/ → site/
npm test        # API + site checks (Node ≥ 22.13, no install needed)
npm run dev     # local preview at http://127.0.0.1:8787 with synthetic data
```
See [`docs/OPERATIONS.md`](docs/OPERATIONS.md) for deployment, data access, email setup and rollback, [`CLAUDE.md`](CLAUDE.md) for project rules and [`BUILD_STATUS.md`](BUILD_STATUS.md) for current status. Files at the repository root other than these are the legacy site and are untouched.
