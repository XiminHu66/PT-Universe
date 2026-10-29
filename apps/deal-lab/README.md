# Deal Lab — shopping/game PoC v4

https://ximinhu66.github.io/PT-Universe/apps/deal-lab/

The current product has **four workspaces only**. ShopSavvy is replaced by SerpApi and retired server-side (`410 provider_retired`); the source overview, general API playground, JSON debugger and saved-items/history UI are removed. Existing browser records from those features are preserved, not deleted. PT Universe entry and the existing owner connection/nonce-bound return flow remain intact.

## 1. Product comparison

One explicit search calls SerpApi `google_shopping` (US, English, Seattle market context). The first matching item with a real immersive-product token gets one `google_immersive_product` call, with `more_stores=true`. Other products and source-provided variants are loaded only on selection, never swept automatically. No offset pagination: the current Google Shopping layout ignores `start`. Single items, Plus/bundles and compatible accessories keep independent tabs and caches. Products without a detail token show their search identity and original link, never invented quotes.

Images, title, brand, features, reviews, seller links, shipping, coupons and prices are displayed only when returned. Monthly installments are identified and excluded from full-price minimums. Used/refurbished listings are marked. Google capture time and tool retrieval time remain separate: neither is a merchant's price verification timestamp. Undated or >24h/stale responses do not receive a minimum-price headline. Explicit refresh bypasses both the local cache and SerpApi cache and may consume another credit.

### Configure the key safely

Production: Cloudflare Dashboard → Workers & Pages → **pt-universe-api** → Settings → Variables and Secrets → Add → type **Secret** → name **SERPAPI_KEY** → enter the key → save/deploy. Use an account on SerpApi **Free**, with no payment method or automatic early renewal. Existing Worker secrets survive ordinary Wrangler deployments. No GitHub secret, frontend edit or separate service is needed.

Alternatively, use `npx wrangler secret put SERPAPI_KEY` from `workers/pt-universe-api` and paste into its interactive prompt. Do not put the key in a command argument, GitHub file, issue, PR, browser storage or frontend form. The public UI exposes only a configured boolean. This repository never receives your real key.

For local development only, copy `workers/pt-universe-api/.dev.vars.example` to `.dev.vars`, set filesystem permissions to owner-only (`chmod 600 .dev.vars` on Unix), and edit it privately. `.dev.vars` and its variants are git-ignored; the example contains an empty placeholder. This local file is plaintext, not encrypted; use Cloudflare Secrets for production storage. The Pages distribution excludes the entire Worker directory.

Owner-only API contract:
- `POST /api/deal-lab/query` with `{ "provider": "serpapi", "operation": "search", "args": { "q": "HD 490 Pro" } }`.
- `operation: "product"`, args `{ "page_token": "<actual source token>" }`.
- `operation: "account"`, args `{}` checks official allowance without spending search credits, caching the sanitized projection for five minutes. It never returns account email, account ID or key.
- No key → HTTP 503 `key_missing`, no outbound API call. ShopSavvy → 410.

Every cache miss first requires an active, verified **Free** plan with `plan_monthly_price=0` and official `plan_searches_left > 75`; unverifiable/paid accounts stop safely. Account checks use a fixed endpoint and a key-specific cache, with no credentials in cached values. Account balance is a dated snapshot, not a real-time guarantee across other apps. Independent D1 limits conservatively count all attempts, even failures/provider cache hits. Search and product queries share the same cap. No billing, plan upgrade, top-up, arbitrary engines or URL proxy is exposed. Raw results and upstream errors are redacted before client responses or cache writes.

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
| SerpApi | 6 / 20 / 20 / 175 | 5s | 1h |
| Steam ranking pages | 40 / 120 / 160 / 2600 | 1s server, at least 2s UI | 24h, same observation date |
| Steam store | 12 / 60 / 160 / 2500 | 1s | 1h |
| CheapShark | 8 / 40 / 120 / 2500 | 2s | 3h |
| GamerPower | 4 / 30 / 80 / 1600 | 15s | 2h |
| ITAD, optional | 5 / 60 / 90 / 1800 | 10s | 3h |
| ECB FX | 1 / 1 / 2 / 40 | 60s | 24h |

At the 2026-10-29 observed 5,884 wishlist entries, one manually requested complete scan takes 59 page requests, typically around two minutes. One scan/day is about 1,770 page requests per 30 days, below the 2,600 rolling allowance. Repeating current-day cached pages makes no new upstream request. Monthly trend reads are local D1 reads and do not spend upstream request allowance. Limits count attempted calls including failures; they are this tool's limits, not official account balances. SerpApi Free currently provides 250 searches/month and 50/hour; only configured, owner-authorized calls can use it. Official and internal usage are shown separately. Upstream 429 is respected even below internal limits.

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

Validation boundaries for v4: backend fixtures cover missing key, Free/paid plan guard, official reserve, secret redaction, cache reuse and explicit refresh; UI/controller fixtures cover product/variant flow and installment handling. These fixtures are not live SerpApi price validation. Real SerpApi query validation remains pending the owner's key. The other three workspaces retain their previous verified data paths and cache namespace.

Primary references:
- https://serpapi.com/pricing
- https://serpapi.com/google-shopping-api
- https://serpapi.com/google-immersive-product-api
- https://serpapi.com/account-api
- https://store.steampowered.com/search/?filter=popularwishlist&ignore_preferences=1
- https://partner.steamgames.com/doc/webapi/IPartnerFinancialsService
- https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html
- https://docs.isthereanydeal.com/
- https://apidocs.cheapshark.com/
- https://www.gamerpower.com/api-read
