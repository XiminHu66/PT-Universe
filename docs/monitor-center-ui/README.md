# Monitoring Center UI revision

The independent monitor page now uses a compact watchlist instead of oversized cards. Typography uses 13–15px for operational text, clear dark foregrounds, and a single blue action color. Category navigation stays above the list. Each row shows the current observation, target/order baseline, status, last success, and direct actions. Summary counts act as filters. Mobile rows reflow without relying on a horizontally scrolling data table.

Creation and editing share a three-step composer: object, alert conditions, and review. The final review summarizes the resulting frequency, rule, and global delivery channel. The left navigation and live-summary rail were removed after user review; the composer now uses a 700px single column with a footer step count. Hotel order conditions and optional price-match policy are grouped together. Extraction settings remain explicit, with hotel settings expanded and ordinary shopping settings initially collapsed. Native validation runs for the relevant stage and directs focus to missing fields; later stages cannot bypass earlier requirements. API routes, authorization, encrypted storage and monitoring semantics are retained.

Keyboard shortcuts: N opens creation; / focuses search when outside editable fields and dialogs. Native dialog controls and Escape remain supported.

## References

- Distill Watchlist: https://distill.io/docs/web-monitor/what-is-watchlist/ — aligned monitor status and item actions.
- Linear issue creation: https://linear.app/docs/creating-issues — a focused composer with contextual properties and a creation shortcut.

These are interaction references. No third-party artwork or source was copied.

## Verification (2026-10-28)

Browser checks used an isolated temporary copy of the actual HTML, CSS and app module with an in-memory connection fixture. No test objects were sent to the production API. Screenshots contain labeled UI fixtures and do not prove live collection.

- Desktop watchlist: shopping, hotel error, and USCIS state displayed with inline actions.
- Shopping creation: empty required fields prevented advancing; valid link advanced; target price updated summary; saving opened a detail view with the expected target.
- Editing: retained target and allowed progress without re-entering source URL.
- USCIS: malformed receipt prevented advancement; valid synthetic receipt reached final review with masked number and daily cadence.
- Mobile: 390px iframe; hotel dates, required order fields, validation and final review; navigation and footer buttons remained available while the long form scrolled.
- `node --check apps/monitor-center/app.mjs` passed.
- `node --test services/monitoring/monitoring.test.mjs`: 15 passed.
- `node scripts/monitor-center/connection-test.mjs` passed.
- `git diff --check` passed.

Review images: [watchlist](overview.jpg), [current single-column composer](composer-compact.jpg). The earlier [composer](composer.jpg) is a historical reference.

Not verified here: real order/case scraping, delivery to a phone, physical-device virtual keyboard behavior, or production publication. Feature changes remain on a review branch until publishing is authorized.

Follow-up validation: single-column rendering, forward navigation and final review verified with the isolated browser fixture. JavaScript syntax and diff checks passed.
