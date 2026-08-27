# RSS Orbit

A local-first RSS dashboard inside PT Universe. It provides Feedly-style inbox, today, unread and read-later views without an account.

## Data model

- Default feeds are configured in `config/feeds.json`.
- `scripts/fetch_feeds.py` fetches and normalizes the feeds into `data/feed.json`.
- `.github/workflows/refresh-rss.yml` refreshes the cache every four hours from 08:00 Pacific Time and redeploys GitHub Pages.
- The toolbar refresh button uses the optional allowlisted Cloudflare Worker in `workers/rss-orbit-proxy` for complete live refreshes. Without it, the browser still attempts direct access and falls back to the repository cache.
- Read state, saved articles, hidden sources, theme and browser-added feeds are stored in `localStorage`.
- The desktop quick-reader width is adjustable and stored locally as a workspace ratio.
- OPML import/export supports migration from Feedly and other readers.

## Run the fetcher

```bash
python -m pip install -r requirements.txt
python scripts/fetch_feeds.py
```

The UI is static and can be opened from the PT Universe deployment at `/apps/rss-dashboard/`.
