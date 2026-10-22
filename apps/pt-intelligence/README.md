# PT Intelligence OS — independent PoC

Entry: `https://ximinhu66.github.io/PT-Universe/apps/pt-intelligence/`

This is an additive, buildless module. The root launcher, Daily Nexus, existing apps, Workers, authentication, schedules and deployment workflows are unchanged. Only `apps/pt-intelligence/` and its model validation under `scripts/intelligence/` are added.

## Usable MVP

- Today: attention, overdue tasks, next events, reading, stale projects, comparison to the latest prior-day snapshot; hide-empty and per-module visibility, density, drag and arrow reorder.
- Inbox: FYI / Important / Action Required; read/unread, batch archive and restore, snooze until next Pacific morning, save later, task/note conversion with backlinks; independent state survives refresh.
- Tasks: Inbox / Today / Upcoming / Someday / Completed; priority, deadline, daily/weekly/monthly recurrence, subtasks, labels, Bug/Feature categories, notes, quick add and drag/arrow ordering. Completing a recurring task creates one next occurrence; reopening the original never duplicates it.
- Projects: status, goal, version, next milestone, GitHub, external source, notes, linked tasks/bugs/backlog, decisions, activity, and detection of 14 days without advancement.
- Decision Memory: context, options, decision, rationale, expected outcome, review date, actual outcome and lessons; full keyword search and editable review workflow.
- Personal Search: Ctrl/Cmd K, fuzzy text, type/project/start-date filters, recent queries, up/down/Enter navigation. No embeddings, semantic search or agent in this PoC.
- Daily Brief: rules-based aggregation, deduplication, priority/relevance scores with explanations, up to five suggested tasks, source feedback and original-source navigation. Does not automatically change task state.
- Desktop: Ctrl/Cmd K, Ctrl/Cmd Enter, Ctrl/Cmd N, standalone N, arrows, Enter, Escape. IME composition is excluded. Touch-accessible buttons and responsive layout.
- Scoped manifest and service worker cache this module's shell for offline fallback; no cache or service-worker scope extends to other apps.

## Read-only adapters

| Source | Read path | Limitations |
| --- | --- | --- |
| PT Todo | IndexedDB `pt-todo-dashboard`, `documents/state`, read-only transaction | Same browser/profile/origin only. Missing database upgrade is aborted. Existing creation dates never become deadlines. |
| Watch Inbox | `ptu.decision.monitors` local key | Reads local observations; never marks original monitor resolved. |
| Research Workbench | `research-workbench.v1` local key | Reads local paper metadata. |
| RSS Orbit | Existing source definitions, `rss-orbit-proxy.../feed/{id}` | Cache-only GETs, no refresh=true; failed feeds fall back to existing repository snapshot. |
| Manga/novels | `pt-universe-api.../api/data/site-updates.json` | Worker-first, existing static JSON fallback; original source timestamps preserved. |
| Games | `pt-universe-api.../api/data/game-releases.json` | Same fallback; release dates are never used as publication dates. |
| Stock | Existing `stock-alert/data/market.json` | NVDA/AAPL/MSFT/TSLA/PLTR/GOOGL/META/W; abs daily change >=3%; source delay disclosed. |
| Weather | Open-Meteo, approximate Kirkland city coordinates | No geolocation permission or precise-location capture. |

All network requests omit credentials and never upload personal notes/tasks/decisions. Source health shows checked time separately from source update time; items older than 36 hours are marked stale and excluded from Worth Reading. RSS requests from local QA host can be rejected by existing origin allowlists; production uses the already allowed `https://ximinhu66.github.io` origin. No allowlist is expanded for this PoC.

## Persistence and recovery

`pt.intelligence.v1` is an independent versioned localStorage document containing typed entities, inbox records, per-item metadata, source status, preferences, source feedback, limited activity and up to eight daily snapshots. URL canonicalization strips tracking and hashes, normalizes trailing slashes, and deduplicates across refreshes while retaining original IDs and user metadata.

Personal records are never published in the repo. Original Todo snapshots are read-only; edits happen in the original tool, or explicitly copied into a new PoC task. The legacy JSON importer is an optional migration path for a different browser/device, not required for same-browser access.

JSON export includes records, relations, metadata and preferences. Validated JSON import merges by ID, retains newer local entity records, restores imported metadata/preferences and saves the prior document to `pt.intelligence.v1.backup`. Restore recovers that prior document. Storage failures remain visible and warn before unloading. Revision leases refuse stale-tab writes; a tab with an active editor must reload before writing after another tab changes the document.

The page reads data at startup, manually, and every 15 minutes while visible. Existing collectors continue on their current schedules. Briefs are computed when viewed, not pushed by a new background job. The first local day establishes a comparison baseline; subsequent visits compare with the most recent earlier saved day, whose date is displayed. Missing data is not treated as evidence of no changes.

## Explicitly deferred

Cloud sync/D1/FTS/auth consolidation, external Calendar and Gmail connections, embeddings/semantic search, graph extraction/visualization, LLM summarization, provider settings and the Assistant. The current UI uses static HTML/CSS/ES modules to match the existing deployment; a React/TypeScript migration can follow validated product behavior.

## Validation

`node scripts/intelligence/model-test.mjs`

Model tests exercise duplicate/invalid IDs, canonical URL deduplication, metadata preservation, recurring dates (including month-end), no duplicate recurrence on reopen, search filters, old Todo mapping and Pacific daylight-saving snooze offsets. Browser QA covers project/task/decision creation and linking, subtask edits, completion, full-text search, refresh persistence, Inbox conversion/archive/snooze/feedback, export/reimport, and a 390px iframe layout. Browser QA is Chromium; real Safari/iOS/macOS testing remains necessary.
