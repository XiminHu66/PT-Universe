# PT Research Tools
Three research/region Pages apps, plus PC comparison inside Tsugi:
- thesis-lab: quarterly fundamentals and locally stored, metric-based investment theses.
- earnings-dojo: anonymous statement exercises, objective scoring and next-quarter reveal.
- tsugi-checker/#pc-prices: on-demand PC game search, Steam official and CheapShark third-party price comparison. The standalone Game Scout project and its daily scraper were removed.
- eastside-weekend: Kirkland, Bellevue, Redmond, Lynnwood, Everett, Kent and Seattle events from official city/tourism/Seattle Center sources, map, favorites and ICS export.

## Data
Run pip install -r scripts/labs/requirements.txt, then python scripts/labs/refresh.py.
Configuration: scripts/labs/config.json. Default watchlist has 12 US reporting companies.
SEC CompanyFacts is attempted first. A 403/429 disables further SEC calls in that run and switches to Yahoo Finance via yfinance. Both providers are explicitly labeled. Null fields stay null. Weighted-average shares are never differenced. Yahoo quarterly cash outflows are converted to positive expenditure; FCF = OCF - expenditure.
Data reflects latest available restatements, not point-in-time investable backtests.
PC comparison uses US/USD only. Steam's own appdetails price is preferred over an aggregated Steam offer. CheapShark redirects lead to third-party purchases. Lowest current price, maximum discount and historical low (when provided) are separate. No console prices, membership prices or coupon claims are inferred.
Event times are America/Los_Angeles; absent times/fees/coordinates are not fabricated. City-center map markers are explicitly labeled approximate. Only explicit free-admission wording counts as free.
Each company and event city keeps its own lastSuccessAt/checkedAt and status. Failed sources retain old records. SEC fallback availability is advisory when Yahoo succeeds.

## Reliability and publication
- Daily collection starts around 08:35 Pacific. Hourly schedule opportunities (`35 0-4,15-23 * * *` UTC) cover the morning/evening in both DST seasons. The gate checks the current Pacific date and the last complete success, never requires execution within the 08 hour. Scheduled executions before 08:35 skip collection.
- A successful dataset is skipped for the rest of that Pacific day. For partial failures, only unsuccessful sources are retried. Push/manual runs force a fresh check.
- Each dataset makes at most three attempts (20 and 60 second waits), saving an atomic checkpoint after every attempt. Missing sources are eligible again at the next hourly opportunity. GitHub schedules remain best-effort, not an uptime guarantee.
- Financials and events run in separate matrix jobs with fail-fast disabled. Dataset-specific artifacts are published even when another collection job fails. Only public JSON paths are merged into the newest main checkout. Source errors are reported as workflow failures after available data is deployed.
- Public updates explicitly deploy Pages because GITHUB_TOKEN commits do not trigger another push workflow. The gate compares repository vs published snapshot versions to recover a failed/interrupted deployment on the next schedule even when fetching already succeeded.
- Every deployment checks all four public pages and both snapshot versions. Push/manual deployments also exercise the desktop/mobile interactions in Chromium.
- The page shows a prominent partial-failure/expired banner and per-source timestamps. More than 36 hours without a successful fetch is expired. This means last source verification, not the age of a company's reporting quarter. Open pages recompute freshness every minute.
- Action summaries and failure conclusions expose incomplete runs; no external email or messaging service has been configured. If GitHub never schedules the workflow, the browser's age warning still changes as time passes.

## Personal data
localStorage keys ptu.labs.theses / dojo / weekend; live training snapshots use ptu.labs.dojoFinancials. Old ptu.labs.games records remain exportable from Tsugi when present. These fit existing optional PTSync encryption scope. No individual theses or wishlists are committed. Project-specific JSON export/import provided. Existing PTSync conflict behavior remains unchanged.
Thesis/region "读取最新快照" reloads the daily snapshot. Earnings Dojo "刷新财报并换题" calls the Worker financial timeseries endpoint for a rotating company on each click/page load, compares actual values, and generates three questions from up to nine valid templates. "只换一道练习" changes the case without a fetch. No new-quarter claim is made when values are unchanged. Upstream errors explicitly retain existing data. The Worker PC endpoints cache duplicate searches/prices for two minutes; financial verification is not cached there. These endpoints use HTTP only, no Browser Rendering and no new secrets.

## Verification
python -m unittest discover -s scripts/labs -p 'test_*.py'
python scripts/labs/browser_test.py
The validation workflow obtains real datasets and checks responsive desktop/mobile interactions in Chromium. Node API integration checks call the real Steam/CheapShark/Yahoo sources and verify two upstream financial requests. Branch browser tests use the resulting fixtures for UI isolation. Published checks call the deployed Worker and Pages directly; failure/expiry scenarios are injected explicitly.
