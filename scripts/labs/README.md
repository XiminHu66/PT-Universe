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
Failed sources retain last-known records marked stale; an empty initial dataset fails the workflow.
Daily refresh at approximately 08:35 Pacific uses a DST-aware gate. Public snapshot updates explicitly deploy Pages because GITHUB_TOKEN commits do not trigger another push workflow.

## Personal data
localStorage keys ptu.labs.theses / dojo / games / weekend. These fit existing optional PTSync encryption scope. No individual theses or wishlists are committed. Project-specific JSON export/import provided. Existing PTSync conflict behavior remains unchanged.
Button "读取最新快照" reloads published data; it does not run a scraper. Data-task link opens manual workflow dispatch in GitHub. Game searches and wish quote refresh query CheapShark directly.

## Verification
python -m unittest discover -s scripts/labs -p 'test_*.py'
python scripts/labs/browser_test.py
The validation workflow obtains real datasets and checks responsive desktop/mobile interactions in Chromium. On-demand game detail requests are mocked only for deterministic edit/persistence checks. Published verification runs against the real Pages URLs.
