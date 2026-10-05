# Idea Pad · 随手记

Daily Nexus keeps its stable `todo` tab identifier, renames the default label to Idea Pad, and provides persistent 项目管理 / 随手记 subpanels. Existing `pt-todo-dashboard` IndexedDB, tasks, exports and encrypted sync are untouched. Notes can also open at `apps/idea-pad/`.

Notes use a Notion-inspired nested page tree, breadcrumbs, explicit move-to controls, page dragging, inline title editing, search across page titles/body, subpage shortcuts, subtree trash/restore, JSON backup/import and standalone page HTML export. Long text supports headings, bold/italic/underline, lists, quotes, code and HTTP(S) links. Upload/drop/paste raster images; uploaded images are compressed to at most 1600px and included in local backups and encrypted sync. GIF uploads become static images. External images retain their URL.

The pinned Tiptap/ProseMirror editor bundle is checked in for self-contained GitHub Pages delivery. Build with `npm ci && npm run build` in this directory. No CDN dependency at runtime. Keyboard formatting/history/IME remain editor-native on Windows and Mac.

`pt-idea-pad-notes` IndexedDB is separate from project data. Debounced transactional saves retain 30 daily/import/cloud/restore snapshots, check local database revisions, keep failed writes visible and warn before closing unsaved changes. Import validates page relationships, document schema and safe URLs. No document HTML is blindly executed.

Sync reuses existing `ptu.sync.config` credentials but uses its own `idea-notes` scope. AES-GCM encryption covers text and image data. Oversized ciphertext is stored as immutable encrypted chunks, then an encrypted manifest is published with an atomic baseRevision check; a partial upload cannot replace the last valid manifest. Downloads verify the chunk digest and AES authentication before applying anything. Concurrent edits require an explicit cloud/local choice; older versions are backed up. It is whole-document synchronization, not collaborative editing. Immutable chunks retain historical ciphertext in the backend; no automatic cleanup of that history is implemented.

Daily discovery uses a native details disclosure, starts collapsed, remembers the user's open/closed preference and loads ranking data only on first expansion or an explicit refresh.

Validation: `node scripts/idea-pad/model-test.mjs`, `node scripts/idea-pad/browser-test.cjs`, plus the existing project browser regression and backend `tests/todo-sync.test.mjs`. Browser flows cover Win/Mac, long text, formatting, links, embedded image persistence, nesting/moving, trash restoration, export, encrypted roundtrip/conflicts, mobile width, Daily Nexus mounting and theme propagation.
