# PT Universe Cloudflare API

Cloudflare Worker for Tsugi/Daily Nexus data, scheduled/manual refresh, and encrypted cross-device sync. D1 stores metadata and ciphertext; KV stores small last-good JSON snapshots. Browser Rendering is used only for sources that require a browser.

Tsugi games are scraped by the independent `refresh-tsugi-games.yml` GitHub Action at 08:00 America/Los_Angeles. The Worker imports and caches that snapshot; it does not use Browser Rendering or the paused QF pipeline for games.

```sh
npm install
npm run types
npx wrangler d1 execute pt-universe-db --remote --file=schema.sql
npm run deploy
```

The client encrypts local data before upload. Pairing codes are never logged intentionally and the server stores only a SHA-256 token hash.

## PC comparison and Earnings Dojo
GET /api/pc/search?q=... searches Steam and CheapShark. GET /api/pc/prices?steamId=...&cheapId=... compares a selected title. US/USD, fixed upstreams, numeric IDs, bounded query length and 18-second upstream timeouts. Shared search/price cache: 120 seconds; the original checkedAt is returned. These are public read-only APIs, not generic URL proxies.
GET /api/training/financials?symbol=NVDA verifies one allowlisted company's quarterly Yahoo timeseries on every request, with no Worker snapshot cache. Missing values remain null, capex signs are normalized, and a value fingerprint accompanies the verification timestamp. No LLM/API keys or Browser Rendering are used by these routes.
