# PT Todo Dashboard

Static online migration of the supplied Work Log design notes. PT Universe entry: `apps/pt-todo-dashboard/`. Also embedded in Daily Nexus's Todo tab, with persistent mounting and shared theme.

The three independent concepts are project nodes (a flat `parentId` + sibling `order` tree), standing tasks (open until completed), and Markdown records/logs on their owner. Dates are added/closed metadata, never deadlines. No duplicate summary or separate log stream, day rollover, project checkboxes, or time-blocking grid.

## Browser data and migration

`worklog.json` version 1 imports the original `settings`, `nodes`, `tasks`, and legacy `logs`. Invalid IDs, orphan references, cycles, and unsupported versions are refused before changing data. Legacy summaries and logs are folded into records without discarding the source logs. The screenshots define functionality; their photographed work content is not published as a fixture or preloaded data.

Data is saved using IndexedDB transactions. State and a rolling set of 30 snapshots commit together. First edit each local day, imports, cloud acceptance, and backup restoration snapshot the previous document. Corrupt original data is quarantined for download. A database revision check refuses writes from an out-of-date tab. The page shows unsaved failures and warns before closing pending/failed writes. UI-only state and composer drafts use `pttodo.ui`; draft changes do not leave the current device.

Todo sync reuses `ptu.sync.config` pairing credentials and the existing Worker, but uses its own `todo-dashboard` scope; it is never included in the preferences blob. AES-GCM encrypts the full document before uploading. Clean clients accept a new remote version; divergent edits require an explicit cloud/local choice with backups. The Worker atomically checks `baseRevision` for this scope, so two simultaneous writes cannot silently overwrite each other. Edits stay local during network failure and retry on later sync. This is whole-document sync, not collaborative live editing or field-by-field merge. Keep a JSON backup for combining divergent changes.

## Cross-platform operations

Windows: Ctrl K / Ctrl E; Mac: Cmd K / Cmd E. Both: Enter inserts a sibling or first child of an expanded parent; Tab / Shift Tab indent/outdent; Alt/Option Up/Down reorder siblings; Ctrl/Cmd Left/Right fold/unfold; Up/Down navigate; Escape exits tree editing. IME Enter is ignored during composition. Standard editor undo remains native; structural changes have a separate Undo button. Every tree operation has a clickable equivalent or parent picker. Only the colored dot is draggable; targets distinguish before/after/inside and refuse cycles.

JSON backup/import and Markdown/ZIP download work on both OSes. Supported top-level Chromium browsers additionally offer explicit `showDirectoryPicker` authorization. Safari, Firefox, and embedded views use ZIP. No local vault scanning, Finder command, Windows shell command, or permanent filesystem permission is assumed.

Obsidian exports contain `Work Log.md`, `Daily/YYYY-MM-DD.md`, and nested `Projects/` notes, frontmatter, wikilinks, dated Markdown checkboxes, and logs indented under tasks. Only nodes with children/records/tasks get separate notes. Filenames are sanitized for Windows/macOS; duplicate names are disambiguated. Direct writes preflight destination collisions and refuse unmanaged files. Optional pruning only touches previously exported `.md` files listed in the tool's own manifest, inside the chosen export subfolder. Empty folders are left in place to avoid deleting unrelated content. ZIP is a standard UTF-8 ZIP with no external libraries.

## Validation

```sh
node scripts/todo/model-test.mjs
node scripts/todo/browser-test.cjs
cd workers/pt-universe-api
npm run check
node tests/todo-sync.test.mjs
```

Browser checks use Playwright and start a private temporary HTTP server; optional `PT_PLAYWRIGHT` and `PT_CHROMIUM` select existing runtime installations. They verify Win/Mac modifier behavior, IME, hierarchy, dragging, records/logs, archive/reopen, deletion/undo, reload persistence, exports, responsive views, encrypted pairing/conflict handling, and Daily Nexus mounting/theme. Mocked cloud tests are complemented by the D1 route concurrency test. Real Win/Mac OS file dialogs still require permission granted interactively by the user.
