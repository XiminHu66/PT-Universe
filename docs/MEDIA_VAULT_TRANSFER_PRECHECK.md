# Media Vault transfer acceptance status

Updated: 2026-10-14.

## Completed prerequisite fixes

Task completion and file metadata commit together. Transfer ticket expiry, reservation and settlement commit atomically. Concurrent requests cannot release an expired reservation twice or exceed the application budget. Offline transfers and missing file metadata release their reservations. Redemption rechecks expiry; failed settlement retains in-memory state for retry, and duplicate settlement does not double-count bytes.

Backend filenames containing brackets or Unicode are accepted within the existing safe file roots. This fixes completed video tasks being reported without a usable file. Directory traversal and symlink escape checks remain covered by regression tests.

Temporary test streaming has a deadline, a small-file cap and automatic shutdown protection. Tests cover expired-window refusal and cancellation of an already connected relay. The standalone test page uses a short-lived, fixed-file browser session. Existing Owner authorization approves its public request ID inside the server-side workflow; no Owner credential is exported or entered into the page. The browser cookie is Secure, HttpOnly and SameSite=Strict; only its digest is stored in metadata.

## Real small-file server transfer acceptance

The user explicitly authorized a temporary test window. Three existing small sample files streamed through the deployed relay to an authenticated HTTP consumer. The consumer computed incremental hashes without persisting media bytes in a workspace or artifact. This does not prove native-browser disk saving.

| Format | Bytes | SHA-256 |
| --- | ---: | --- |
| EPUB | 52,742 | 2ab0a5e930c3ac62555feb089f1a95ffbc578743708265678e5681866bbb73cd |
| CBZ | 1,632,158 | 0987073904ca95c4d27a9e8e93ebc1afba3a856cef7b6371ba3b46f58ebe1a51 |
| MP4 | 2,848,208 | 05bd857af7f70bf51b6aac1144046973bf3325c9101a554bc27dc9607dbbd8f5 |

All receiver hashes and sizes matched their source files. Each redeemed ticket returned HTTP 403 on replay. The byte ledger increased by exactly 4,533,108 bytes; outstanding reservations returned to zero. Recovery source files remained present with the same hashes after transfer and shutdown.

Public transfer test evidence: https://github.com/XiminHu66/PT-Universe/actions/runs/38623610861

Both streaming switches were restored to OFF. Live checks confirmed unavailable ticket/download/connection entry points, inactive tracking and unchanged final byte counters. The test page was disabled. Production pages and public application ports were unchanged; both pull requests remain drafts.

Public shutdown evidence (latest attempt): https://github.com/XiminHu66/PT-Universe/actions/runs/38623901247

## Real native-browser small-file saving acceptance

The user explicitly approved the temporary pairing mechanism: three fixed test files, an approval lifetime of at most 15 minutes, at most six one-use tickets, and no Owner or Agent capabilities. Role isolation, same-origin checks, hashed session storage, expiry, concurrent caps and scoped revocation passed the SQLite-backed regression group.

A controlled remote Chrome browser used the standalone acceptance page to download the same EPUB, CBZ and MP4 files through native download events. Each event returned a completed saved-file path. The actual saved bytes were read from disk and matched the VPS source sizes and SHA-256 values in the table above. EPUB mimetype/ZIP integrity, CBZ page order/attribution/ZIP integrity and MP4 file signature also passed. This proves native saving in the controlled Chrome environment; it does not claim that files were written to the user's Windows computer.

The new browser transfer increased the byte ledger by exactly 4,533,108 bytes, from 4,533,108 to 9,066,216. Outstanding reservations returned to zero. Replay of the last native-download ticket returned HTTP 403.

Both streaming switches were restored to OFF. The server-side revocation workflow succeeded, the existing browser's acceptance API returned HTTP 404, and the test page was disabled. Final live gate checks reported transferred_bytes=9066216, reserved_bytes=0 and tracking=not_active. The three VPS recovery copies remained present with identical hashes after shutdown. No production frontend deployment or public application port change occurred. Both PRs remain drafts.

The agent startup verification initially failed with exit 141 because grep's early exit closed a pipe while pipefail was active. The check now consumes complete log output. A large synthetic log check and the rerun passed; startup connection, automatic rollback, source integrity and shutdown checks all completed.

Public temporary-session preparation: https://github.com/XiminHu66/PT-Universe/actions/runs/38626988140
Public limited-session approval: https://github.com/XiminHu66/PT-Universe/actions/runs/38627785722
Public temporary streaming gate: https://github.com/XiminHu66/PT-Universe/actions/runs/38627920548
Public revocation and final shutdown: https://github.com/XiminHu66/PT-Universe/actions/runs/38628475426

## Pending original release gates

Continue active-transfer interruption and process-loss recovery, stale reservation recovery, cancellation/backpressure/rate limits, larger files, retention cleanup, source coverage and final frontend browser integration. User-device Windows saving remains a separate environment check. Do not merge or deploy the production frontend based solely on small-file acceptance.
