# Knowledge Garden

Independent Karakeep reading and personal knowledge workspace. Canonical private page:
https://pt-vps-tools.h1nano.chatgpt.site/knowledge/

The GitHub Pages path redirects to the existing owner-private tools Site. Daily Nexus exposes only a toolbox entry during this validation phase. No data is written to the public repository.

## Workflow

1. Save a URL, the reason for keeping it, category and optional tags. The URL is normalized and duplicate saves open the existing native record without overwriting its note.
2. Karakeep crawls the URL using its existing browser worker. The UI distinguishes crawled text, screenshot, and full-page archive; a native `archived` bookmark flag means reading status, not a successful web snapshot.
3. Read native `/api/v1/bookmarks/:id/content` text and its paginated chunks. Extract a summary, suggested category, entities and claims on demand. The selected provider must be in the shared sustained-free catalog.
4. Attach quotes to valid source paragraph IDs. Whitespace and Markdown quote prefixes are normalized only for locating a quote, then the exact archived source span is retained. Invalid references are isolated. Matching a source does not independently verify the meaning of a claim.
5. Build a document/entity graph from verified source mentions. Cross-document semantic links require two matching source quotes and human acceptance. Shared entities indicate mentions, not causality or methodological improvement.
6. Query lexical matches and one-hop graph neighbors, synthesize statements with source quotes, isolate unsupported statements, and optionally save a synthesis as a native Karakeep text bookmark.

## Data and authorization

Native Karakeep remains the source of truth. Notes retain their existing prose with a versioned metadata comment appended for reason, category, reading status, extraction, relations and provenance. Metadata writes re-read the record and reject changes against an observed stale note. This is an optimistic check, not a cross-process transaction or an atomic native API CAS.

The private tools Site serves the page and proxies the existing free LLM router. Native browser identity and same-origin CSRF headers are required. Gemini capabilities are minted server-side for a single request (120-second validity), under the existing usage limits. Personal provider keys stay in memory and are not exported or put in URLs.

Frontend code and `site-route.mjs` are maintained here. The existing Site build copies these files into its bundled Worker assets, preserving the same private audience and tools proxy. Its sync helper is `scripts/sync-knowledge.mjs`. No new VPS port, service, database or vector index is required for the page.

## Boundaries

- This borrows SurveyGraph ideas; it is not a reproduction of its full MEKG, HDBSCAN, PageRank or paper benchmarks.
- Current retrieval is lexical + one-hop typed/entity expansion, not embeddings.
- Extraction input is capped at 46,000 characters, with actual coverage recorded. Query context is capped at eight documents and 6,500 characters per document. Omitted content cannot be used as evidence.
- Graph visualization is limited to 100 nodes; category filters narrow it.
- Full-page Monolith archival is currently pending a separately authorized VPS configuration deployment. Existing text and screenshots can be read; the UI never labels a missing archive as present.
- Dynamic, login-only or blocked sources can fail native crawling; the page exposes the real failure and links to native Karakeep for retry.

## Sources

- Research Workbench in `apps/research-workbench/`: collect/read/evidence/graph/synthesis flow.
- Karakeep v0.33.2 REST routes, schemas and cookie session behavior: https://github.com/karakeep-app/karakeep
- SurveyGraph paper: https://arxiv.org/abs/2610.31317
- SurveyGraph implementation: https://github.com/xzzvsxd/SurveyGraph

## Validation

`node scripts/knowledge-garden/model-test.mjs` verifies preservation of native notes, safe URLs, duplicate canonicalization, paragraph and quote grounding, hallucinated entity rejection, relation review gating, graph retrieval and unsupported-answer isolation.

The private Site additionally tests owner identity, CSRF rejection, route allowlisting, expiring backend capabilities, token limits and streaming. Browser acceptance uses the owner's existing native session and real public-page content.
