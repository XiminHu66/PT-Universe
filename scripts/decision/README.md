# Decision tools, September 2026

Scope: Stock Alert + Thesis Lab holding reviews; 3C Scout purchase shortlist;
Weekend Atlas half-day planning + Food Orbit dinner planning; Signal Audit,
Watch Inbox and Ask GPT. Other tools retain their existing code and behavior.

## State and evidence

New records use `ptu.decision.*` in localStorage. Existing PT sync already
includes this prefix and encrypts before upload. No personal records, holdings,
monitor URLs or signals are committed to the public repository. Data backup
buttons export each record collection. Ask GPT exports text and stores drafts
and the last 30 packets. Pair devices through the existing PT bridge.

Holdings support USD stock positions (not options/cash), explicit review
boundaries, conditional thesis checks and append-only review history. Quotes
older than 96 hours cannot trigger price comparisons; ages are always shown.
Concentration applies only to the fully priced, entered equity subset.

Shopping matches the existing news feed on all supplied keyword tokens.
Article prices and links are discovery hints, never verified transaction prices.
A user-confirmed observation (less than 72 hours old), same currency and variant,
compatibility evidence and target price are required for the ready state.
This is evaluated when the page opens or the user refreshes, not background
merchant polling. Observations retain their original source and timestamps.

Signal Audit retains original text, publication/recording timestamps and fixed
rules. Notes and archive status can change; original signals cannot be rewritten
in the UI. All archived records remain in the comparison. Daily OHLC observes
next-session open to Nth-session close. No same-day lookahead or intraday execution
inference. Only complete daily bars are evaluated, conservatively after 17:00 ET.
Late-entered signals are separated from prospective results. SPY is buy-and-hold
context, not an appropriate short strategy excess-return baseline. Gross directional
returns exclude costs. This is observation research, not a broker simulator.

Watch Inbox has no assumed Muse API or Twitter integration. Paste text or import:

```json
{"observations":[{"url":"https://example.com/","text":"new content","observedAt":"2026-09-30T17:00:00Z","provider":"Muse"}]}
```

Unknown URLs are skipped. The first observation establishes a baseline. Numeric
rules require a single numeric field, not number extraction from arbitrary HTML.
Unresolved matching changes remain pending through later no-change captures.
Snooze reappears on opening the page after the chosen date; it is not an OS push
notification. Pause blocks ingestion. Changed rules establish a fresh baseline.

Weekend plans use real event snapshots, exact dates, freshness and explicit filters.
Suggested visit lengths, transfer buffers and meal stops are not live opening or
traffic data. Source pages and multi-stop Maps routes remain attached. Dinner
menus use a small transparent recipe set with estimated times and portion scaling;
filters fail closed rather than silently ignoring excluded ingredients.

Ask GPT includes only chosen record collections and explicit page handoffs. It
reads current available public snapshots when requested, preserves timestamps,
marks source text as evidence, and copies editable text. Opening ChatGPT does not
send it. Handoff content is stored locally, not in URL query strings.

## Verification

```
node scripts/decision/test-models.mjs
python -m http.server 8765
node scripts/decision/browser-test.cjs
```

Browser tests require Playwright with Chromium. `PT_CHROME` selects a compatible
local binary; `PT_TEST_URL` sets the base URL. Tests use isolated browser storage,
not the user's records. Screenshots are written to `/tmp/pt-*.png`.
