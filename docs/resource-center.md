# Resource Center

Canonical page: https://ximinhu66.github.io/PT-Universe/apps/resource-center/
Authorization guide: https://ximinhu66.github.io/PT-Universe/apps/resource-center/setup.html

Scope is GitHub, Cloudflare and Oracle VPS only. Frontend assets live in
`apps/resource-center/` and deploy with PT Universe GitHub Pages. The existing
`pt-universe-api` Worker serves authenticated `/api/resources/*` reads; it creates
no new Worker, cron, Actions workflow, container or database. Opening the page
or pressing Refresh performs bounded reads. Closing it stops further requests.

## Authorization and private data

The existing owner-private Tools Hub is an identity broker only. A nonce-bound
redirect exchanges the existing owner login for a one-day dedicated
`resources:read` grant, stored in sessionStorage. The browser returns to the fixed
PT Universe page and removes the fragment immediately. The signed, digest-bound
one-minute configuration grant migrates the private inventory into the existing
Worker KV; it cannot read resources. Ordinary read grants cannot configure it.
Legacy `/resources/*` Hub URLs redirect to PT Universe and serve no inventory.

Set `RESOURCE_GITHUB_TOKEN`, `RESOURCE_CF_TOKEN` and `RESOURCE_CF_ACCOUNT_ID` as
Secret variables in the existing Cloudflare Worker, not in Pages or Actions.
The linked guide contains exact permission and setup steps. Supplier credentials
are never accepted by the frontend or returned by the API. Public Pages JSON
contains public repositories and reference limits only. The private audited
inventory remains outside this repository and in authenticated Worker KV.

GitHub uses fine-grained Metadata / Actions read for all intended repositories
and account Plan read for billing. Cloudflare uses Account Analytics read scoped
to the intended account. Oracle VPS reuses the existing signed metrics transport;
no new SSH key, OCI API user, open port or monitoring agent is required.

## Coverage, freshness and limits

The initial audit covers 23 repositories and 124 workflow entries. Automatic
GitHub discovery refreshes owned repositories and workflow status, artifact bytes
and accessible Actions cache totals. YAML triggers/runner details retain their
audited date. Account billing reports display gross, discounts and net separately;
these are not relabelled as free-pool consumption. Historical free-allowance cards
retain their actual timestamp and become unknown/stale when no comparable live
measurement exists. Artifact occupancy is not inferred from billed GB-hours.

Cloudflare reads Workers requests, KV operations, D1 row counts, Queue billable
operations and available KV/D1 storage peak samples. Storage samples do not
guarantee coverage of inactive resources and cannot be green merely because
the observed subset is small. Existing Browser binding history provides only a
lower bound for today’s recently closed sessions; no browser is launched. Manifests
identify configured dependencies, not proof of a live deployment. Inaccessible datasets stay unknown with individual diagnostics. Cron counts
remain a configuration audit; no management permission or periodic enumeration
is added. Free-plan limits are documented
references, not confirmation of this account's actual subscription.

VPS reads CPU, RAM, root disk and service health through the existing gateway.
Oracle account monthly egress remains unconnected: VPS interface traffic counters
are not relabelled as Oracle billable egress. Other providers are excluded.

Browser cache: fifteen minutes. Server inventory: six hours; storage/provider
reads: one hour, with in-flight coalescing and failure backoff. On-demand private KV caches
share results across Worker instances, scoped by hashed credentials and billing
period; no supplier secrets are persisted in cache keys or values. Failures back
off five minutes and retain last-good measurements with their original times. Independent sources
preserve last-good data and true sampling times. Per refresh maximums: inventory
36 GitHub requests, storage 41, Cloudflare six bounded GraphQL queries; normally caches
reduce these substantially. There is no background polling or model call.

Default warning is 70%, danger 85%, retaining 15% headroom. Unknown, stale,
wrong-period or future values cannot be green. Monthly cumulative spend may have
a linear forecast; occupancy and CPU do not. The dashboard cannot stop services,
change budgets, delete artifacts or trigger builds.

## Validation

Run `node scripts/resource-center/test.mjs`,
`node scripts/resource-center/collector.test.mjs`,
`node scripts/resource-center/auth.test.mjs`,
`node scripts/resource-center/metrics.test.mjs`,
`python .github/scripts/actions_policy.py .` and `python scripts/build-pages.py`.
In the existing Worker: `npm run check`, `node tests/resources.test.mjs`,
`node tests/vps.test.mjs` and `npx wrangler deploy --dry-run`.
The identity broker has separate nonce, redirect, signature and snapshot tests.

The existing Worker deployment workflow includes the shared collector path and
resource authorization test. No monitoring scheduler or additional workflow was
introduced. Publication uses the existing Pages and Worker deployment workflows.

## Compact overview (2026-11-04)

The default view shows three provider panels. API billing is primary; manually
verified GitHub free-pool snapshots remain dated and collapsed. Browser history
is marked as a lower bound; incomplete storage estimates cannot be safe.
Low-frequency KV operations and storage details are collapsed, but any warning
or danger metric is promoted automatically. Unknown Oracle egress and static
Cron counts are explained in Read Checks without crowding the main dashboard.
Projects default to billable resources, sorted by artifact/cache occupancy;
static child pages are available through a separate filter. Filters, selected
view and expanded details survive data rerenders. A manual refresh rereads
connection configuration and cannot leave a supplier failure looking successful.
