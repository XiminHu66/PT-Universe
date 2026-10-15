# Media Vault project checkpoint — novel workflow candidate

This document consolidates the original remaining sequence: metadata integration,
small-file transfer, larger-file/recovery, budget/retention, real source scenarios,
frontend integration, then merge/publication. Account login was a prerequisite for
using that workflow without copying a long-term security key into the browser.
It is not a replacement project or a reason to repeat completed transfer tests.

## Current checkpoint

Current integration work and the complete original-plan mapping are maintained
in `MEDIA_VAULT_REMAINING_PLAN.md`. The next closed candidate fixes canonical
submission, cooperative source cancellation and cumulative content bounds, and
adds a real offline Agent/adapter contract plus explicit unresolved release gates.
This does not supersede the real-browser block or claim those acceptances passed.

Latest attempt: the authorized novel workflow window deployed, but remote
Chrome could not open the account page (`ERR_BLOCKED_BY_CLIENT` and a browser
URL-policy denial on error-tab inspection). No pairing or source work occurred.
The window has closed and the independent strict check passed; see the final section.
Real chapter/layout/cancel/rebuild acceptance is still pending. Earlier completed
four-source and three-file checkpoints below remain valid.

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


## Three-file account save candidate — prepared, not activated

The next candidate adds a distinct `files` account mode rather than enabling the
broad seven-day/five-job/one-hundred-ticket contract. Only the existing novel,
CBZ and MP4 jobs in the acceptance table above are eligible; BT is excluded.
No account-job mapping is imported or rewritten and no new source job is created.

- Absolute twenty-minute account/stream deadline; one approved browser device.
- Existing account ownership plus exact job/path/size allowlist at issuance and
  redemption. Missing, changed, incomplete or older-than-23-hour metadata stops
  preflight; no automatic source retry or substitution.
- Three issued tickets across the account/window, one per file, aggregate at
  most 10 MiB. Failed/expired/revoked tickets still consume that window's allowance.
  A replacement approved session cannot reset it. SQL transactions enforce
  concurrent account/per-file/byte checks and retain the global transfer budget.
- No new submission, cancellation, rebuild or catalog lookup. Owner/temporary
  browser roles cannot mint parallel tickets while this account window is active.
- Invalid scope, accidental submission enabling, expiry, logout and narrow
  administrative revocation deny account access/tickets. Pending reservations
  are released precisely; active/unrelated transfers preserve their prior rules.
- Source selectors are hidden in this Worker-only file view. The banner states
  the three-file/three-ticket/10-MiB bounds and tells users to confirm disk saves
  in the browser, without claiming success when a native download is handed off.

Workflow 21 adds `account-files-check` (read-only metadata and closed-route
checks), `account-files-on` (explicit activation only) and `account-files-off`.
The on operation rechecks retained file metadata and the absence of approved
sessions/prior account tickets, writes its runtime selection only on the runner,
and never outputs credentials. The off operation empties that selection and
resets the account/stream deadlines along with the existing independent gates.
The base configuration and production entrypoint remain unchanged.

`test-account-files.mjs` uses the actual Worker/SQLite handler for concurrent
single-file issuance, account-wide allowance across replacement sessions,
wrong files/roles, disabled mutations, expiry/no revival, and exact logout
reservation release. Existing transport and native-saver tests remain required.
This is preparation and automated evidence, not real account byte-transfer or
Windows disk-save acceptance. Read-only live file/VPS evidence and the closed
candidate deployment are recorded after their workflows complete.


## Bounded account save readiness

The full Worker suite and closed candidate deployment passed. Read-only live
checks confirmed that the three existing EPUB/CBZ/MP4 outputs are still retained,
complete, within the prepared byte cap, and consistent between metadata and
source storage. Archive/header integrity checks passed. No account download
ticket or media transfer occurred. Account access and streaming remain OFF.
No production page or public application port changed.

The next batch requires action-time confirmation to enable the prepared
one-device, three-file, three-ticket, at-most-10-MiB account save scope and the
independent outbound Agent stream window, each for at most twenty minutes.
Save each selected file once, compare downloaded integrity, logout/revoke,
close both windows and reconcile accounting. Stop and close on failure; do not
silently retry, reset allowance or create replacement jobs. User Windows saving
and broader catalog/layout/rebuild/provider acceptance remain separate open
items in the original plan. PR 104 remains draft; publication is a later decision.


## Three-file account native-save checkpoint — completed 2026-10-15

This checkpoint supersedes the preceding preparation-only status. The user
confirmed the one-device, three-file, three-ticket, at-most-10-MiB account
window and independent twenty-minute outbound stream window. Retained-file
preflight passed without creating replacement jobs. One scoped browser was
approved with zero task-submission allowance.

All three existing files were saved once through the real account page and
native remote Chrome download flow. Completed disk files were read back and
matched the retained-source size and SHA-256 exactly: EPUB, CBZ and MP4, total
4,533,108 bytes. EPUB ZIP CRC/mimetype, CBZ two-page archive/attribution and
MP4 header checks also passed. No repeated download or replacement ticket was
requested. The account displayed zero remaining tickets after the third save.
The transferred-byte ledger increased by exactly the same total, with zero
reserved bytes.

Logout completed; refreshed page state cleared account tasks. The close operation
also narrowly revoked the accepted session. Worker deployment restored every
account/stream/temporary UI gate to OFF, empty file selection and zero test
deadlines. VPS stream shutdown passed, removed test flags/stopped its rollback
watchers and restored authenticated metadata polling. No public application
port, production page or live schema migration changed.

The initial post-deployment account closure probe failed because a pairing
endpoint still returned a success response. This failure is retained, not treated
as a passing run. Deployment propagation is a possible explanation, not a proven
root cause. Add `account-off-check` as a separate no-deployment closure operation
and include the actual unexpected status in future assertion errors. Its fresh
run passed the unchanged strict checks: stable 404 for anonymous/Owner/Agent
account page/assets/session/pairing/jobs/quota/ticket routes; stream/download/
WebSocket and temporary UI closure; unchanged final ledger, zero reservations.
No successful response is tolerated by this check. Targeted OFF/migration tests
and workflow YAML parsing passed; no account or stream permission was re-enabled.

### Remaining work in the original plan

1. The remote account-native save path is now proven. The user's own Windows
   browser/disk behavior remains unverified; this run does not prove it. Any
   later live device acceptance needs its own bounded scope and may not reset
   or reuse this spent three-ticket allowance silently.
2. Complete real-browser general catalog/chapter/text/layout/cancel/rebuild
   acceptance, longer session persistence and broader Chinese manga-provider
   support, with explicit limits. The successful fixed Commons CBZ does not
   establish general provider compatibility or unrestricted source access.
3. Review the complete acceptance results and final integration UX, then make
   the separate merge and production-publication decision. PR 104 remains draft.


## Novel workflow checkpoint — prepared 2026-10-15, activation pending

The next original-plan item now has a concrete implementation and bounded
acceptance mode. This advances catalog/chapter/layout/cancel/rebuild work; it
does not repeat the completed three-file relay acceptance or open broad account
access. Production remains unchanged and PR 104 remains draft.

The account UI now supports selecting the filtered chapter results (up to 100),
a visible selected count, loaded-catalog bounds checking, and explicit empty or
out-of-range feedback. Changing source/type or ending the session invalidates
in-flight catalog results. Cancel and rebuild require a confirmation dialog;
rebuild sends only the prior job reference and uses the server-owned canonical
request. A newly approved login clears stale authentication errors. The limited
novel mode locks the source, task kind and text-only preference while retaining
real catalog/chapter/layout controls.

### Concrete next live scope

- At most thirty minutes and one approved browser device in a fresh isolated realm.
- Only `https://www.wenku8.net/book/3551.htm`, chapter indices 0 and/or 1
  (UI chapters 1–2), always text-only, with one of compact/standard/large presets.
- Four account-wide jobs total, including rebuilds. Atomic SQL enforces the cap;
  logout and replacement approval cannot reset the allowance.
- Fixed-source catalog lookup, cancellation and canonical rebuild are permitted.
  Zero download tickets; Worker and outbound Agent streaming stay OFF.
- `account-novel-on` validates the closed starting state and fresh realm without
  a migration. `account-novel-off` closes access/submission and resets deadlines.
  The default configuration stays closed. Enabling this scope is a separate,
  concrete action-time confirmation; it has not happened in this checkpoint.

Execute the real controls in one batch: read/filter catalog, select the first
one/two chapters, inspect all three layout previews, submit/cancel one compact
request and rebuild it, then submit standard and large recipes. Do not exceed
four jobs or silently reset the window if a source fails or cancellation arrives
after completion. Confirm results, reload/session recovery, logout/revoke and
final closed-route/unchanged transfer accounting. Source rejection is recorded
as a result; no access-control bypass or source substitution is allowed.

### Automated evidence and remaining boundary

The complete Worker suite passes. New actual-controller tests verify filtered
selection/counts/bounds and no cancel/rebuild request before confirmation.
The actual Worker with SQLite verifies fixed catalog metadata, recipe rejection,
canonical rebuild, concurrent four-job caps across session replacement, one
device, expiry, no tickets and no transfer ledger writes. All three exact leased
layout payloads also execute through the companion adapter and EPUB builder
against local source fixtures; packaged CSS matches every preset field and no
illustrations are requested. This is component-contract evidence, not a live
source or browser-visual acceptance claim.

After the bounded live novel workflow, remaining original-plan items are the
user's Windows save behavior, longer device persistence, broader Chinese manga
provider coverage, final integration review and a separate merge/publication
decision. Previously completed metadata/relay/recovery/retention tests need not
be repeated unless a relevant implementation changes.


### Closed novel candidate deployment — completed

Fresh workflow run https://github.com/XiminHu66/PT-Universe/actions/runs/38785612728
succeeded from code commit `715be897204e45f5f1caf988feac82c731572093`.
The runner repeated the full Worker suite and read-only release/schema readiness,
then deployed Worker version `bae6d2af-94eb-40b6-8557-8b315a50b4ac` with
account access/submission, streaming and temporary UI OFF, closed test mode,
empty realm and all account/stream deadlines zero. No live migration occurred.

Post-deployment strict probes passed: stable 404 for anonymous/Owner/Agent account
page/assets/session/pairing/jobs/quota/tickets; stream ticket/download/WebSocket
and temporary preview closed. The ledger stayed 75,943,820 bytes transferred,
zero reserved, tracking not active. No source jobs, approved sessions or media
transfer were created in this batch. Production and VPS configuration were not
changed. The prepared novel-ux window remains unactivated, awaiting its concrete
access confirmation. PR 104 stays draft.


## Authorized novel live attempt — browser access blocked, 2026-10-15

The user confirmed the exact thirty-minute/one-device/four-job/zero-ticket novel
scope. Fresh `account-novel-on` run
https://github.com/XiminHu66/PT-Universe/actions/runs/38792185508 succeeded from
`6d416036bd34e671ecfefd386f35215f2de7201d`. Worker version
`47790b08-ec97-49b1-9599-0f0237ac7352` had a fixed deadline of
`2026-10-15T19:44:17.724Z`; streaming stayed OFF. Read-only fresh-realm readiness
and deployment page/assets/unauthenticated-role probes passed. The probe creates
no browser session, and these checks are not real account UI acceptance.

Opening the dedicated account URL in remote Chrome returned
`net::ERR_BLOCKED_BY_CLIENT`. An attempt to inspect the resulting Chrome error
tab was then rejected by the browser URL security policy. Stop the browser
attempt; do not route around this restriction using another surface or direct
browser commands. This does not establish that the novel source rejected access
or that the service was unavailable. No pairing/approval, source job, catalog
request or file download was performed by this browser batch. Real chapter,
layout, cancellation and rebuild acceptance remains incomplete.

Immediately dispatch `account-novel-off`:
https://github.com/XiminHu66/PT-Universe/actions/runs/38792395793.
The closed config deployed as Worker version
`fb6e67c7-476c-411f-8e41-a038fd18109d`, with access/submission/stream/UI OFF,
empty realm, closed mode and all deadlines reset. The immediate account closure
probe failed on `GET /app/account.html status=200`. Preserve that failed result;
do not describe it as a passing shutdown run. The stream/temporary UI probes
passed and accounting stayed 75,943,820 transferred, zero reserved, not active.
The cause of the immediate old-page response is not proven. Use the existing
independent no-deployment `account-off-check` to establish the final closed
state without weakening assertions or re-enabling permissions.


### Final closure after the blocked attempt — confirmed

Fresh no-deployment `account-off-check` run
https://github.com/XiminHu66/PT-Universe/actions/runs/38792654414 passed at
`2026-10-15T19:17:28Z`. The unchanged strict check required stable 404 for
anonymous/Owner/Agent account page/assets/session/pairing/jobs/quota/tickets,
with stream/download/WebSocket and temporary UI gates closed. Accounting stayed
75,943,820 bytes transferred, zero reserved, tracking not active. No access or
stream permission was re-enabled for this independent check. The earlier
immediate OFF probe remains a failed run; this later result establishes the
final closed state, not the cause of the earlier response.

No browser session existed in this attempt to log out or revoke. Production,
VPS configuration and public application ports were unchanged. The code candidate
and its prior automated evidence remain intact. Actual novel catalog/chapter/
layout/cancel/rebuild UI acceptance stays open; do not claim completion from the
successful deployment probes or automatically reopen another window to retry.
The next continuation must account for the browser access limitation. Broader
provider support, Windows saves, longer persistence and merge/publication remain
in the previously recorded order; PR 104 remains draft.


## Closed cross-component integration candidate — 2026-10-15

The original order is unchanged; see MEDIA_VAULT_REMAINING_PLAN.md for the full
remaining sequence. Review identified and fixed Owner raw-payload persistence,
late duplicate-chapter rejection and invalid JSON returning a server error.
Canonical input now preserves the legacy boolean text-only alias, strips
unrecognized forwarding fields and normalizes chapter order. Content acquisition
checks cancellation before further source reads and during polite spacing,
checks cumulative acquired text/image bytes before packaging and rejects text
that the packager would otherwise truncate. EPUB building also splits source
paragraphs before control-character cleanup, fixing normal paragraphs being
joined together while still removing blank paragraphs.

An offline companion contract executes actual cookie/form, Worker/SQLite,
Agent polling, adapter and EPUB/CBZ builders, then applies real report metadata
back to the Worker. Four account kinds and a canonical Owner recipe, cancel,
rebuild, restart stability, file ownership, logout and zero tickets/ledger are
covered. Source HTTP and video/BT engine responses are disposable fixtures;
this is not a new live source, browser or Windows-save result.

New candidate-check operations run without production credentials, SSH, schema
mutation, deployment or live service calls. The public manifest retains explicit
pending gates and the release command fails until they are resolved. Reviewed
production entrypoint source is unchanged in this batch. The companion fixes
are candidate-only and require a coordinated later deployment; live Worker/VPS
remain at their prior closed versions. PRs remain draft. Cloud workflow results
will be appended after their fresh runs finish.


### Candidate checks — completed, no deployment

Fresh public run https://github.com/XiminHu66/PT-Universe/actions/runs/38795617915
passed from code `6a0cf3641daabeb700484a66526ece11f4459876`.
The paired component candidate used that exact public ref, passed all 34 adapter
and 28 Agent tests plus the complete Worker suite, actual offline cross-component
journey and candidate manifest. Its VPS stage job was skipped. No SSH, live
requests, migration, deployment or media artifact upload occurred. Reviewed
production-entrypoint source matches the manifest; account and stream access
were not changed. The intentional release-block result retains all six pending
acceptance/publication gates. This completes the closed integration-candidate
checkpoint; it does not complete the original project or blocked live UI work.
