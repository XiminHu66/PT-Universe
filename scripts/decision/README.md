# Decision workspaces and automatic collection

The two investment apps share one entry at apps/investment-desk/. Weekend Atlas and Food Orbit share apps/life-desk/. Original app URLs redirect, while embedded=workspace supports the workspace adapters and standalone=1 supports regression testing. Existing storage keys are preserved.

## Collection

The existing PT Universe Worker now supports authenticated /api/decision/:owner/sources routes. A collector account is created only when the user connects a source. It is separate from device synchronization and uses the existing bearer authentication table. Public source configuration and collected text are stored server-side; holdings and private notes are not uploaded by the collector. The account credential can travel through existing encrypted device synchronization.

Sources: public HTTPS page text (optional CSS selector), RSS/Atom feeds, and explicit JSON-LD Product/Offer quotes. No authenticated browsing, X account access, or Muse account integration is claimed. Those services need actual source information. Page collection uses normal HTTP; JS-only pages, access challenges and missing prices report a failure and retain previous evidence.

A 15-minute dispatch checks up to 20 due sources, each with a one-hour cooldown. Source rows use atomic leases to avoid duplicate collection. Current source status includes checked time, failure, pause state and bounded snapshots. URLs and redirects reject internal names, IP literals, credentials and non-HTTPS schemes. Responses are capped at 1 MB, page text at 60,000 characters; snapshots retain 20 changes and feeds retain 300 first-seen originals. Data expires 60 days after the last successful collection. Pausing retains prior records. Removing a source deletes its remote data. The existing daily crawler schedule is not changed.

Watch Inbox pulls source snapshots on open, while visible every minute, and when returning to the tab. A first snapshot establishes a baseline; changes are evaluated using existing conditions. Unresolved transitions remain pending even when later snapshots do not trigger. Browser forms are not overwritten by polling.

Signal Audit automatically ingests only a single cashtag plus an explicit direction without detected conditional, option or exit language. This conservative heuristic is not semantic understanding. Other original posts remain visible for review. First-seen capture time is retained, retrospective results are separated, and feed edits do not rewrite original signals. Statistics describe the parsed signals, not all posts from a bot. The source's attribution is not independently authenticated against X.

3C Scout reads structured merchant quotes separately from confirmed purchase evidence: a price crossing the target is a reason to check variant, stock and checkout fees, not proof of compatibility. Ask GPT builds context on open and offers an explicit user action carrying the preview in a ChatGPT URL; long contexts retain copy/download options. No AI API execution is claimed.

## Validation

Decision tools validation runs model regressions, legacy browser flows, workspace navigation/draft/shared-storage/mobile checks, automatic frontend ingestion checks, TypeScript validation and collector tests against Cloudflare's local runtime. Tests use fixtures and separate browser profiles, never the user's local records. Production Worker deployment also retains the existing type, media and dry-run checks.
