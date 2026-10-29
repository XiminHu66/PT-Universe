# Deal Lab / API Explorer

Production frontend: https://ximinhu66.github.io/PT-Universe/apps/deal-lab/

Backend: existing `pt-universe-api` Worker, `/api/deal-lab/status`, `/query`, `/clear`.
No VPS service, new scheduler, paid endpoint, shopping mutation or Steam sign-in.

## Use

1. Open Deal Lab from PT Universe's shopping collection. The existing PT owner connection is reused; when required, its existing nonce-bound connection returns through Monitor Center and resumes Deal Lab. No new credential or account is created.
2. Product Explorer: keyword search, identifier lookup (ASIN/barcode/model/ShopSavvy path), offers, date-range history or buying guide. The compare option sends independent queries; a missing Google key does not discard ShopSavvy results.
3. Game Deals: title or Steam AppID search. Select a game to explicitly request offers, details or historical lows. CheapShark IDs and ITAD UUIDs remain separate.
4. Free Games: complete games default, platform/type filters, DLC subfilter within Loot, and expiry sorting. Detail shows upstream instructions and original giveaway link. Claimed state does not claim permanent ownership.
5. Steam: manually fetch up to 50 publicly listed apps. Search, filter changes and link to deal providers. Only successful manual reads create snapshots. There is no periodic snapshot task. A new entrant means new to the collected top 50, not new to Steam.
6. Playground: select a read-only endpoint/tool; MCP fields are generated from actual `tools/list` schema. JSON input and the exact schema are available. Raw responses are viewable as a collapsible tree or formatted text and can be copied.
7. Save items, target price/currency, claim state and recent query parameters in the isolated `ptu.deal-lab.*` browser namespace. No existing Tsugi/3C Scout records change. Multi-device sync and notifications are not enabled.

The top-of-results cache check reuses data; an explicit upstream refresh consumes quota subject to server limits. Clearing a query invalidates freshness while retaining its last successful value for outage recovery.

## Server configuration

Optional Cloudflare Secrets (never frontend/localStorage):

- `SERPAPI_KEY`: account must remain on its free plan. Google Shopping search and Google Immersive Product (`page_token` from search). Missing key yields `503 key_missing` without an outbound request.
- `ITAD_API_KEY`: personal developer application key, preferably verified-email account. Missing key behaves independently the same way.

Use the existing Worker secret-management process; no account upgrade or billing configuration is performed by this feature. Deal Lab cannot see use of the same account in other apps and cannot guarantee third-party plans remain unchanged.

## Limits and provenance, verified 2026-10-29

| Source | Official free access / conditions | Internal attempt caps: minute / hour / day / rolling31days | Cache / cooldown |
| --- | --- | --- | --- |
| ShopSavvy | Anonymous 10 tool calls/minute and 100/hour **per IP**. Cloudflare egress can be shared. 15 published tools; 11 read-only research tools allowed; account/scheduling tools excluded. | 4 / 30 / 120 / 2000 | 6h / 12s |
| SerpApi | Free plan 250 searches/month, 50/hour. No automatic purchase of more credits. | 1 / 30 / 12 / 175 | 6h / 60s |
| ITAD | Verified-email default 1000 requests/5 minutes, developer dashboard authoritative. Personal use allowed; attribution and unmodified links/prices; no competing service. | 5 / 60 / 90 / 1800 | 3h / 10s |
| CheapShark | No key. No fixed numeric rate published. Obey 429 and Retry-After; user-triggered queries; purchases through CheapShark redirect links. | 5 / 40 / 120 / 2500 | 3h / 10s |
| GamerPower | No key; up to 10 requests/second; active attribution hyperlink required. Loot includes DLC; no permanent-ownership inference. | 4 / 30 / 80 / 1600 | 2h / 15s |
| Steam | Official public store search order; **not a supported stable ranking API**. No SteamDB scraping, bypass or private partner API. No numeric wishlist counts or growth estimates. | 1 / 3 / 8 / 100 | 24h / 300s |

All internal caps count reserved attempts including failed calls and MCP discovery, conservatively. Rolling31days prevents calendar-boundary bursts from accidentally exceeding SerpApi's monthly allocation. Daily boundaries use UTC; UI timestamps display America/Los_Angeles. No official remaining-balance API is queried or implied.

D1 uses a single atomic conditional insert for reservation, so concurrent requests cannot bypass provider caps or cooldowns. Failure of accounting stops outbound work. KV caches are canonicalized by parameters; last-success values retained for 14 days. Upstream 429 backoff supports seconds or HTTP-date and never shortens Retry-After. No automatic retry loop.

Steam snapshots retain 90 days, generated solely after an owner-triggered successful read. They are public ranking metadata, not a wishlist-count database. Missing snapshot history shows no comparison, not a zero change.

Provider terms don't all publish a cache-retention ceiling. These short, personal result caches reduce requests, do not mirror bulk catalogs, and do not grant redistribution rights. Stop/remove a source if its terms change. ShopSavvy source timestamps can be old even on a newly fetched MCP response; both fetch time and any actual quote-check time are visible.

Official references:
- https://shopsavvy.com/data/documentation/mcp-server
- https://shopsavvy.com/data/documentation/mcp-tools
- https://serpapi.com/pricing
- https://serpapi.com/google-shopping-api
- https://serpapi.com/google-immersive-product-api
- https://docs.isthereanydeal.com/
- https://apidocs.cheapshark.com/
- https://www.gamerpower.com/api-read
- https://store.steampowered.com/search/?ignore_preferences=1&filter=popularwishlist
- https://store.steampowered.com/robots.txt

## Security boundaries

All upstream queries and cache mutations require the existing pinned-signature PT owner grant. Only fixed domains and operation definitions are reachable. Redirects, oversized responses, unknown fields and non-read-only MCP tools are blocked. Provider secrets are removed from responses/errors. Raw results use DOM text rendering, safe HTTP(S) links and no upstream HTML insertion. No request parameters are logged by the feature.

## Validation

From repository root:

```sh
node --check apps/deal-lab/app.js
node scripts/deal-lab/ui.test.mjs
node scripts/deal-lab/flow.test.mjs
node scripts/monitor-center/connection-test.mjs
python .github/scripts/actions_policy.py .
python scripts/build-pages.py
```

From `workers/pt-universe-api`:

```sh
npm ci
npm run check
node tests/deal-lab.test.mjs
npm run types -- --check
npx wrangler deploy --dry-run
```

`node tests/deal-lab.live.mjs` is an **explicit manual** public-upstream integration check. It uses isolated local SQLite/KV and real external HTTP; it is not a claim of production deployment or production owner-login verification. Routine CI does not call upstream providers. Deployed UI and Worker must be checked independently after release.

2026-10-29 pre-release verification:
- 56 fixture assertions passed: actual SQLite atomic/rolling quotas, auth and origins, missing-key behavior, cache normalization, stale fallback after invalidation, MCP initialization/session/SSE/Schema, timeout, size, 429 and secret redaction.
- Live local route: CheapShark Hades (2 games), GamerPower Steam games (2 events), Steam (50 ranked apps), MCP discovery (11 allowed tools), product search (3 products), product offers (66 offers). Every repeated query returned cache hit. These counts describe that test time, not permanent availability.
- ITAD/SerpApi missing-key handling passed; no keyed-provider success is claimed.
- Full existing Worker deployment regression suite passed locally, plus Worker type checking, binding-type verification, dry-run packaging and Pages build.
- PR's pre-existing unrelated browser checks used stale Daily Nexus nav/Idea Pad label assertions (Decision, Daily Nexus, Todo jobs). No unrelated application code or tests were changed to conceal those failures. Production release results must be recorded separately.

Known limitations: keyed provider live responses require secrets; source licenses/plans can change; Steam ranking is an experimental public-page adapter and stops on schema/access failures; chart for ITAD history requires that provider's real data; ShopSavvy text-only fields are conservatively extracted, with original text/JSON preserved. No cross-provider identity equivalence or region equivalence is inferred from matching titles.

Production verification, 2026-10-29 (initial release `3dc392e` / PR #151):
- Pages source revision matched the release commit. Worker version `47d7f905-590c-4265-b429-8f19fd287498`; both deployment Actions, resource policy and Monitor Center validation succeeded.
- Official browser UI: CheapShark Hades search (16 matches), repeat cache hit, game detail (USD 24.99 at test time; historical low USD 6.24); GamerPower Steam (2 events); Steam official top 50 with `snapshotStored: true` and no fabricated initial comparison.
- ShopSavvy search returned 20 products through the deployed Worker. SerpApi's missing secret produced an independent 503 while the successful MCP results remained visible.
- A real early detail click triggered the intended internal 429 protection. Follow-up polish adds a visible cancellable countdown for manually initiated queries, server Retry-After for budget denials, source-specific store-deal search, and clears old-page notices. There is still no automatic data fetching or automatic retry after an upstream failure.
