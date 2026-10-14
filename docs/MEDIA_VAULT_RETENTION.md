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

## Remaining work

Verify source-specific ownership for shared torrent paths and incomplete downloads before enabling their automatic cleanup. Continue source coverage, then final frontend and native-browser integration. Production frontend publication and PR merge remain separate release gates.
