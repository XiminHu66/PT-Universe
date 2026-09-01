# RSS Orbit

A local-first RSS dashboard inside PT Universe. It provides Feedly-style inbox, today, unread and read-later views without an account.

## Data model

- Default feeds are configured in `config/feeds.json`.
- `scripts/fetch_feeds.py` fetches and normalizes the feeds into `data/feed.json`.
- Cloudflare Cron refreshes all default feeds hourly at 08:00–23:00 and 00:00 Pacific Time, with automatic PST/PDT handling. Each refresh merges new entries into Workers KV and retains up to 100 entries per source.
- The dashboard reads the KV-backed allowlisted Worker in `workers/rss-orbit-proxy` on startup. The bundled `data/feed.json` is only an emergency seed; GitHub Actions no longer fetch RSS data.
- The toolbar refresh button performs a complete live refresh at any time, merges the result into the same 100-entry history, and persists it for later visits.
- Read state, saved articles, hidden sources, theme and browser-added feeds are stored in `localStorage`.
- Interface font scale (90%–140%) and desktop quick-reader width (up to 72% on wide screens) are adjustable and stored locally.
- OPML import/export supports migration from Feedly and other readers.

## Run the fetcher

```bash
python -m pip install -r requirements.txt
python scripts/fetch_feeds.py
```

The UI is static and can be opened from the PT Universe deployment at `/apps/rss-dashboard/`.
