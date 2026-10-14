# Account-session backend: implemented, disabled, not deployed

This stage adds backend authorization for durable browser sessions and new job
submission. It does not enable those permissions, apply the schema remotely,
create real download jobs, open a stream window or publish a production page.
The browser page still uses the existing three-file acceptance adapter; the new
login/account UI is the next implementation gate.

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

## Validation and next work

`npm test --prefix workers/media-vault-hybrid` includes real in-memory SQLite
tests for hashed cookie storage, absolute expiry, role/account isolation,
pending/device/session/global caps, concurrent idempotency, transaction rollback,
revocation during submit/cancel, account ticket issuance/redemption, disabling
access and preservation of active/unrelated reservations. Existing control,
relay, retention, transport, temporary-session and frontend suites remain required.
All account source requests and relay responses in this suite are fixtures;
no real media download or live seven-day expiry has been tested in this stage.

Next: implement the same-origin login/account UI and stable submit request-key
handling, then review the expanded account capability before activating it in
the isolated service. Real source submission, persistent-browser acceptance and
production publication remain outstanding. No production readiness is claimed.
