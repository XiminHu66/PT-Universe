# RSS Orbit Proxy

Cloudflare Worker, Cron scheduler, and KV backend for RSS Orbit. The 12 curated feeds are cached in KV. Browser-added feeds use a separate validated, size-limited RSS endpoint and are never persisted by the Worker.

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
- `GET /custom?url=<rss-url>` — fetch a browser-added public RSS/Atom URL through Cloudflare. It requires the approved GitHub Pages origin, rejects private/local destinations and unsafe redirects, validates the response as a feed, and does not write KV.
  - The retired `zhihu.com/rss` endpoint is transparently converted from Zhihu Daily's public data.
  - The blocked `36kr.com/feed` endpoint is transparently converted from 36Kr's current 24-hour hot-list data.

The production browser origin is restricted to `https://ximinhu66.github.io`. Requests without an `Origin` header remain available for direct health checks and command-line diagnostics.

## Local checks

```bash
npm test
npx wrangler deploy --dry-run
```
