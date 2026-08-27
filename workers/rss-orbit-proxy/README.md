# RSS Orbit Proxy

Cloudflare Worker for RSS Orbit's manual refresh. It is deliberately not an open URL proxy: only the 12 curated feed IDs in `src/index.js` are accepted.

## Cloudflare dashboard deployment

1. Open **Workers & Pages → Create application → Import a repository**.
2. Select `XiminHu66/PT-Universe` and production branch `main`.
3. Set **Root directory** to `workers/rss-orbit-proxy`.
4. Leave **Build command** empty.
5. Keep **Deploy command** as `npx wrangler deploy`.
6. Deploy and copy the resulting `https://<name>.<subdomain>.workers.dev` URL.

The Worker exposes:

- `GET /health` — deployment and allowlist health check.
- `GET /feed/:id` — cached allowlisted RSS response.
- `GET /feed/:id?refresh=1` — bypass the Worker cache and update it from the origin.

The production browser origin is restricted to `https://ximinhu66.github.io`. Requests without an `Origin` header remain available for direct health checks and command-line diagnostics.

## Local checks

```bash
npm test
npx wrangler deploy --dry-run
```
