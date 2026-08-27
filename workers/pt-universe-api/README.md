# PT Universe Cloudflare API

Cloudflare Worker for Tsugi/Daily Nexus data, scheduled/manual refresh, and encrypted cross-device sync. D1 stores metadata and ciphertext; KV stores small last-good JSON snapshots. Browser Rendering is used only for sources that require a browser.

```sh
npm install
npm run types
npx wrangler d1 execute pt-universe-db --remote --file=schema.sql
npm run deploy
```

The client encrypts local data before upload. Pairing codes are never logged intentionally and the server stores only a SHA-256 token hash.
