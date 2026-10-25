# Knowledge Garden

PT Universe's owner-private Karakeep workspace at https://pt-vps-tools.h1nano.chatgpt.site/knowledge/ . Daily Nexus retains its existing toolbox link. The public Pages entry redirects to that private Site.

## Everyday use

The interface follows Karakeep's original EditorCard, responsive BookmarksGrid and list sidebar: paste a link or write a note in one field, or use New for PDF/Markdown/TXT uploads. Save reason and category are optional. The main view is a card library with one full-text search. Source details, AI extraction, graph review and model settings are secondary views.

Workspaces use native manual Karakeep lists; one original can belong to multiple lists without duplicating the file. Project background, answer instructions and reusable prompts are durable, private Karakeep text bookmarks marked `meta.kind=workspace`. Existing categories and native notes remain intact. Unread/reading/read/deep-reading are explicit metadata events; archiving is never treated as evidence that a paper was read.

## Durable sources and retrieval

- Originals, HTML archives, PDF assets, notes, Workspace settings, source snapshots and Q&A remain in the existing Karakeep database and data volume on the VPS. No new port, vector database, or local model service is required.
- The model-independent `pt-chunks-v2` index snapshot lives in the source bookmark's metadata and contains source text, PDF page boundaries, a SHA-256 source version, parser version and coverage. Chunks (1600 characters, 200 overlap) are deterministically reconstructed from that durable snapshot. Changing a generation model does not require re-uploading or re-indexing documents.
- Search ranks all indexed chunks with BM25. Natural-language Q&A adds a free-model bilingual query expansion, then one-hop graph expansion. There is no vector/embedding index in this release. AI extraction is optional and is not a prerequisite for retrieval.
- PDF.js 5.6.205 is bundled under Apache-2.0; no external CDN or document transmission is used for parsing. Each PDF citation includes page, source version, chunk and exact archived quote. Native PDF/HTML assets remain accessible separately from the reader.
- Empty PDF pages are reported as needing OCR, not silently claimed as indexed. Mixed text/scanned PDFs display partial coverage. OCR itself is not included. Encrypted PDFs or malformed documents preserve the original and surface a parse error.
- Initial loading indexes new/stale readable sources while the page is open. `Update index` refreshes an entire scope; individual sources can also be refreshed. Native Karakeep continues background crawling while this frontend is closed. Refresh the frontend to index newly crawled sources.
- Text snapshots are capped at 1.5 million characters and PDFs at 1000 pages/80 MiB. Oversized originals are retained and ask for splitting rather than truncating silently. The reader API is paginated through the full supported source. Old native text content is preferred, with a sandboxed DOM-only archive-text fallback for unusually short reader output.

## Evidence and cross-session Q&A

Every submitted question and its result, actual evidence chunks, source versions, model, retrieval coverage and failure state are automatically persisted as native text bookmarks (`meta.kind=conversation`). These internal records are excluded from the Garden's source library. History reopens saved answers; follow-ups reuse the preceding question and answer for context, while retrieving original evidence afresh. Workspace data and history are independent of provider keys and browser storage. Only model preference is browser-local; personal provider keys are memory-only.

For questions such as “which papers have I read,” the app restricts to explicit read/deep-read records, matches the document catalog, and separately selects evidence chunks. It reports indexed/missing sources and context limits. No hit is not evidence of never having read a paper. Complex proofs still require opening the complete document.

Answers accept only valid evidence IDs and verbatim source spans; unmatched statements are isolated. Literal quote validation does not establish semantic entailment. Old citations keep a snapshot; if the source version changes, the reader warns and retains historical evidence. Deleted originals retain citation snapshots in history. Manual “Accept as knowledge note” is required to promote a generated answer, marked `resourceType=ai` to distinguish it from literature and personal reading notes.

## SurveyGraph-inspired organization

Source-grounded method/entity extraction, typed cross-source relations, one-hop expansion and evidence-gated synthesis remain available under Organize. Candidate semantic relations require a quote from each source and human acceptance before graph inclusion. This is a lightweight adaptation, not a full SurveyGraph reproduction.

## Deployment and validation

The source of truth is `apps/knowledge-garden` in `XiminHu66/PT-Universe`. The existing private tools Site copies the page, model, knowledge module and bundled PDF parser with `scripts/sync-knowledge.mjs`; it does not fork the application. The bridge reuses native Karakeep login and the existing sustained-free LLM router. Its authentication, same-origin checks and audience are unchanged; only same-origin PDF module worker execution was added to the page CSP.

```sh
node --check apps/knowledge-garden/app.mjs
node scripts/knowledge-garden/model-test.mjs
node scripts/knowledge-garden/workspace-test.mjs
```

The tests cover original-note preservation, canonical duplicates, source quote rejection, graph review, retrieval from PDF page 23, Workspace isolation, bilingual terms, stale parser/source versions, PDF coverage and independent reading-state semantics.
