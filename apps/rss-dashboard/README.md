# RSS Orbit

A local-first RSS dashboard inside PT Universe. It provides Feedly-style inbox, today, unread and read-later views without an account.

## Data model

- Default feeds are configured in `config/feeds.json`.
- `scripts/fetch_feeds.py` fetches and normalizes the feeds into `data/feed.json`.
- Cloudflare Cron refreshes all default feeds hourly at 08:00–23:00 and 00:00 Pacific Time, with automatic PST/PDT handling, and stores raw feeds in Workers KV.
- The dashboard reads the KV-backed allowlisted Worker in `workers/rss-orbit-proxy` on startup. The bundled `data/feed.json` is only an emergency seed; GitHub Actions no longer fetch RSS data.
- The toolbar refresh button bypasses KV for a complete live refresh at any time, including during the overnight scheduled-rest window.
- Read state, saved articles, hidden sources, theme and browser-added feeds are stored in `localStorage`.
- The desktop quick-reader width is adjustable and stored locally as a workspace ratio.
- OPML import/export supports migration from Feedly and other readers.

## Run the fetcher

```bash
python -m pip install -r requirements.txt
python scripts/fetch_feeds.py
```

The UI is static and can be opened from the PT Universe deployment at `/apps/rss-dashboard/`.
