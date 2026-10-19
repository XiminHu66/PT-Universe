# Media Vault retention gate

This document updates the retention item in MEDIA_VAULT_TRANSFER_PRECHECK.md. Source coverage and final frontend integration remain pending; keep the staging PRs in draft.

## Behavior

- A valid completion timestamp and the configured retention age are required before cleanup.
- Pending or active downloads retain their source. Active local reads remain pinned until completion, failure or cancellation.
- Cloud metadata expiry must acknowledge the change before filesystem deletion. Expiry invalidates file availability and prevents new ticket issuance or redemption.
- Cleanup uses a durable per-job manifest and checks file and directory identity. Unexpected files, symlinks, hardlinks and paths without exclusive ownership are retained.
- Metadata failures postpone deletion. Partial deletion can resume from persisted state in a new process; completed cleanup keeps an idempotency tombstone.

## Validation scope

Isolated fixtures cover the age boundary, active reads, metadata failure, partial deletion, process restart and unrelated-file protection. SQLite fixtures cover atomic metadata invalidation, transaction rollback, idempotent reservation release and the issuance/expiry race. Live checks cover refusal of premature expiry and preservation of existing source metadata. Streaming remains disabled by default.

Fixture time was advanced only inside disposable test directories. A full natural retention interval was not observed in this stage. Busy transfers, unavailable metadata services and changed identity intentionally defer cleanup.

## Source ownership coverage

New aria2 jobs use separate directories and a stable per-job engine identifier. A lost submission response can only recover an engine task whose directory and source match. Torrent metadata completion is distinct from payload completion; bounded child-task traversal also propagates cancellation to child downloads.

The internal retention manifest includes owned nested payloads, control sidecars and generated/video partial files only after their writer is stopped. Failed and cancelled jobs require the normal retention-age floor plus a stable observation interval. Restarted writers, unexpected files and changed identities postpone cleanup. Legacy shared directories remain excluded from automatic deletion.

A controlled trackerless WebSeed fixture exercises metadata-to-payload following and namespace confinement. Explicit conservative task options passed this controlled regression after inherited engine settings stalled the first attempt. The exact individual setting responsible was not isolated. This test does not establish compatibility or availability for arbitrary magnets, swarms, private trackers or authenticated media sources.

## Remaining work

Keep legacy shared files for explicit ownership review. New namespaced torrent tasks and stopped partial downloads now have isolated ownership/cleanup coverage. Continue final frontend and native-browser integration, with source-specific capability limits stated explicitly. Production frontend publication and PR merge remain separate release gates.
