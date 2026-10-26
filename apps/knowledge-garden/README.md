# Knowledge Garden

The sole daily UI is https://pt-vps-tools.h1nano.chatgpt.site/knowledge/ in the
existing owner-private PT Tool hub. `/hub/` lists it beside other VPS tools.
The GitHub Pages entry redirects here and preserves source/capture parameters.
Source code is maintained in this repository; the exact browser modules are
packaged into the existing tools Site by `scripts/sync-knowledge.mjs`.

## Storage and identity

Existing VPS Karakeep stores originals, PDF assets, text snapshots, Workspace
settings, reading state, semantic evidence, review decisions and Q&A history.
There is no second document store or separate graph service.

PT Tool supplies its existing native Site identity. The browser initializes the
existing Karakeep HttpOnly session through `/hub/open/karakeep` and calls only
same-origin native APIs. Model requests use `/__pt_knowledge/`; per-call signed
backend authorization stays on the server. Neither a separate knowledge login
nor a browser model capability is needed. The old public API transport remains
compatible for pre-update tabs and is no longer the daily path.

## Semantic graph

`semantic.mjs` validates source-internal typed triples, exact evidence spans,
both endpoint names and current content versions. Supported predicates include
uses, addresses, evaluated_on, measured_by, implements, part_of, produces and
method-level evolution. Entity-name formatting is normalized; matching triples
from multiple source carriers merge while keeping their separate evidence.

These are model-extracted interpretations with matching source evidence, not a
claim that lexical quote matching proves the predicate. Users can inspect,
confirm or ignore each relationship. Ignored or stale relationships disappear.
Cross-paper extends/improves/competition remains a separate two-source human
review workflow; duplicates of one work are not treated as independent papers.

`network.mjs` draws an animated, draggable SVG network with directional labeled
edges, neighborhood focus, search and zoom. Bibliographic source nodes are an
optional layer. Native sources and previous accepted reading/history records
are preserved when the graph is rebuilt.

## Checks

Run the Knowledge Garden model, Workspace, backend, management-graph and
semantic tests under `scripts/knowledge-garden/`. The tools Site additionally
checks its private routes, CSRF, complete browser-module packaging and legacy
redirects before building and publication.
