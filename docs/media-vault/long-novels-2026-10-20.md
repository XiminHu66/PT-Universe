# Long-novel VPS downloads — 2026-10-20

The 100-chapter restriction existed independently in the main page, account form/controller, Worker contract, adapter and EPUB builder. Worker JSON was additionally capped at 12,000 characters and adapter JSON at 16 KiB. The main page also sent `titleAlign` and `textAlign`, which the numeric-only backend layout contract rejected. Its `skip_images` checkbox value was dropped by the account-client field allowlist; this is now forwarded and covered by the real main-page submission test.

The new limit is **10,000 selected chapters per task**. Job submission permits bounded 128 KiB JSON at the Owner/account/adapter routes; other control bodies retain their smaller limits. Duplicate, invalid and out-of-catalog indices remain rejected. All seven existing page layout options are accepted and rendered in the VPS EPUB.

The chapter chooser displays 200 rows per page while keeping the full selection. Selecting all and entering a range still operate on the whole catalog. The output is one EPUB. Entries are compressed individually, with the uncompressed `mimetype` first, and the packager retains navigation/manifest metadata rather than all chapter XML and images. The 100 MiB acquired-content/archive limits and disk reserve remain in effect. Novel illustrations no longer share the comic's 80-page cap; CBZ limits are unchanged.

Each new novel task stores its validated specification and committed chapter/image checkpoints in its own private SQLite file. On adapter restart, the Agent first verifies that the cloud task remains active, then resumes that exact job. Cancelled/terminal cloud tasks are not resumed. Retrying a failed/cancelled task through the account API can reuse its checkpoint only after the Worker verifies account ownership and the adapter verifies an identical stopped selection. Clients cannot name an arbitrary checkpoint. Missing/expired checkpoints fall back to a fresh acquisition. A changed catalog or corrupt image checkpoint stops instead of silently publishing the wrong content. Completed chapter progress does not move backward during reconstruction.

Checkpoint files are excluded from downloads and included in the existing owned 24-hour retention manifest. No public port, new grant, source login or storage service was added. Source requests remain sequential with the existing eight-second chapter interval; access/rate rejection is not automatically retried. Very long books can therefore take hours, and the page may be closed while the VPS works.

## Validation scope

- Adapter: 87 tests, including complete ordered 10,000-chapter EPUB/nav/spine, compressed entries, a 512-chapter memory bound, 251-chapter interruption/reuse, more than 80 illustrations, image integrity, bounded HTTP bodies, checkpoint ownership/retention, and actual adapter restart after 128 of 301 chapters.
- Agent: 43 tests, including cloud-status verification before resuming a local task, and cancellation winning over resume.
- Actual SQLite Worker/device/Owner requests accept and lease a 10,000-chapter body; invalid/oversized/duplicate selections, layout injection and cross-account checkpoint access are rejected.
- Companion integration executes 1,001 chapters through the real account client, Worker, Agent, adapter and EPUB builder using offline source fixtures. Full 10,000-chapter internet acquisition has not been performed.
- The deployment also checks the exact deployed source hashes and builds/verifies a synthetic 10,000-chapter EPUB inside the running VPS container without source requests. Browser CI checks the main page's 1,001-chapter selection, pagination, layout payload and submission.


Deployment checks passed in private run 39464746206 (job 118773092906): exact deployed adapter/builders/content/Agent hashes matched, 87 adapter and 43 Agent tests passed, and the running container produced a valid 10,000-chapter 3,338,374-byte synthetic EPUB with 37,536 KiB maximum process RSS. Source requests in that container proof: zero. The Worker update passed in run 39359943380, job 118773433889 (version 695c6af8-4e72-45ce-b4d9-c046e423e82c). Final browser publication includes the subsequently discovered text-only forwarding correction.
