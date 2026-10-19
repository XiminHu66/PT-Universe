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

## Interrupted-transfer and process-loss recovery acceptance

Durable relay state now stores only the transfer ID, hashed ticket digest, month, expected size, attempted/confirmed byte counters, deadline and terminal outcome. No media bytes are written to Durable Object storage, D1, R2, KV, Actions artifacts or a cloud file archive. A 120-second idle alarm settles stalled transfers, and failed ledger settlement schedules a retry. Atomic ticket redemption now happens inside the initialized relay, preventing recovery from misclassifying a newly claimed ticket.

On relay process loss, a fresh instance settles its durable checkpoint and rejects reuse of the old ticket. Ordinary interruption counts bytes accepted by the forwarding pipeline, not bytes saved to disk. If a process dies with an unconfirmed frame in flight, recovery conservatively counts its attempted upper bound (at most one 256 KiB frame above confirmed bytes). An active ticket lost between claim and checkpoint uses its full reserved upper bound. These conservative recovery values protect the application budget; they are not a measurement of the user's saved bytes or the Oracle tenancy's actual billing. All settlement paths use the active-ticket guard so duplicate callbacks or restarts cannot credit twice.

SQLite-backed fault injection covers confirmed and in-flight process loss, claim/checkpoint orphan recovery, idle alarms, automatic consumer cancellation, ledger failure followed by process loss, terminal outcome preservation, and concurrent redemption. The four Worker test groups and ten agent tests passed.

A real process-loss test paused the existing small MP4 after its first acknowledged 262,144-byte frame, sent SIGKILL to only the hybrid agent, and recreated that agent with its fault hook removed. Recovery sources stayed available. The HTTP consumer received a truncated response; reserved bytes returned to zero, and the old ticket returned HTTP 403. A new ticket transferred the complete 2,848,208-byte MP4 with the source SHA-256.

A separate consumer cancellation received 16,384 bytes before aborting. The forwarding pipeline had accepted one 262,144-byte frame, which was counted; the remaining reservation was released. A new ticket again transferred the complete MP4 with the matching source hash. Successful retries download the file from the beginning.

The first two diagnostic runs exposed that a normal TransformStream did not preserve the manually supplied physical HTTP Content-Length: the 262,144-byte truncated response could end as normal EOF. The relay now uses the Workers native FixedLengthStream, and live checks verify the physical source length and an explicit interrupted-body error. Reference: https://developers.cloudflare.com/workers/runtime-apis/response/

| Successful recovery case | Bytes counted | Reservation after settlement |
| --- | ---: | ---: |
| Agent process loss after first acknowledged frame | 262,144 | 0 |
| Full retry after process loss | 2,848,208 | 0 |
| Consumer cancellation after first frame | 262,144 | 0 |
| Full retry after cancellation | 2,848,208 | 0 |
| Total for the successful acceptance run | 6,220,704 | 0 |

The two earlier diagnostic interruptions added 524,288 bytes in total and remain in the ledger. Starting from the previous 9,066,216-byte total, all runs in this stage added 6,744,992 bytes; the final counter is 15,811,208.

Both streaming switches were restored to OFF. Final live checks confirmed transferred_bytes=15811208, reserved_bytes=0 and tracking=not_active; the temporary acceptance sessions were revoked. The fault watcher and rollback timer were stopped, and test-only runtime flags were removed. All three retained source files still matched their earlier sizes and hashes after shutdown. Production pages and public application ports were unchanged. Both PRs remain drafts.

Public recovery acceptance, latest successful attempt: https://github.com/XiminHu66/PT-Universe/actions/runs/38631781348
Public shutdown at the interrupted-transfer stage: https://github.com/XiminHu66/PT-Universe/actions/runs/38632971815/job/116088978071

## Bounded backpressure, concurrency and rate acceptance

The relay admits one connected outbound agent and one active file transfer. A second agent receives HTTP 409 with Retry-After: 5. A competing download receives HTTP 429 with Retry-After: 2; its own ticket reservation is released while the active transfer's reservation stays intact. The relay remains busy until it has sent the terminal acknowledgement.

Only one media frame may wait for acknowledgement at a time. A premature second frame fails the transfer instead of accumulating a writable queue or overwriting the pending byte bound. Slow-reader ACK withholding and premature-frame handling have direct relay regression coverage.

Validated authenticated file-ticket requests share a persisted rolling limit of twelve permits per sixty seconds. Only timestamps are stored; the rate count survives relay reconstruction. SQL permits at most six unexpired, unredeemed tickets globally, with reservation changes in the same transaction. The metadata job queue now inserts conditionally so concurrent submissions cannot exceed five pending jobs. SQLite tests passed twenty concurrent ticket requests, rate-window reset/reconstruction, concurrent expiry and twelve concurrent metadata-job submissions. Metadata-job flood testing ran only in the local SQLite fixture and did not create new source downloads.

Real deployed acceptance used the existing small MP4 and EPUB only:

| Case | Observed result |
| --- | --- |
| Duplicate authenticated agent | HTTP 409; existing connection preserved |
| Simultaneous redemption of one ticket | Exactly one HTTP 200 and one HTTP 403 |
| Competing download during the MP4 stream | HTTP 429, Retry-After: 2; 2,848,208 active reserved bytes preserved |
| Paced MP4 consumer | 34 reads, 5,335 ms; complete size/hash matched; reservation zero |
| Fourteen concurrent valid ticket requests | Six issued, eight HTTP 429; retry hints present; rate gate activated |
| Redemption of all six issued EPUB tickets | All complete sizes/hashes matched; every used ticket replay rejected |

The successful run transferred exactly 3,164,660 bytes: one MP4 plus six copies of the existing EPUB. The cumulative counter increased from 15,811,208 to 18,975,868, with reserved_bytes=0. No new media sources were fetched and no media archive or Actions artifact was created. This is bounded small-file flow-control acceptance, not a measurement of long-duration or maximum-size transfer performance.

One initial deployment check saw enabled health followed by an OFF-route response at another request boundary. The stream-on verification now requires two complete consecutive bundles to agree on health, quota tracking and both wrong-role refusals. The corrected live gate passed before the VPS stream was enabled.

Both streaming switches were restored to OFF. Final checks reported transferred_bytes=18975868, reserved_bytes=0 and tracking=not_active. Temporary sessions were revoked; test-only runtime flags, the fault watcher and rollback timer were cleared. All three source copies retained their earlier sizes and hashes after shutdown. Production frontend pages and public application ports were unchanged; both PRs remain drafts.

Public flow-control acceptance: https://github.com/XiminHu66/PT-Universe/actions/runs/38635711894/job/116098222556
Public final shutdown for this stage: https://github.com/XiminHu66/PT-Universe/actions/runs/38632971815/job/116098748718

## Selected larger file and long paced receiver (2026-10-14)

The isolated test window admitted one Owner-selected video job above the existing 10 MiB acceptance cap, with a hard 32 MiB ceiling on both Worker and VPS. The larger-file exception required the exact job ID and a future 20-minute test deadline. Browser pairing was not enabled for this window; session tickets retain their small-file scope. Defaults remain streaming OFF.

The normal authenticated video job prepared the public Samplelib 30-second MP4 (https://samplelib.com/mp4/sample-30s.mp4), rather than inserting synthetic completed-job metadata. Its actual size was 21,657,943 bytes and its VPS SHA-256 was `500afe4eeb535c5ecd1c205e18be8c3db97dce216088e57fdad8e08a3a4028c3`. The initial preparation script incorrectly rejected the job API's successful HTTP 202; it was corrected to accept successful statuses and reused the already-submitted job, avoiding a duplicate source download.

| Case | Observed result |
| --- | --- |
| Normal larger-file receiver | 21,657,943 bytes in 29,391 ms; full source hash matched |
| Long paced receiver | 21,657,943 bytes in 204,306 ms; 339 bounded reads; full source hash matched |
| Both completed tickets | Replay HTTP 403; reservations zero after each transfer |
| Transfer ledger | 18,975,868 → 62,291,754; exact delta 43,315,886 bytes |
| Receiver process RSS | Baseline 81,276,928 bytes; observed peak 101,519,360 bytes |
| VPS sampling (76 observations) | Agent PID 1 RSS peak 32,784,384 bytes; adapter PID 1 RSS peak 33,800,192 bytes |
| VPS root free space | Minimum 39,789,051,904 bytes, above the 21 GiB floor |

The receiver hashed bounded slices without collecting the complete file or writing a media artifact. This verifies a progressing transfer lasting longer than the 120-second idle timeout; it does not test a 120-second stall, GiB-scale files, maximum concurrency, Cloudflare process RSS, or user-device Windows saving. Earlier stalled-reader/alarm behavior remains separately covered by fault injection.

Worker tests, eleven Agent unit tests, workflow YAML parsing and shell syntax checks passed. Post-test shutdown verified streaming OFF at both ends, authenticated metadata polling, revoked browser sessions, removal of all temporary runtime parameters, stopped resource/fault services and rollback timer, transferred_bytes=62291754, reserved_bytes=0 and tracking=not_active. All four VPS sources retained their full sizes and hashes after shutdown; the capped recovery copy remains subject to the existing 24-hour retention policy. No media archive, new public application port, production frontend deployment or PR merge occurred.

Public larger-file acceptance: https://github.com/XiminHu66/PT-Universe/actions/runs/38638351556/job/116107218452
Public shutdown for this stage: https://github.com/XiminHu66/PT-Universe/actions/runs/38632971815/job/116109541790

## Pending original release gates

Real VPS agent process loss, HTTP-consumer interruption and bounded small-file concurrency/rate control are verified. Relay reconstruction, orphan recovery, alarm handling and slow-reader ACK behavior have fault-injection coverage. No claim is made that an actual Cloudflare host was forcibly terminated or that this small-file run proves maximum-size memory/performance limits.

The selected 21.66 MB file and 204-second paced receiver are now verified. Continue retention cleanup, source coverage and final frontend browser integration; GiB-scale and maximum-load testing remain outside these bounded results. Native-browser interrupted-save handling and user-device Windows saving remain separate environment checks. Do not merge or deploy the production frontend based solely on these bounded passes.
