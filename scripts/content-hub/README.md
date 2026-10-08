# Daily Nexus content expansion

The existing GitHub Pages site and Cloudflare Worker host these features. No new service, secret, Browser Run job, or Gemini call is required.

| Entry | Location | Data and behavior |
| --- | --- | --- |
| 作品地图 (3) | Tsugi tab | Bangumi search, explicit subject relations, original release dates, saved maps |
| 卡牌实验室 (5) | Independent app | Deterministic card/dice combat, editable deck and actors, seeded simulations |
| 游戏素材库 (18) | Card Lab tab | Kenney official catalogue, previews, source/licence links, saved asset list |
| 核查台 (10 + 13 + 15) | Daily Nexus tab | On-demand web/news candidates, source paragraphs and raw product fields, human evidence annotations, case archive and version comparison |
| 中文兴趣话题 (23) | Tsugi tab | Bangumi work discussions and V2EX, source/text filters, reply order, read/hidden states, keyword blocks, collapsed spoiler titles |
| 番剧分集 (24) | Tsugi tab | Bangumi calendar/episode records, followed series and cumulative watched progress |
| 新发现与完结 (25) | Tsugi tab | Existing novel/manga update sources plus the explicit completed manga directory; existing Tsugi shelf integration |

## Public endpoints

GET `/api/hub/calendar`, `topics`, `discover`, `assets`, `search?q=`, `subject/:id`, `episodes/:id`, `check/search?q=&mode=claim|product`, `check/read?url=`.

The existing 15-minute Worker cron checks freshness. Fetch intervals: topics 30 minutes; discovery 2 hours; calendar/episodes 6 hours; assets/relations/source reads 24 hours; searches 1 hour. Failed refreshes preserve the last good data and its successful timestamp; partial source failures are visible. Kenney traversal is capped at 14 pages / 250 packs. Other directories and response bodies are bounded.

The source reader accepts HTTPS from fixed known hosts only, revalidates every redirect, stops at 2 MB, and times out. New evidence search/reader requests have a D1-backed per-IP cooldown; fresh cache hits do not consume it. The reader does not extract video transcripts, bypass login/paywalls or label search snippets as confirmed facts. Product fields retain the original source names and units. Human conclusions are explicitly labelled.

`first_seen` is our discovery time, not the publication date. Completion is accepted only from explicit source status or its completed directory. Episode record dates do not prove regional platform availability. Archived records and game configs are local, under existing encrypted-sync key prefixes (`tsugi-*` and `ptu.*`); public collectors do not store these records.

## Checks

```
npm ci --prefix workers/pt-universe-api
npm run check --prefix workers/pt-universe-api
(cd workers/pt-universe-api && node tests/content-hub.test.mjs)
node scripts/content-hub/engine-test.mjs
node scripts/content-hub/browser-test.cjs
node scripts/daily-nexus/browser-test.cjs
```

Browser tests require Playwright. CI uses Chromium and UTC to keep event calendar checks deterministic. Existing homepage, shortcut cropping, upcoming events, focus/learning navigation, and update-stream batch badges are covered as regressions. New tests cover real HTML fixtures, redirect/size restrictions, stale/partial cache behavior, completion identity, seeded combat, rejected configs, saved records, responsive layout, and lazy embeds.

For a fresh static fallback snapshot, capture the real source responses as `calendar.json`, `topics.html`, `v2ex.json`, `site.json`, `completed.html`, `assets.html`, `assets-2.html` ... `assets-14.html`, then run `node scripts/content-hub/snapshot.mjs <capture-directory>`. Captured file timestamps identify snapshot freshness. Production data remains in the existing Worker KV and refreshes without GitHub scrape jobs.

Merge to `main` deploys GitHub Pages and the existing Worker workflow. The Worker deployment also runs these backend tests. Check deployment status and the live public feeds before treating rollout as complete.
