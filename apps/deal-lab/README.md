# Deal Lab — shopping/game PoC v3

https://ximinhu66.github.io/PT-Universe/apps/deal-lab/

The current product has **four workspaces only**. Google/SerpApi is retired server-side (`410 provider_retired`); the source overview, general API playground, JSON debugger and saved-items/history UI are removed. Existing browser records from those features are preserved, not deleted. PT Universe entry and the existing owner connection/nonce-bound return flow remain intact.

## 1. Product comparison

One keyword search calls ShopSavvy MCP `product_search`, then reads `product_lookup` and `product_offers` for the first matching product. Every result with a distinct source identifier gets its own variation tab. Literal title cues separate single items, Plus/bundles and accessories; these are browsing groups, not inferred authoritative parent/child SKU relationships. The original title, model, MPN, color, barcode and ASIN remain visible when the actual source provides them.

Selecting another variation reads that variation's details/quotes, with separate caches and partial errors. No automatic sweep of all search results. The explicit refresh button refreshes the selected quote. Prices show seller, condition, source-reported stock and the actual last-check time. Old/undated offers are visibly marked; only new, in-stock offers checked within seven days are eligible for a recent-offer minimum. All ShopSavvy attribution URLs are preserved. No synthetic product images or invented specifications.

MCP initialization, initialized notification, real tool discovery, exact input schema validation and the fixed read-only allowlist remain server-side. Only product_search, product_lookup and product_offers are allowed for this PoC.

## 2. Game prices, including China

Search uses Steam's public store search, prefers an exact title match and accepts an explicit AppID. It automatically compares:

- Steam's actual country-specific appdetails price for selected countries; defaults CN + US, up to six of CN/US/HK/JP/GB/DE/BR/CA/AU/KR/TR/IN.
- CheapShark store offers tied to the same Steam AppID. Store names come from its actual stores endpoint; deal links retain CheapShark redirect routing.
- Optional ITAD lookup and prices for each selected country, if `ITAD_API_KEY` is configured. No fabricated data when missing; other sources work independently.

The displayed minimum is **among connected sources and selected regions**, not a guarantee of every store on the internet. Native currency and amount are retained. ECB daily reference rates provide an explicitly labelled CNY comparison; if unavailable, native prices remain visible and incomparable amounts do not enter cross-currency ordering. The rate's actual date is displayed. These are not settlement FX, and do not establish purchase eligibility, activation region, tax/fees or edition equivalence beyond the matched source ID. No buying, account modification or region circumvention is performed.

## 3. Free games

Only complete-game activities associated with Steam and/or Epic Games Store are retained, enforced server-side and filtered again in the UI. No Xbox/PlayStation/mobile, Loot or Beta browsing. Platform and expiry sorting remain. Original instructions disclose points, accounts and tasks where present; no blanket claim of permanent ownership. Attribution to GamerPower and its original activity links is retained.

## 4. All wishlisted games and trends

The official public Steam search returns total count and pages of 100. All pages are reachable, including direct page jumps; absolute source positions are preserved. The explicit full-snapshot action reads pages sequentially, gives progress, can be cancelled and fails visibly on page/snapshot errors. It is capped at 150 pages and is not a scheduled/background scraper. Cached pages are date-checked so yesterday's result cannot become a new observation today. Cross-date scans stop rather than stitching two days into one snapshot.

Daily D1 observations retain 35 days. `deal_lab_rank_pages` records which pages were actually received. A date is a complete baseline only if all reported pages are present. A new entrant is confirmed only after such a full baseline. Partial scans are retained with explicit coverage; one day's rereads never gain extra statistical weight.

Views:
- Current full ranking, all pages; local search across pages already read.
- Last-30-day **observed average rank**, best rank and last observed rank.
- Last-30-day rank risers (requires at least two actual observed dates).
- Last-30-day new entries after an actual full baseline.

**No official historical month ranking or real monthly wishlist-add count is claimed.** Any game's true wishlist counts/additions are private developer reporting. Followers, activity-order or rank movement cannot substitute for them. The UI displays actual observed and complete days, and explicitly warns when less than 30 days of history exist. Historical observations are not backfilled from guesses. SteamDB is not scraped or bypassed.

## Resource/safety policy

No new VPS service, cron, GitHub Actions collector, paid plan, account system or analytics service. Only owner-triggered queries, with cached repeats and independently atomic D1 reservations. The existing PT owner grant, origin gate, fixed upstream domains, bounded inputs/response sizes, key redaction and 429 backoff remain in force. Plain DOM text rendering and safe links prevent upstream HTML execution.

| Source | Internal limits: minute / hour / UTC day / rolling 31 days | Cooldown | Cache |
| --- | --- | --- | --- |
| ShopSavvy | 6 / 60 / 120 / 2000 | 4s | 6h |
| Steam ranking pages | 40 / 120 / 160 / 2600 | 1s server, at least 2s UI | 24h, same observation date |
| Steam store | 12 / 60 / 160 / 2500 | 1s | 1h |
| CheapShark | 8 / 40 / 120 / 2500 | 2s | 3h |
| GamerPower | 4 / 30 / 80 / 1600 | 15s | 2h |
| ITAD, optional | 5 / 60 / 90 / 1800 | 10s | 3h |
| ECB FX | 1 / 1 / 2 / 40 | 60s | 24h |

At the 2026-10-29 observed 5,884 wishlist entries, one manually requested complete scan takes 59 page requests, typically around two minutes. One scan/day is about 1,770 page requests per 30 days, below the 2,600 rolling allowance. Repeating current-day cached pages makes no new upstream request. Monthly trend reads are local D1 reads and do not spend upstream request allowance. Limits count attempted calls including failures; they are this tool's limits, not official account balances. ShopSavvy anonymous limits remain shared per exit IP (official 10 tool calls/minute, 100/hour). Upstream 429 is respected even below internal limits.

## Validation

Repository root:

```sh
node --check apps/deal-lab/app.js
node scripts/deal-lab/ui.test.mjs
node scripts/deal-lab/flow.test.mjs
node scripts/monitor-center/connection-test.mjs
python .github/scripts/actions_policy.py .
python scripts/build-pages.py
```

From workers/pt-universe-api:

```sh
npm run check
node tests/deal-lab.test.mjs
node tests/deal-rank.test.mjs
npm run types -- --check
npx wrangler deploy --dry-run
```

`node tests/deal-lab.live.mjs` explicitly calls actual public upstream services through an isolated local route/SQLite/KV adapter. It is not run in routine CI and is not evidence of deployment. The final production URL, source revision, deployment run and browser flows must be independently verified after release.

2026-10-29 real local-route upstream results: ShopSavvy search/lookup/model/16 offers; Hades CN CNY 92.00 / US USD 24.99; Steam title search; ECB dated 2026-10-29; matching CheapShark offers; five Steam/Epic full-game activities; wishlist pages 1 and 2 with 100 items each and source total 5,884; D1 daily history reflects one actual date, not 30 simulated days. Repeats hit cache, Google returns retired 410 and missing ITAD key returns 503. No keyed ITAD live success is claimed.

Primary references:
- https://shopsavvy.com/data/documentation/mcp-tools
- https://store.steampowered.com/search/?filter=popularwishlist&ignore_preferences=1
- https://partner.steamgames.com/doc/webapi/IPartnerFinancialsService
- https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html
- https://docs.isthereanydeal.com/
- https://apidocs.cheapshark.com/
- https://www.gamerpower.com/api-read
