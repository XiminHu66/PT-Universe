# Knowledge Garden graph and record management

The PT Universe page remains the only user interface. Original files, native
lists, text snapshots, extraction and review records remain in existing VPS
Karakeep storage. No additional graph database, account or synchronization is
introduced.

## Record management

Cards expose Edit and Delete; Workspace rows expose an explicit settings menu.
Source titles, notes, reading state, category, saving reason and memberships can
be edited. Delete stores `trashedAt` in the existing native metadata. Workspace
delete hides only its native list, preserving originals and memberships. The
Trash view restores the same identities, indexes and Workspace configuration.
Historical answers retain their evidence snapshots. A deleted Workspace's
answers remain accessible in the all-library history until it is restored.
There is intentionally no permanent-purge operation in this change.

## SurveyGraph adaptation

Reference: Yuan et al., *SurveyGraph: Generating Academic Surveys via
Methods-Entity Knowledge Graphs*, arXiv:2610.31317v1, and
https://github.com/xzzvsxd/SurveyGraph.

This is a lightweight adaptation of the MEKG concepts, not an installation of
the upstream Python pipeline or a reproduction of its reported benchmarks:

- Method, Task, Dataset, Metric, Model and Innovation entities, plus Tool/Concept.
- Formatting-normalized entity identities with original source quotes retained.
- `extends`, `improves`, `applies`, `competes_with`, `compares_with`, `supports`,
  `contradicts` candidates with two-sided quotes and explicit direction.
- Quote matching, source-version checks, a 0.6 candidate-confidence floor and
  human review before semantic edges enter retrieval. Confidence is an
  uncalibrated model score, not proof of correctness.
- Shared Method/Task/Dataset links mean co-mention only, never a semantic claim.
- Weighted local PageRank and connected components suggest core sources and
  topic outlines. There is no fabricated citation, publication-year or author
  signal, so ranking does not claim academic influence.
- BM25 anchors stay first; up to four one-hop neighbors receive bounded slots
  within the first 20 model-context chunks. Both endpoints remain inside the
  explicit Workspace/reading scope. Relation evidence informs organization;
  final answers must still cite exact retrieved text.
- Long inputs are sampled across the document, including later sections. Saved
  extraction coverage records the supplied versus total character count.
  This is not a claim that the model read every page.

One-click organization processes up to eight sources at a time. Each successful
extraction is saved independently; stopping keeps completed work. Model calls
use the existing replaceable free-model backend. New semantic edges always
remain candidates until reviewed.

## Validation

Run the existing model, Workspace and backend tests, plus
`node scripts/knowledge-garden/management-graph-test.mjs`. The added regressions
cover durable restore, hidden-source isolation, Workspace source preservation,
version-invalidated edges, semantic review, local ranking, long-document
sampling, and graph evidence inside the actual model-context budget.
