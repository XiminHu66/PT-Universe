# Account sessions and frontend: deployed with access disabled

The backend and frontend for durable browser sessions and bounded new-job
submission are deployed to the isolated Worker with all account permissions
disabled. The additive D1 schema has been applied and verified. The initial disabled deployment did not create real source jobs. The later
explicitly authorized four-source account acceptance below completed four jobs,
then closed access again, without opening streaming or publishing production.
The dedicated same-origin `/app/` frontend now uses the account cookie routes.
The existing three-file acceptance page keeps its separate adapter and scope.
The account page is bundled but returns 404 while account access is disabled.

## Initial permission contract

| Boundary | Implemented limit |
| --- | --- |
| Session | Absolute seven days from pairing; no sliding renewal |
| Approval | Existing server-side Owner credential; never sent to the browser |
| Cookie | Separate host-only Secure, HttpOnly, SameSite=Strict cookie |
| Storage | Cookie digest, public request/session IDs and metadata only |
| Pending approval | Five minutes, at most ten pending requests |
| Devices | At most three unexpired approved sessions per configured account |
| New jobs | At most five new jobs over each session lifetime |
| File tickets | At most one hundred issued tickets per session |
| Existing global controls | Five active jobs, six outstanding tickets, twelve ticket permits per minute, existing application transfer budget and relay capacity |
| Task visibility | Only jobs mapped to the configured account |
| Existing Owner jobs | Not migrated or made visible automatically |

Approved devices for the same account share that account's jobs, including jobs
created by an earlier approved device. Logout revokes a session, not the account
or its task history. New device approval remains an explicit Owner operation.
The seven-day cookie is automatic browser session storage; it is not an export
of the Owner/Agent key and the user need not keep a local key copy.

## Routes and separation

`/app-auth/pair` issues a pending request and the separate cookie. Owner-only
`/app-auth/approve` binds it to `MEDIA_APP_ACCOUNT_ID`; the request cannot choose
its own account, limits or authority. `/app-auth/session` returns expiry and
remaining allowances without renewing access. `/app-auth/logout` revokes the
current cookie; Owner-only `/app-auth/revoke` targets a public session ID.
Logout and administrative revocation remain available while account access is
disabled, so disabling a feature cannot block cleanup.

`/app-api/jobs`, `/app-api/jobs/files`, `/app-api/jobs/cancel`, `/app-api/quota`,
`/app-api/health` and `/app-api/download-ticket` require an approved account
cookie. Account requests have no credentialed cross-origin access; mutations
require the dedicated service origin. The cookie confers no Owner, Agent or
three-file acceptance-session role. Account file tickets recheck session,
account ownership, expiry and the access switch at redemption.

Submission supports the existing novel, manga, torrent and video job contract.
Only the canonical supported request fields reach the engine; supplied account,
authorization, headers and engine request IDs are discarded. Each request must
include a random 32-hex-character `request_key`. Retrying the same key and input
returns the same job; conflicting input returns 409. The lifetime allowance,
global queue ceiling, account mapping and counter update are transactional.
Database failure cannot leave an unowned queued job. Revocation races are checked
again inside the job/cancel/ticket mutations.

Revocation expires only unused tickets for that session and releases precisely
their reservations. Unrelated Owner/browser tickets and already-active transfers
remain intact. Pre-claim rejection also releases only `new` tickets, so it cannot
erase a reservation concurrently claimed by a transfer. Browser-owned downloads
still use browser cancellation controls; no disk-save completion is inferred.

## Deployment boundary

Both `ENABLE_APP_ACCESS` and `ENABLE_APP_SUBMISSION` are explicitly `false` in
the base configuration. `MEDIA_APP_ACCOUNT_ID` is not configured by default.
Existing acceptance-window generation forcibly disables both account switches,
even if a future base configuration changes. Account access does not enable
streaming; `ENABLE_DIRECT_STREAM` remains independently disabled.

Before any new Worker code handles enabled downloads, apply the additive schema
while streaming is OFF. The updated workflow applies schema before deployment
for `prepare` and `stream-on`. `prepare` now keeps every stream, temporary
preview and account gate OFF, including when fixed-file IDs are supplied.
It verifies live stream closure before migration, records fingerprints of
existing metadata tables, validates the account tables are empty and have the
expected columns/index, executes the additive schema again, and compares the
original metadata after both executions. Drift or unexpected account data
stops deployment. Only pass/fail summaries are logged; rows and credentials are
never logged or uploaded as artifacts. The dedicated account page/API/submit/
ticket routes are checked for 404 after deployment with anonymous, Owner and
Agent requests.

Use a fresh native workflow dispatch after this
change: rerunning an older job retains its old YAML and migration order. The
initial OFF `prepare` migration below is complete. Its strict empty-account-table
assertion is an initial pre-activation proof; do not rerun it after real browser
session metadata exists. Use `account-login-off` to close a login window, and
review schema/readiness explicitly before a later transfer stage. The account
tables are metadata-only and existing tables are preserved.

The workflow adds explicit `account-approve` and `account-revoke` operations using
`account-session-admin.mjs` and the existing GitHub Owner secret. The existing
request-ID field accepts a 32-hex pairing code for approval or a 24-hex session ID
for revocation. The script neither retrieves nor prints the secret. Approval
still fails while account access is disabled; adding an operation does not grant
access or change the feature switches.

## Same-origin account frontend

`apps/media-vault/account.html`, `account-app.js`, `account-session.js` and
`account.css` form a dedicated account page. It does not load the legacy engine
settings, Owner token form, production bridge, snapshot or source-search UI.
The Worker serves `/app/` and its explicit asset allowlist only when account
access and a valid configured account are present. Account submission and file
streaming remain independent switches. The page can show account jobs and the
actual application budget while streaming is OFF. The production entrypoint
and existing three-file acceptance assets are unchanged.

The cookie client restores pending or approved sessions, polls pending approval
and verifies the absolute expiry. Logout clears task/file controls immediately,
disposes pending native-download handoffs and invalidates late GET/POST results.
Cookie-changing pair/logout requests are serialized. Same-origin tabs receive
a BroadcastChannel logout notice and also request server revocation; server
polling remains the fallback. A failed logout keeps this page locked until
server-side revocation is confirmed, and is never presented as successful.

Submission supports a direct video/BT link, explicit novel chapter numbers
(one-based in the UI, zero-based in the API), and a title plus 1–20 Commons image
filenames for manga. Supported source and validation rules remain those of the
existing backend; this stage does not prove any additional source works live.

The per-tab session-storage retry journal contains only public session/request
IDs, a SHA-256 input fingerprint, a sent marker and an optional returned job ID.
It stores no URL, raw cookie, Owner/Agent credential or media bytes. It must be
saved before a POST can be sent. Concurrent identical clicks share one promise;
a timeout, network error, malformed success or 5xx retains the key. Reloading
and re-entering the same content reuses it. While a previous result is uncertain,
a different payload is blocked rather than discarding its retry identity.
Successful replay still works after the new-job allowance is exhausted. Logout
clears the journal. This is per-tab retry protection, not deduplication of
independent submissions on different tabs/devices; it does not survive cleared
browser session storage. Identical confirmed input in the same journal returns
the existing job. A new browser login may intentionally submit it again.

The native saver requests only ticket metadata, then navigates the browser to
the attachment. No frontend media buffering or local-disk completion inference
is added. Closing the file dialog or losing session verification removes its
controls and disposes late ticket handoff.

## Verified OFF deployment

On 2026-10-15, a fresh `prepare` dispatch from source commit
`9bfc072ddd462c7067b19c9afe164cb6acafbe72` completed successfully:
[deployment run](https://github.com/XiminHu66/PT-Universe/actions/runs/38754589025).
The remote additive schema and a second execution passed the existing-metadata
fingerprint checks. The three new account tables remain empty. Stream, account
access, account submission and temporary preview gates were all deployed OFF,
with no configured account realm or approved persistent device.

Post-deployment checks confirmed stream ticket/download/WebSocket closure,
unchanged transfer accounting and stable 404 responses for account page/assets,
session lookup, pairing, submission and ticket endpoints under anonymous, Owner
and Agent requests. No VPS configuration, public port or production page changed.

The first deployment reached the same OFF configuration, but its immediate
single-sample asset check observed an old-route 401 during propagation. The
checker now requires two consecutive complete 404 samples within a bounded
window; any successful or redirecting account route fails immediately. The
successful verification used a fresh dispatch of the corrected commit. Historical
run reruns were not used to apply the correction. This proves closed deployment,
not account activation or browser login/download acceptance.

## Bounded read-only login acceptance

The browser login acceptance is narrower than the durable-account contract above.
It uses a fresh random `login-test-` account realm for at most twenty minutes,
with no pre-existing jobs, sessions or tickets. It grants zero new-job allowance
and zero file tickets. Server checks reject submit, cancel and ticket issuance,
even if submission or streaming flags are accidentally enabled. Existing Owner
jobs and other accounts are not imported. The page hides mutation/file-save
controls and clearly identifies the read-only acceptance window.

`account-window-config.mjs` creates the fixed-duration configuration for explicit
`account-login-on` / `account-login-off` workflow operations. The normal base
configuration and old acceptance generators keep account access OFF, an empty
realm and a closed login deadline. The on operation checks closed stream/account
routes first, validates the already-migrated schema and an empty generated realm,
then deploys only the dedicated Worker. It never runs database migrations, creates
a source task, starts an Agent stream or changes the production frontend/VPS.
Its page/API probes create no cookie and approve no session automatically.

`MEDIA_APP_LOGIN_TEST_UNTIL` is enforced on every account page, auth and API
request. Its presence selects the restrictive login-test mode; a malformed,
zero or past deadline fails closed. It also requires the generated login-test
realm pattern. Pairing records the target realm immediately, and approval cannot
move a pending request into another realm. Pending expiry is the earlier of
five minutes and the window end. Cookie Max-Age and approved database expiry are
also capped at the same window end, so a later reopening cannot revive an old
expired browser session. Normal durable account sessions without this test
variable retain their absolute seven-day contract; enabling that broader mode
is not part of this acceptance.

Approval remains a separate Owner-only `account-approve` operation, performed
through the existing server-side GitHub secret for the exact public pairing
code. For the read-only scope the administrator script verifies zero job/ticket
limits and expiry within twenty minutes. No long-term credential enters the
browser or needs to be saved locally. Logout and narrow administrative revocation
remain available after the deadline or while the feature is OFF.

`account-login-off` restores all gates to OFF and clears the configured realm.
If the public session ID is provided in the existing request-ID field, it also
revokes that specific session before running the closed-route checks. It can
close an existing window without requiring the pre-opening checks to succeed.
Expiry enforces access closure even if a closing workflow never runs; it does
not automatically redeploy flags or erase expired metadata rows. A fresh on
operation starts a new window, so it must not be rerun to extend access silently.

The user explicitly authorized one twenty-minute read-only window and approval
of the test browser on 2026-10-15. A fresh `account-login-on` dispatch from
`6571b98d8abc313d67bcebf29b25168414793c02` passed:
https://github.com/XiminHu66/PT-Universe/actions/runs/38757264555.
The deployed version was `ce2a9abb-6289-44b0-8eee-bb3cc73509d0`, with the
fixed deadline `2026-10-15T15:26:01.054Z`. Opening verified the existing schema,
empty generated account realm, closed stream/temporary-preview routes and
cookie-less account API denial; it ran no migration or source task.

The exact browser request was approved through the existing server-side Owner
secret in a separate successful dispatch:
https://github.com/XiminHu66/PT-Universe/actions/runs/38757729242.
The script verified `login-test-read-only`, zero job allowance, zero ticket
allowance and the same capped expiry. No security key was entered, exported or
saved locally.

Remote Chrome verified pending pairing recovery after reload, approved login
recovery after reload and in a second tab, an empty isolated account task list,
disabled submission controls and the real application budget. The page reported
68.1 MiB transferred, 0.0 MiB reserved and file transfer closed, clearly separate
from the cloud provider bill. Logout in one tab cleared both tabs; reloading the
second tab did not restore account access or task visibility. No source task,
cancel request, file ticket or file download was performed.

The window was closed early by a fresh `account-login-off` dispatch, passing only
the public test-session ID for narrow, idempotent revocation:
https://github.com/XiminHu66/PT-Universe/actions/runs/38758036401.
It succeeded at `2026-10-15T15:11:24Z` and deployed OFF version
`d28408ed-553a-4245-9467-c5d2c014e7c6`: account access/submission, direct streaming
and temporary UI flags were false, the account realm was empty, and the login
deadline was zero. The requested session revocation passed. The checked account
page/assets/auth/API routes returned stable 404 for anonymous, Owner and Agent
requests; stream ticket/download/WebSocket and temporary preview routes remained
closed. Transfer accounting stayed at 71,410,712 bytes transferred and zero
reserved. No production page, VPS configuration or public port changed.

The cloud browser could not render the final closed-page navigation because its
URL policy rejected the resulting browser error page. No workaround was used;
the final route-closure evidence is the successful server-side workflow probe.
The approved read-only page and final successful workflow summary were captured
separately. This short Chrome run does not establish seven-day persistence,
natural twenty-minute expiry observation, Windows disk saving or live-source
compatibility. Deadline expiry/no revival remain automated clock-controlled tests.

## Validation and next work

`npm test --prefix workers/media-vault-hybrid` includes real in-memory SQLite
tests for hashed cookie storage, absolute expiry, role/account isolation,
pending/device/session/global caps, concurrent idempotency, transaction rollback,
revocation during submit/cancel, account ticket issuance/redemption, disabling
access and preservation of active/unrelated reservations. Existing control,
relay, retention, transport, temporary-session and frontend suites remain required.
The added frontend suite exercises the actual controller with a minimal DOM
harness: stale file responses, logout closing the dialog and disposing its
saver, escaped filenames, disabled submission and gated asset isolation. Client
fixtures cover reload-safe retry, exhausted-cap replay, uncertain-input blocking,
late POST after logout, expiry, cross-tab logout and failed revocation. The real
SQLite suite also executes the cookie client against the actual Worker handler,
drops a response after a committed transaction, recreates the client and verifies
one job, one quota increment and a replayed result. These are automated controller
and backend tests. The earlier Chrome acceptance above adds read-only layout, short reload
recovery and logout evidence; the later fixed submission pilot below adds live
account-source completion and metadata evidence.

All account source requests and relay responses in this automated suite are
fixtures. Live fixed-source submission is recorded separately below; account
file transfer and seven-day persistence are still unproven.

The bounded account submission acceptance below is complete. Next prepare an
account file-save scope with exact retained files, byte/ticket limits, Agent
window, expiry and cleanup; enable it only under its explicit authorization.
The broader seven-day / five-job / one-hundred-ticket capability remains disabled.
User Windows saving, general catalog/layout/rebuild browser acceptance, longer
persistence and broader Chinese manga compatibility remain open. Production
publication is a separate stage; no production readiness is claimed.

## Consolidated project checkpoint

The account task candidate now includes catalog/chapter selection, explicit
text-only/layout options, correct progress units, task filters, owned terminal-job
rebuild and honest disabled-save controls. The submission pilot completed one fixed thirty-minute/four-recipe
account-wide batch, with zero file tickets and streaming OFF, then closed early. See [MEDIA_VAULT_PROJECT_CHECKPOINT.md](MEDIA_VAULT_PROJECT_CHECKPOINT.md)
for the complete original-plan mapping, completed integrated batch and remaining account transfer, Windows and
publication work. Completed tests do not activate broad account permissions.


## Real four-source account submission acceptance — completed

On 2026-10-15, the explicitly approved `account-submit-on` window was deployed
from `81723c0cbee4c9c0dc94e764eef982107b659a26` in successful run
https://github.com/XiminHu66/PT-Universe/actions/runs/38769801143.
Worker `4a34c488-f71a-410a-b17b-190a0fea7587` used an absolute deadline of
`2026-10-15T17:02:29.468Z`. The exact browser pairing was approved through the
existing Owner secret in successful run
https://github.com/XiminHu66/PT-Universe/actions/runs/38770293412.
The script verified `submission-test-no-transfer`, four jobs, zero tickets and
expiry clamped to that deadline. No local security-key copy was needed or made.

The account UI submitted and completed the exact single-chapter text EPUB,
two-page licensed Commons CBZ, five-second MP4 and commit-pinned owned WebSeed
recipes. The four job IDs, displayed filenames/sizes and original recipe bounds
are recorded in the consolidated project checkpoint. All file dialogs returned
metadata with saving disabled. No ticket or actual browser file transfer occurred.

Reload retained the account/four tasks; identical novel-request replay returned
the original job without increasing the count. A second tab recovered the same
four completed tasks without pairing again. Logout cleared both tabs, disabled
submission and survived second-tab reload. This proves short same-browser
recovery and logout, not multi-device persistence or natural deadline expiry.

Fresh `account-submit-off` run
https://github.com/XiminHu66/PT-Universe/actions/runs/38771130862 succeeded,
deploying final OFF version `54c52203-f56a-4e31-957e-9c6559b99f9d` and completing
closed probes at `2026-10-15T16:42:07Z`. It narrowly revoked public session
`817ab97ee752915503b545a3`, which had already logged out. All account, stream and
temporary UI gates are OFF; the configured realm is empty, test mode is closed
and both account deadlines are zero. Stable anonymous/Owner/Agent 404 checks
passed for account routes, as did stream/download/WebSocket/preview closure.
The full public suite and schema readiness passed without live migration.
Transfer accounting remained 71,410,712 bytes transferred, zero reserved,
tracking not active. No production page, VPS configuration or public port changed.

The general catalog/chapter/layout/cancel/rebuild controls were not activated in
this fixed-recipe scope. Their automated tests and companion EPUB field-contract
proof remain distinct from future real-browser acceptance. Broader Chinese manga
sources and user's Windows disk-save behavior remain outstanding.
