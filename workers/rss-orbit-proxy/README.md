# RSS Orbit Proxy

Cloudflare Worker, Cron scheduler, and KV backend for RSS Orbit. It is deliberately not an open URL proxy: only the 12 curated feed IDs in `src/index.js` are accepted.

## Cloudflare dashboard deployment

1. Open **Workers & Pages → Create application → Import a repository**.
2. Select `XiminHu66/PT-Universe` and production branch `main`.
3. Set **Root directory** to `workers/rss-orbit-proxy`.
4. Leave **Build command** empty.
5. Keep **Deploy command** as `npx wrangler deploy`.
6. Deploy. Wrangler automatically provisions the `RSS_CACHE` KV namespace and registers the hourly Cron trigger.
7. Copy the resulting `https://<name>.<subdomain>.workers.dev` URL.

The Cron runs every UTC hour, then checks `America/Los_Angeles` locally. It fetches at 08:00–23:00 and once at 00:00 Pacific, and skips 01:00–07:59. This keeps the schedule stable across PST and PDT.

The Worker exposes:

- `GET /health` — deployment, schedule, and last-Cron health check.
- `GET /feed/:id` — KV-backed allowlisted RSS response. A first cache miss bootstraps that feed from the origin.
- `GET /feed/:id?refresh=1` — bypass KV and read the origin immediately. Failed origins fall back to stale KV; manual reads do not consume KV writes.

The production browser origin is restricted to `https://ximinhu66.github.io`. Requests without an `Origin` header remain available for direct health checks and command-line diagnostics.

## Local checks

```bash
npm test
npx wrangler deploy --dry-run
```
