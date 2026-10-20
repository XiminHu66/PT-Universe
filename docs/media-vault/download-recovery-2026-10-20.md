# Download recovery checkpoint — 2026-10-20

The failing user magnet had no trackers, no WebSeed, no metadata and no peers before cancellation. The VPS had no global trackers and forced encrypted peer handshakes. DHT and peer exchange were enabled; containers were healthy. These observations identify missing discovery fallback and a peer compatibility constraint, but do not prove that the user's particular swarm has available seeders.

The deployed private adapter adds three fixed public trackers only to magnets without `tr`, `xs`, `as` or `ws`; it does not modify supplied private trackers or torrent files. Peer encryption is negotiated. The same existing Aria container and outbound relay are used; no public listener was added.

Progress timestamps survive restart and advance only on phase change, increasing completed bytes or positive transfer speed. Queue wait and pause do not consume download deadlines. Metadata stops after five minutes without progress; peer/download/merge phases after ten; video extraction after three. A terminal timeout is recorded only after backend cancellation succeeds. It releases the execution queue and offers a fresh retry. Source errors do not expose tracker passkeys or raw backend URLs.

The page now accepts a BTIH hash, reordered/encoded magnets and HTML-escaped query separators, while preserving supplied tracker values. A public Sintel example fills the input without submitting a job.

## Real completed payload acceptance

Public Actions run [39374562063, attempt 3](https://github.com/XiminHu66/PT-Universe/actions/runs/39374562063/attempts/3), job 118756144528 succeeded after private adapter deployment a830e8e250c20b72950c19e4e066c7089fe1f7be.

| Source | Result |
| --- | --- |
| Licensed Commons video page, job `67fb95b1a71da5fbe7ac4ebf` | VPS completed and relay delivered 48,727,669-byte WebM; container header valid; replay denied |
| Licensed Sintel magnet with no Tracker or WebSeed, job `2d4067066550ba94b2b4d8dc` | Metadata, 100+ connected peers, full 129,302,391-byte torrent completion, 11 files; relay delivered the complete 129,241,752-byte MP4; container header valid; replay denied |

Delivered-body SHA-256 values (computed from received bytes, not an independent upstream checksum):

- WebM: `4cc2e4bd323c4642769725df3183d25018d155648095ffd2838349d82bd70e34`
- MP4: `1dc6f2ca9762dfcc7d1b1843129a3e4f351d1fe935dea2241c7b359c11ebc1d8`

This required completed payloads and complete file delivery, not merely metadata or the first P2P bytes. The Owner operational API was used without creating another browser grant. It does not replace a new Windows native-save acceptance.

## Validation and remaining limits

Private deployment ran 42 Agent and 76 adapter tests. Public Worker/task tests, candidate checks, frontend logic and the actual Agent/adapter/Worker contract passed locally. Browser and engine CI for the initial change passed in run 39459829986. Final page changes are checked separately before merge.

YouTube remains blocked by source verification on this VPS, including the most recent user job. No source session is configured. This release does not claim to restore YouTube or all yt-dlp-listed sites. An unavailable swarm also cannot be made available by adding trackers. See [source scope](video-sources-2026-10-20.md).
