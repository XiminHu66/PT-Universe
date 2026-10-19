# Complete-page scoped staging preview

The dedicated hybrid Worker can serve the existing Media Vault page and its
frontend source at `/acceptance/app/` during the existing acceptance window.
The route and its explicit asset allowlist return 404 when the window closes.
Production HTML, hosting and the private-engine connection contract are not
published or replaced by this stage.

## Browser access

The preview replaces the engine-key form with a temporary pairing dialog.
Owner approval still happens server-side using the existing configured test
files, short expiry and six-ticket cap. Browser requests use only the same-origin
HttpOnly cookie. The preview does not read, write or copy private-engine tokens.
Pending pairing codes and approved sessions can be recovered after a refresh.

The adapter exposes only approved file metadata, the corresponding read-only
task rows and the actual application budget. It cannot submit or cancel tasks,
lease jobs, approve a browser or read Owner endpoints. Other source searches and
builds are disabled for this acceptance scope. Successful downloads use the
same native saver as the staged application; browser handoff is not disk-save
confirmation.

## Session lifecycle

`POST /acceptance/logout` requires the current browser cookie and same-origin
request. An atomic D1 batch revokes only that session, expires its unused new
tickets and releases precisely those reservations. Other browser sessions,
Owner tickets and already-active transfer reservations remain unchanged. The
cookie is expired in the response. Logout remains possible after the acceptance
window closes; global shutdown continues to revoke every test session.

The client drops file controls on expiry, denied scope or unverified metadata.
Pair and logout requests are serialized so a late pairing Set-Cookie response
cannot outlive a confirmed logout. Old metadata responses cannot restore a
logged-out UI. A failed logout stops local access and offers retry instead of
claiming that server revocation succeeded. Downloads already handed to the
browser must be cancelled through its download controls.

## Assets and verification

Run `node workers/media-vault-hybrid/build-preview.mjs` after changing the
frontend sources. Tests check the embedded source text byte-for-byte. The
preview uses the existing public JSZip/OpenCC static libraries; cross-device
sync and the site bridge are omitted. Its CSP restricts API connections to the
same origin. The preview embeds only frontend source; it adds no media or data snapshot.

The required test command is `npm test --prefix workers/media-vault-hybrid`.
Real SQLite tests verify single-session revocation, idempotence, CSRF rejection,
closed-window logout and preservation of unrelated/active reservations.
Client tests cover pending and approved refresh, expiry, read-only paths,
stale responses, serialized cookie changes, failed logout lockout and the
gated asset allowlist.

This is a bounded staging access path, not permanent application authentication.
Permanent account access, job submission through that access, source-specific
compatibility and production publication remain separate work. Remote browser
acceptance does not establish saving on the user's Windows computer.

## Bounded browser acceptance

The complete staged page was exercised in remote Chrome: pending pairing kept
its code after refresh, approved access restored after refresh, the task dialog
showed the real application budget and three scoped file rows, and native EPUB,
CBZ and MP4 saves matched the accepted source hashes and structures. Exiting the
session removed the file controls and closed an already-open file dialog in a
second tab of the same browser profile. Exact expiry and unrelated-session
isolation are also covered by the client clock and real SQLite tests; no claim
is made that a natural 15-minute expiry was observed during the browser run.
