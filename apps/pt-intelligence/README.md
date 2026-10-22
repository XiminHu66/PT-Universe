> **2026-10-22：独立 OS 路线已暂停。** 以下为旧 PoC 功能记录，不再代表当前产品承诺。默认入口为暂停说明和原始记录导出；旧应用保留在 `experiment.html`。查看 [完整取舍与重新立项条件](PRODUCT-DECISION.md)。本机记录、备份和其他 PT 页面均未改动。

# PT Intelligence OS — independent PoC

Entry: `https://ximinhu66.github.io/PT-Universe/apps/pt-intelligence/`

This is an additive, buildless module. The root launcher, Daily Nexus, existing apps, Workers, authentication, schedules and deployment workflows are unchanged. Only `apps/pt-intelligence/` and its model validation under `scripts/intelligence/` are added.

## Usable MVP

- Today: one quick task input and task list; action-required inputs, events, relevant signals and prior-day changes appear only when present; a Brief tab replaces the separate Brief destination.
- Inbox: FYI / Important / Action Required; read/unread, batch archive and restore, snooze until next Pacific morning, save later, task/note conversion with backlinks; independent state survives refresh.
- Tasks: Inbox / Today / Upcoming / Someday / Completed; priority, deadline, daily/weekly/monthly recurrence, subtasks, labels, Bug/Feature categories, notes, quick add and drag/arrow ordering. Completing a recurring task creates one next occurrence; reopening the original never duplicates it.
- Projects: status, goal, version, next milestone, GitHub, external source, notes, linked tasks/bugs/backlog, decisions, activity, and detection of 14 days without advancement.
- Decision Memory: context, options, decision, rationale, expected outcome, review date, actual outcome and lessons; full keyword search and editable review workflow.
- Personal Search: Ctrl/Cmd K, fuzzy text, type/project/start-date filters, recent queries, up/down/Enter navigation; notes and decisions share the Records destination. No embeddings, semantic search or agent in this PoC.
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

## Interaction redesign (2026-10-22)

The same independent URL now uses five destinations: Today, Inbox, Tasks, Projects and Records. The Brief is a Today tab; notes and decisions share Records. Old `#decisions` and `#brief` links still route to their new locations. The local document key, schema version, backups, source adapters, and original-app read-only boundary are preserved.

Design references: [Things Today](https://culturedcode.com/things/support/articles/4001304/), [Linear Inbox](https://linear.app/docs/inbox), and [Readwise Reader triage](https://docs.readwise.io/reader/guides/workflows/library-configuration). The implementation applies their attention boundaries and processing flow; it does not embed or copy their UI code.

- Today centers on a quick task input and one task list. Action-required inputs and decision reviews appear only when present; Important/FYI signals remain secondary. Decorative hero copy, KPI tiles, duplicated task cards, repeated explanatory banners, layout controls and empty optional widgets are removed.
- Inbox opens in a smaller relevant triage view. It uses explicit flags, title keyword matches and freshness instead of treating every RSS entry as personal work. All inputs remain in All, ordered by time. Saved items leave triage. Source/status filters remain available.
- Desktop Inbox keeps its list and reading detail together; mobile switches between the list and reader with an explicit Back control. Task/project/record details use a side sheet. Primary reader actions are Add to Today, Later, Archive. Advanced actions remain in a menu. J/K or arrows navigate; E archives, L toggles Later, H snoozes.
- Add to Today creates a linked task immediately and archives the PoC input, without writing to its original source. Repeating this reuses an open linked task. Archive, Later, snooze, batch archive and Add to Today provide Undo. Batch selection starts without selecting items automatically.
- Editors show the few essential fields first; recurrence, subtasks, labels, extra relations, source metadata, and detailed decision context are retained behind More options. Existing hidden-field values survive editing.
- Source health moves to a compact sidebar indicator; detailed errors and timestamps are expandable in Settings. A prior-day change summary appears only when there are changes, and opens the recent-changes Inbox filter.
- A scoped shell-cache revision and versioned frontend entrypoints refresh the interface without changing local records. New pure view/triage modules are cached for offline shell use.

Additional model checks cover Important vs Action Required, title-only triage relevance, complete-feed availability, triage/Later separation, one-click linked task idempotence, original-record preservation and change baselines. Browser QA also covers the older local document, quick task entry, minimized editors, desktop split reader, Add to Today/Undo, batch archive/Undo, old decisions, and 390px mobile list/reader navigation. Real Safari/iOS testing remains outside this Chromium QA.
