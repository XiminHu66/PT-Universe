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
