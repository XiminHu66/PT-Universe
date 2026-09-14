# PT Research Tools
Four independent Pages apps, integrated into PT Universe navigation:
- thesis-lab: quarterly fundamentals and locally stored, metric-based investment theses.
- earnings-dojo: anonymous statement exercises, objective scoring and next-quarter reveal.
- game-deals: CheapShark discovery, live full-catalog search, target prices, owned editions, observed price history.
- eastside-weekend: official Kirkland, Bellevue and Redmond events, map, favorites, ICS export.

## Data
Run pip install -r scripts/labs/requirements.txt, then python scripts/labs/refresh.py.
Configuration: scripts/labs/config.json. Default watchlist has 12 US reporting companies.
SEC CompanyFacts is attempted first. A 403/429 disables further SEC calls in that run and switches to Yahoo Finance via yfinance. Both providers are explicitly labeled. Null fields stay null. Weighted-average shares are never differenced. Yahoo quarterly cash outflows are converted to positive expenditure; FCF = OCF - expenditure.
Data reflects latest available restatements, not point-in-time investable backtests.
Games are USD PC offers, linked through CheapShark as required. Observed low means since this site's first observation, not all-time low.
Event times are America/Los_Angeles; absent times/fees/coordinates are not fabricated. City-center map markers are explicitly labeled approximate. Only explicit free-admission wording counts as free.
Each company, deal-query batch and event city keeps its own lastSuccessAt/checkedAt and status. Failed sources retain old records; failed deal feeds no longer disappear from partial results or overwrite current prices. SEC fallback availability is advisory when Yahoo succeeds.

## Reliability and publication
- Daily collection starts around 08:35 Pacific. Hourly schedule opportunities (`35 0-4,15-23 * * *` UTC) cover the morning/evening in both DST seasons. The gate checks the current Pacific date and the last complete success, never requires execution within the 08 hour. Scheduled executions before 08:35 skip collection.
- A successful dataset is skipped for the rest of that Pacific day. For partial failures, only unsuccessful sources are retried. Push/manual runs force a fresh check.
- Each dataset makes at most three attempts (20 and 60 second waits), saving an atomic checkpoint after every attempt. Missing sources are eligible again at the next hourly opportunity. GitHub schedules remain best-effort, not an uptime guarantee.
- Financials, games and events run in separate matrix jobs with fail-fast disabled. Dataset-specific artifacts are published even when another collection job fails. Only public JSON paths are merged into the newest main checkout. Source errors are reported as workflow failures after available data is deployed.
- Public updates explicitly deploy Pages because GITHUB_TOKEN commits do not trigger another push workflow. The gate compares repository vs published snapshot versions to recover a failed/interrupted deployment on the next schedule even when fetching already succeeded.
- Every deployment checks all four public pages and all three snapshot versions. Push/manual deployments also exercise the desktop/mobile interactions in Chromium.
- The page shows a prominent partial-failure/expired banner and per-source timestamps. More than 36 hours without a successful fetch is expired. This means last source verification, not the age of a company's reporting quarter. Open pages recompute freshness every minute. Old quotes do not trigger target-price highlights.
- Action summaries and failure conclusions expose incomplete runs; no external email or messaging service has been configured. If GitHub never schedules the workflow, the browser's age warning still changes as time passes.

## Personal data
localStorage keys ptu.labs.theses / dojo / games / weekend. These fit existing optional PTSync encryption scope. No individual theses or wishlists are committed. Project-specific JSON export/import provided. Existing PTSync conflict behavior remains unchanged.
Button "读取最新快照" reloads published data; it does not run a scraper. Data-task link opens manual workflow dispatch in GitHub. Game searches and wish quote refresh query CheapShark directly.

## Verification
python -m unittest discover -s scripts/labs -p 'test_*.py'
python scripts/labs/browser_test.py
The validation workflow obtains real datasets and checks responsive desktop/mobile interactions in Chromium. On-demand game detail requests are mocked only for deterministic edit/persistence checks. Published verification runs against the real Pages URLs.
