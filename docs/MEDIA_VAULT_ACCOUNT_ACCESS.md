# Account sessions and frontend: implemented, disabled, not deployed

This stage adds backend authorization for durable browser sessions and new job
submission. It does not enable those permissions, apply the schema remotely,
create real download jobs, open a stream window or publish a production page.
The dedicated same-origin `/app/` frontend now uses the account cookie routes.
The existing three-file acceptance page keeps its separate adapter and scope.
Neither the new backend nor account page has been deployed or enabled.

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
for `prepare` and `stream-on`. Use a fresh native workflow dispatch after this
change: rerunning an older job retains its old YAML and migration order. An OFF
`prepare` dispatch is required before reusing a historical streaming job. The
account tables are metadata-only and existing tables are preserved.

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
and backend tests, not a real-browser layout or persistent-login acceptance run.

All account source requests and relay responses in this suite are fixtures;
no real media download or live seven-day expiry has been tested in this stage.

Next: review the concrete seven-day / five-job / one-hundred-ticket capability,
then use the revised OFF prepare workflow to migrate metadata before any account
activation. Isolated account activation, real-browser persistent-login testing,
real source submission and native download acceptance remain outstanding.
Production publication remains a separate stage. No production readiness is
claimed.
