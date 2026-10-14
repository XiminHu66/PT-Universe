# Native download staging integration

The staged Media Vault file list and the dedicated temporary browser acceptance
page now use the same `createNativeSaver` implementation from
`apps/media-vault/native-download.js`. This branch does not publish the production
frontend or enable a permanent browser session.

## Behavior

- Request only ticket metadata with a bounded timeout, then navigate the signed
  attachment URL through a named iframe. Media bodies never enter a JavaScript
  Blob, page buffer, browser storage, or cloud archive.
- Suppress overlapping ticket requests and request a fresh ticket for each manual
  retry. No automatic replay or retry consumes additional scoped capabilities.
- Preserve legacy URL-safe Adapter tickets as well as hybrid hexadecimal tickets.
- Show authorization, expired capability, unavailable source, busy/limit and
  offline errors without exposing raw backend messages. Honor bounded retry
  delays. The Worker bridges pre-stream HTTP failures to the parent using only
  status, delay and a random attempt identifier; origin, frame and attempt must
  all match before the page changes its message.
- Keep HTTP API errors as JSON and successful attachment responses untouched.
  Native navigation errors receive a restrictive CSP and no ticket echo.
- Report browser handoff, never completed disk saving. Cancellation after handoff,
  interrupted response bodies, and final save location remain browser concerns.
  Stopping a pending ticket request does not claim to cancel a browser download.

## Source and deployment checks

`node workers/media-vault-hybrid/build-native.mjs` generates the module text used
by the temporary Worker page. The generated file is checked byte-for-byte against
the frontend source before every test/deployment. Serving source text avoids
depending on build-tool helpers captured by `Function.toString()`.

Run `npm test --prefix workers/media-vault-hybrid`. The native suite checks direct
navigation, metadata-only requests, duplicate suppression, fresh-ticket retry,
aborted requests, untrusted error messages, invalid metadata/tickets, generated
module execution, API response preservation and the HTML error bridge. Existing
SQLite, relay, ticket and scoped-session suites remain required.

The existing temporary pairing remains limited to the configured three small
test files, an approved HttpOnly cookie, a short expiry and six ticket issuances.
Owner and Agent credentials remain server-side during browser acceptance.
Disabling the window hides both the page and module; the shutdown workflow also
revokes paired sessions and releases their unused reservations.

## Acceptance boundary and remaining work

The shared module has been exercised using native EPUB, CBZ and MP4 downloads in
remote Chrome, with exact source hashes, container/signature checks, transfer
accounting and single-use rejection. Real pre-stream offline errors reached the
page, recovery used a fresh ticket for a hash-checked save, and the session
ticket cap returned a bounded retry message. Refreshing an approved page restored
its still-valid scoped session. This does not demonstrate a save on the
user's Windows computer or a full production application login flow.

The production settings dialog still uses the existing private-engine connection
contract. The temporary same-origin cookie must not be copied into that dialog
or treated as cross-site production authentication. A permanent browser access
design, complete staged application acceptance and production publication remain
separate gates. Existing source-specific compatibility and retention limitations
continue to apply; see `MEDIA_VAULT_RETENTION.md`.
