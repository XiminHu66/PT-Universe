# Media Vault transfer acceptance status

Updated: 2026-10-14.

## Completed prerequisite fixes

Task completion and file metadata commit together. Transfer ticket expiry, reservation and settlement commit atomically. Concurrent requests cannot release an expired reservation twice or exceed the application budget. Offline transfers and missing file metadata release their reservations. Redemption rechecks expiry; failed settlement retains in-memory state for retry, and duplicate settlement does not double-count bytes.

Backend filenames containing brackets or Unicode are accepted within the existing safe file roots. This fixes completed video tasks being reported without a usable file. Directory traversal and symlink escape checks remain covered by regression tests.

Temporary test streaming has a deadline, a small-file cap and automatic shutdown protection. Tests cover expired-window refusal and cancellation of an already connected relay. The standalone test page uses existing owner authentication and does not persist credentials.

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

## Pending original release gates

Native-browser saving remains unverified because the secure owner credential request was declined. No browser credential entry was repeated or bypassed. When browser authentication is available, resume the original EPUB/CBZ/MP4 native-save gate with local size/hash verification.

Then continue active-transfer interruption and process-loss recovery, stale reservation recovery, cancellation/backpressure/rate limits, larger files, retention cleanup, source coverage and final frontend browser integration. Do not merge or deploy the production frontend based solely on the server transfer pass.
