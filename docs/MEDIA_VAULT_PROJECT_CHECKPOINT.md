# Media Vault project checkpoint — four-source account acceptance

This document consolidates the original remaining sequence: metadata integration,
small-file transfer, larger-file/recovery, budget/retention, real source scenarios,
frontend integration, then merge/publication. Account login was a prerequisite for
using that workflow without copying a long-term security key into the browser.
It is not a replacement project or a reason to repeat completed transfer tests.

## Current checkpoint

The four-source account submission acceptance completed in remote Chrome on
2026-10-15. All four exact recipes completed through the account page, with
zero file tickets and streaming OFF. Reload, duplicate-request recovery, a second
tab and cross-tab logout passed. The window was then closed; deployment evidence
and the precise acceptance boundary are recorded below.

The dedicated Worker contains the following account task candidate:

- Cookie pairing and absolute expiry, reload recovery, shared account visibility,
  cross-tab logout and narrow administrative revocation.
- Novel catalog lookup, title filtering, chapter checkboxes/ranges (up to 100),
  explicit text-only output, and compact/standard/large EPUB layout settings.
- Task submission, transactional retry IDs, progress in chapters/pages or bytes,
  task filters, completion/expiry hints, cancellation and explicit rebuild of a
  failed/cancelled/expired account-owned task. Rebuild uses the server's saved
  canonical source/options and counts as a new job; duplicate clicks replay it.
- File metadata and native browser-save integration. The UI explains when
  transfer is closed and disables saving instead of issuing a failing ticket.
- A separate four-source account submission pilot with a
  fixed thirty-minute deadline, no file tickets and no streaming.

The text-only option previously used `text_only` while the adapter's established
contract is `skip_images`; lease translation now passes the actual preference.
EPUB layout fields are validated, canonicalized and forwarded. In-progress
novel/image counters are displayed as chapters/pages; only completed bundles use
byte totals. No adapter/VPS code change is required for this compatibility fix.

The new catalog endpoint calls only the existing fixed Media Vault metadata
service, forwards no account/Owner/Agent cookies or credentials, bounds responses
to 5 MB and 5,000 displayed chapters, and strips chapter URLs and other fields.
A separate Durable Object rate bucket permits at most six directory requests per
minute globally. Source 403/429 responses do not trigger automated retries or
access-control bypass. The login-only and fixed pilot scopes deny catalog lookup.

## What is complete, and what remains

| Original area | Current evidence | Remaining work |
| --- | --- | --- |
| Metadata / outbound agent | Existing bounded enqueue, failure, cancel, stable IDs and restart acceptance completed | No repeat unless a related change fails |
| File relay / recovery | Existing EPUB/CBZ/MP4 hashes, larger selected sample, interruption/backpressure and transfer ledger acceptance | Real account browser path and user's Windows save |
| Temporary storage | Existing exclusive job namespaces, 12 GiB volume, metadata-only D1 and protected 24-hour retention logic | Continue operational limits; no media archive in R2/KV/D1/Artifacts |
| Login | Short remote Chrome pairing, pending/approved reload, empty isolation and cross-tab logout completed; closed again | Longer-lived device observation is not established |
| Account task experience | Four fixed real source jobs completed from the account page; reload, duplicate replay, file metadata, second-tab restore and logout passed; automated Worker/SQLite and companion EPUB contract passed | General catalog/layout/rebuild controls in a real browser; account file-save acceptance |
| Novel source handling | Fixed supported-source parser and explicit chapter/text/layout options | Source login/ads/rate limits can still prevent acquisition; no borrowed local website login |
| Manga | Packaging and explicitly licensed Commons samples | General Chinese manga-provider compatibility is not delivered by this candidate |
| Production | Current production entrypoint preserved; PR remains draft | Review results, user Windows acceptance, then separate merge/publication decision |

## Completed integrated submission scope

Use a **fresh dispatch** of workflow 21 on the current staging branch. Historical
reruns retain old YAML. The candidate's `account-rc-off` operation deploys code
with access/submission/stream/UI gates closed, checks the existing schema without
migration and permits existing account-history rows. Do not reuse initial
`prepare`'s strict empty-account-table proof after browser pairing metadata exists.

The explicitly authorized and completed scope was: `account-submit-on` opens a fresh random
`submit-test-` realm for at most thirty minutes, with at most four jobs across all
approved devices. Each exact recipe can be created once; repeated public request
IDs replay the same job. Arbitrary sources, altered options and unlimited retries
are denied. Pairing/approval and cookie/database expiry are clamped to the same
window. Task access ends at expiry; jobs already submitted continue running.

| Fixed recipe | Exact bounded work |
| --- | --- |
| Novel | Wenku8 book 3551, directory index 1 (second entry), text only, one chapter |
| Image CBZ | Two named, explicitly licensed Commons pages from 國防online漫畫敘花蓮震災 |
| Video | The existing five-second samplelib MP4 |
| BitTorrent | Commit-pinned repository-owned WebSeed torrent; its small package.json payload |

The exact public inputs are in `workers/media-vault-hybrid/src/account-pilot.js`.
No public media source is assumed guaranteed available; if it rejects access,
report that result without bypassing the source or silently substituting a URL.
The 12 GiB VPS volume and existing job/download bounds remain applicable.

The integrated batch executed this sequence: open the window, pair once, approve that
exact browser through the existing server-side Owner secret, submit all four
recipes from the account page, confirm duplicate-request recovery and background
completion after reload, inspect scoped file metadata and unchanged transfer
accounting, logout across tabs, then `account-submit-off` with the public session
ID and verify stable closed routes. No source tasks are submitted automatically
by the deployment/page probe. This batch grants zero download tickets; even an
accidental streaming-switch change cannot grant a pilot account a file ticket.

A subsequent real account file-save acceptance must explicitly enable bounded
transfer and verify its Agent window. That remains distinct from the submission
pilot. Combine its three file types, logout/expiry and final shutdown in one batch.
Windows save confirmation and broader Chinese manga sources remain explicit
outstanding items rather than assumed results. Keep production publication as
its own final decision.

## Verification boundary

`npm test --prefix workers/media-vault-hybrid` includes the original suites plus
`test-account-journey.mjs`: actual browser cookie client and form normalization,
actual Worker handler and in-memory SQLite, lease/report/completion, reload,
file metadata, rebuild/cancel/logout, concurrent-device fixed-recipe caps, no-ticket
scope and deadline closure, bounded catalog and independent durable rate limiting.
Controller tests also cover range/options forwarding, disabled transfer controls
and a late catalog response after logout.

With the companion ops checkout available, run:

```bash
MEDIA_ADAPTER_SOURCE=/absolute/path/to/pt-oci-ops/services/media-vault-adapter \
  node workers/media-vault-hybrid/test-account-journey.mjs
```

This passes the exact Worker lease into the actual adapter/content/EPUB builder
against fixture source metadata, checks that no illustration request occurs and
that the generated two-chapter EPUB has valid structure and compact CSS, then
returns file metadata to the Worker journey. Temporary fixture bytes are removed
locally. This proves the field contract across components, not live source
availability or a real browser layout. The fixture contract, closed candidate deployment and live four-source browser
acceptance are separate evidence, recorded below.

## Closed candidate deployment — completed

A fresh `account-rc-off` dispatch from code commit
`2fc1422e5588e980425ccc26e0e6a99dad6ed1a6` succeeded on 2026-10-15:
https://github.com/XiminHu66/PT-Universe/actions/runs/38761447277.
That deployment used Worker version `9d905b6d-7045-4b59-abe6-faddaff48fa5`
(subsequently replaced by the submission window and its final OFF deployment).
The job repeated the full public-repository suite, checked live schema readiness
without migration, and deployed with access/submission/stream/temporary-UI flags
false, empty account realm, closed test mode and both account deadlines zero.
Post-deploy probes verified stable 404 for account page/assets, auth, jobs, quota,
submission, tickets and the new catalog route under anonymous/Owner/Agent requests.
Stream ticket/download/WebSocket and temporary preview gates stayed closed.
Transfer accounting remained 71,410,712 bytes transferred, zero reserved.

No real account-source tasks were submitted in this candidate-deployment batch.
No production entrypoint, VPS configuration or public port changed. At that earlier checkpoint the four-source scope was prepared but not activated.
The later live acceptance below advances that checkpoint. PR 104 remains a draft.


## Four-source real account acceptance — 2026-10-15

Fresh dispatches used branch `feat/media-vault-vps-engine-ready` at
`81723c0cbee4c9c0dc94e764eef982107b659a26` (code content from `2fc1422`).
The user explicitly approved the thirty-minute/four-recipe/zero-ticket scope.

| Operation | Successful workflow run | Worker version / result |
| --- | --- | --- |
| `account-submit-on` | https://github.com/XiminHu66/PT-Universe/actions/runs/38769801143 | `4a34c488-f71a-410a-b17b-190a0fea7587`; fixed deadline `2026-10-15T17:02:29.468Z` |
| Exact browser `account-approve` | https://github.com/XiminHu66/PT-Universe/actions/runs/38770293412 | `submission-test-no-transfer`; four jobs and zero tickets, same absolute deadline |
| `account-submit-off` | https://github.com/XiminHu66/PT-Universe/actions/runs/38771130862 | `54c52203-f56a-4e31-957e-9c6559b99f9d`; narrow revocation and closed-route checks passed |

Owner approval used only the existing server-side secret. No credential was
entered into the account page, exported, or saved locally. The public session ID
`817ab97ee752915503b545a3` identified the narrow cleanup target; it is not a cookie
or authorization credential.

All four recipes were selected and submitted once through the real account UI:

| Recipe | Job ID | Observed completed file | UI size (rounded) |
| --- | --- | --- | --- |
| One-chapter text-only novel | `dca57e024edd1a7f0b6b57ae` | `dca57e024edd1a7f0b6b57ae.epub` | 0.1 MiB |
| Two licensed Commons pages | `72c68c784e3df4c2e61dd101` | `72c68c784e3df4c2e61dd101.cbz` | 1.6 MiB |
| Five-second sample video | `97960aca7f892551c2d5d2f1` | `ptmv-97960aca7f892551c2d5d2f1.sample-5s [sample-5s].mp4` | 2.7 MiB |
| Pinned owned WebSeed | `78a73e4938610ab69be70c3a` | `package.json` | 0.0 MiB |

The page showed four tasks, zero processing, four completed, zero new-job
allowance and zero file tickets. All four file dialogs returned names and sizes
with disabled save controls. Completed task cards displayed approximately
24-hour source-cleanup references. No file bytes were downloaded to the browser
and no new hash or EPUB-content acceptance is claimed by this batch.

Reload recovered the same account and task list. Confirming the identical novel
request after reload returned `dca57e024edd1a7f0b6b57ae` as already existing;
count stayed four and remaining jobs stayed zero. A newly opened second tab
restored the same account and all four completed tasks without another pairing.
Logging out in the first tab cleared both lists and disabled submission;
reloading the second tab did not restore authenticated task visibility. The
completed-task filter also retained the four completed rows.

The OFF deployment succeeded at `2026-10-15T16:42:07Z`, before the original
window deadline. It disabled account access/submission, direct streaming and
temporary UI, emptied the configured realm, set test mode to closed and both
account deadlines to zero. Narrow idempotent revocation of the public session
passed, preserving unrelated and active transfers. Live probes required stable
404 for account page/assets/auth/API/submission/ticket routes under anonymous,
Owner and Agent requests. Stream ticket/download/WebSocket and temporary-preview
gates remained closed. The full public-repository suite and schema-readiness
checks passed without a live migration.

Transfer accounting remained exactly **71,410,712 bytes transferred, zero
reserved, tracking not active**, unchanged from before the window. Source
acquisition bytes are not represented as browser relay usage or a provider bill.

No production page, VPS configuration or public port changed. The broad durable
account configuration remains disabled. Catalog lookup, arbitrary chapter/layout
controls, cancellation and rebuild were outside the fixed pilot UI and remain
real-browser acceptance items despite automated coverage. Natural expiry was
not observed because the window was closed early; deadline/no-revival behavior
continues to rely on the existing clock-controlled tests.

## Next project checkpoint

Proceed in the original order without repeating completed relay/recovery work:

1. Prepare bounded account file-save acceptance using the existing EPUB/CBZ/MP4
   outputs if still retained; otherwise report expiry before proposing new jobs.
   State exact files, total byte/ticket limits, window expiry and final shutdown.
   Check the Agent transfer window and retain independent stream/account gates.
2. With that concrete transfer scope explicitly authorized, run all three account
   browser saves, logout/expiry cleanup and final OFF accounting in one batch.
   Confirm actual disk results separately; remote Chrome does not establish the
   user's Windows save behavior.
3. Complete real-browser general catalog/chapter/layout/rebuild acceptance under
   a separately bounded scope, and document broader Chinese manga-provider
   support or failures explicitly. Licensed Commons success is not general
   Chinese manga compatibility. Longer device persistence is also unproven.
4. Review the remaining acceptance results, then make a separate merge and
   production-publication decision. PR 104 stays draft until that decision.
