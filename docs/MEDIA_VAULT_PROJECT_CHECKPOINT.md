# Media Vault project checkpoint — account task candidate

This document consolidates the original remaining sequence: metadata integration,
small-file transfer, larger-file/recovery, budget/retention, real source scenarios,
frontend integration, then merge/publication. Account login was a prerequisite for
using that workflow without copying a long-term security key into the browser.
It is not a replacement project or a reason to repeat completed transfer tests.

## Current checkpoint

The dedicated Worker now contains a complete candidate account task workflow:

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
- A separate, ready-to-dispatch four-source account submission pilot with a
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
| Account task experience | Candidate code, real client/Worker/SQLite journey and actual companion EPUB packager contract completed | Updated layout/controls in a real browser; four real account-source tasks |
| Novel source handling | Fixed supported-source parser and explicit chapter/text/layout options | Source login/ads/rate limits can still prevent acquisition; no borrowed local website login |
| Manga | Packaging and explicitly licensed Commons samples | General Chinese manga-provider compatibility is not delivered by this candidate |
| Production | Current production entrypoint preserved; PR remains draft | Review results, user Windows acceptance, then separate merge/publication decision |

## One next integrated live batch

Use a **fresh dispatch** of workflow 21 on the current staging branch. Historical
reruns retain old YAML. The candidate's `account-rc-off` operation deploys code
with access/submission/stream/UI gates closed, checks the existing schema without
migration and permits existing account-history rows. Do not reuse initial
`prepare`'s strict empty-account-table proof after browser pairing metadata exists.

The next permission scope is concrete: `account-submit-on` opens a fresh random
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

Run the next live batch as one outcome: open the window, pair once, approve that
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
availability or a real browser layout. The candidate deploy and the next live
batch must be recorded separately below when they actually complete.
