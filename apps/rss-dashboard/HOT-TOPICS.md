# 今日热点

The former sidebar Read Later entry opens an independent `hot-topics.js` view. Existing saved articles, article saving buttons, and the Saved quick filter remain available through the unchanged reader. The addon never writes read/saved/subscription/category keys.

`hot-topics.css` is scoped to its own view and settings panel. `app.js`, `styles.css`, and the original RSS Worker `src/index.js` are unchanged. The HTML only loads the addon and replaces the sidebar label while retaining the reader's required saved-count node.

The new settings tab controls hotspot visibility in `pt.rss.hotTopics.*` local storage. It does not enable/disable the original RSS subscriptions. Browser-added sources and their fetched articles are read from the existing reader's public functions; no browser credentials or custom subscriptions are sent to the VPS.

The VPS combines the curated Orbit feed registry with existing TrendRadar RSS and platform sources. Overlapping RSS sources read Orbit's existing KV-backed `/feed/:id` cache, avoiding another fetch of the origin. TrendRadar retains its hourly collector; no new service, collector timer, or scheduled GitHub Action is added.

The Worker uses an additive entry wrapper. `/hot-topics` and `/hot-topics/sources` accept only GET/HEAD/OPTIONS and return bounded public news fields. Existing `/health`, `/feed/:id`, `/custom`, and the original scheduled handler are passed through unchanged. A fixed signed GET reads the VPS gateway's read-only SQLite snapshot using the existing server-owned transport configuration. Keys, cookies and arbitrary URLs/paths never reach the public response.

Cached failures retain the original collection timestamp and display a stale marker. RSS publication times remain separate from hot-list observation times. URL deduplication preserves source badges; platform rank changes are reported only when two actual rank samples exist. The view covers the past 24 hours and supports source/search/type filtering, since-last-visit filtering, and pagination.

Deployment order: merge/deploy pt-oci-ops PR #45 first, verify its real SQLite snapshot and service health, then publish the companion PT-Universe change and verify the live read-only endpoints and unchanged RSS contract.
