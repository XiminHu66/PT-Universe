# Resource Center

Primary entry: https://pt-vps-tools.h1nano.chatgpt.site/resources/

The frontend source lives in `apps/resource-center/`. The PT Universe home
directory links to the existing owner-private Tools Hub, which serves a mirrored
copy. The public Pages copy contains only public inventory and reference limits.
Private repository metadata and account billing values stay in the private Site
source. Existing access policy is unchanged.

## Scope and freshness

The 2026-11-04 audit covers 23 owned repositories, 124 workflow entries, four
configured Cloudflare Workers, PT Universe child pages, 14 VPS tool entries and
eight Sites registrations. A configured or registered service is not evidence
that it is currently running. Historical Sites and disabled workflows remain
visible and are labelled. Source-only private workflow records do not assert an
enabled/disabled state. Five historical private repositories were checked in the
GitHub Actions UI and have no workflows. Public generated Pages workflows can
lack YAML source and are labelled accordingly.

* GitHub Billing: manually verified private snapshot; expires after 24 hours.
  This account currently reports compute in USD credits, not raw minutes.
  An inventory refresh must never advance a measurement timestamp.
* Artifacts: audited instantaneous bytes in the project inventory. Individual
  public repositories can be refreshed with one read-only GitHub API request.
  More than 100 results is explicitly partial. Cache storage, public/private
  billing discounts and accumulated GB-hours are not inferred from artifact size.
* VPS: existing `/hub/api/metrics` and `/hub/status`, read on opening or an explicit
  refresh. Five-minute browser cache; sampling older than three minutes is stale.
* Cloudflare: manifests identify dependencies, not a live account inventory.
  Account analytics are not connected. Limits are documented Free-plan references,
  not confirmation of this account's current plan. Includes separate D1 account
  and single-database capacities, KV operations, Queues and Browser duration.
* Oracle egress and third-party API balances: not connected. No guessed usage.

Manual verified values can be entered with the actual sampling time and exported
or imported as JSON. They stay in the current browser. No secrets are accepted or
stored. The dashboard does not automatically refresh GitHub billing, Cloudflare
analytics, private workflow status, cache storage or the project inventory.

## Cost and behavior

No new cron, Actions workflow, Worker, container, database, telemetry or model
calls. The existing private Site serves small static assets plus one private JSON
snapshot. A fresh private visit makes two additional reads to the existing VPS
gateway; within five minutes the browser reuses that result. There is no polling,
automatic retry, or request after the tab closes. One-time publication uses the
existing Pages deployment and the existing Site publishing flow.

Default warning is 70%; danger is 85%, retaining 15% headroom. Unknown, stale,
wrong-period and future-dated measurements cannot be green. Forecasts are only
linear estimates for cumulative monthly spend, never occupancy or server CPU.
The zero-dollar paid budget is displayed separately from free-allowance usage.
The page cannot stop services, delete artifacts, trigger builds or change budgets.

## Updating and validation

`python scripts/resource-center/build-inventory.py --audit AUDIT_DIRECTORY --output apps/resource-center/public.json`
rebuilds public inventory from local audit records and workflow source. Audit
records contain each public repository's metadata, workflows, and artifacts API
responses; workflow YAML is under `source/REPOSITORY/.github/workflows/`.
Private inventory input requires an output outside the public repository.
Existing quota records retain their original sampling times.

In the existing private Site checkout, run
`node scripts/sync-resources.mjs ABSOLUTE_PATH_TO_apps/resource-center` to mirror
the audited UI and the private `worker/resource-snapshot.json`. Publish through
the normal private Site workflow. Do not copy private snapshots into this repo.

Local checks: `node scripts/resource-center/test.mjs`, `node --check apps/resource-center/app.mjs`,
`python .github/scripts/actions_policy.py .`, and `python scripts/build-pages.py`.
The private Site also runs its resource auth test and existing connection tests.

Official reference limits were checked on 2026-11-04:

* https://docs.github.com/en/billing/concepts/product-billing/github-actions
* https://developers.cloudflare.com/workers/platform/pricing/
* https://developers.cloudflare.com/workers/platform/limits/
* https://developers.cloudflare.com/kv/platform/pricing/
* https://developers.cloudflare.com/d1/platform/pricing/
* https://developers.cloudflare.com/d1/platform/limits/
* https://developers.cloudflare.com/queues/platform/pricing/
* https://developers.cloudflare.com/changelog/post/2025-07-28-br-pricing/
