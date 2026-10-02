# Definition sync jobs

Once a sync group has an APPROVED target (`store-pairing.md`), the source can push its
metaobject/metafield definitions to that target from
`app.groups.$groupId.definitions`. This doc covers the design decisions that aren't
obvious from the code. The engine lives in `app/utils/sync/`: selection parsing and
plan resolution in `sync.server.ts`, per-target steps in `syncTarget.server.ts`, and
background execution in `syncQueue.server.ts` / `syncWorker.server.ts`.

## Scope: definitions (+ shop metafield values), manual trigger only

The first sync-execution feature syncs **definitions** (the schema: a metaobject's
`type`/`fieldDefinitions`, a metafield's `namespace`/`key`/`type`) — the natural next step
after the existing read-only browser (`definitions.server.ts`) and a much smaller surface
than syncing actual product/metaobject data.

One exception: **SHOP-owned metafield values do sync**, riding along with their
definition (see "Shop metafield value sync" below). Resource-level values (Product,
Customer, Order, …) don't, and won't until something solves the harder problem those
need — matching which record on the target corresponds to which record on the source,
since the two stores have entirely separate catalogs with no shared IDs. Shop is the one
owner type where that problem doesn't exist: there's exactly one Shop per store.

Every job is manually triggered: the merchant selects definitions on the checkbox UI and
clicks "Sync now." There's no webhook or scheduler — see "Things intentionally not
built" below.

## Cross-shop admin access: `unauthenticated.admin`

A sync job runs from the _source_ store's request but has to act on the _target_ store's
behalf. `shopify.server.ts` exports `unauthenticated` for exactly this —
`unauthenticated.admin(shop)` loads that shop's own stored offline session and returns an
`admin` client for it, no inbound request from that shop needed (see
`@shopify/shopify-app-react-router`'s own docs on `UnauthenticatedAdminContext`). This is
the same category of "read another shop's session row directly" access
`pairing.server.ts`'s `isShopInstalled` already relies on — just reused for a live
GraphQL client instead of an existence check.

## Execution model: background jobs on Postgres (#110)

"Sync now" doesn't sync inside the request. The action inserts a `QUEUED` `SyncJob`
and starts its first run with `waitUntil` (`@vercel/functions`), which keeps the
function alive after the response is sent. Chosen over a hosted queue (QStash,
Inngest) to avoid a new vendor; the project is on Vercel Hobby.

- **Plan once.** The first run reads everything selected from the source and saves it
  on the job (`plan`), then creates one `PENDING` `SyncJobTarget` per target that's
  APPROVED at that moment. Every later run works from that snapshot. The plan is
  cleared when the job finishes.
- **Resumable steps.** `buildSyncSteps(plan)` turns the plan into a deterministic,
  ordered list of steps; each target stores `stepsDone`/`stepsTotal`, and a run
  continues from `stepsDone`. Progress is saved once per target per run. A run that
  dies before saving redoes those steps next time, which is harmless because every
  step is an idempotent create/upsert.
- **Time-boxed runs.** Each run stops starting new steps after `RUN_BUDGET_MS` (25s),
  well under Vercel's function duration (300s with Fluid compute, Hobby included).
- **Hand-off.** A run that leaves work behind POSTs to `/api/sync-worker` with
  `Authorization: Bearer $CRON_SECRET`; that endpoint replies 202 at once and runs
  the next chunk in its own `waitUntil`, so no caller ever waits on the chain.
- **One run per job.** A run claims the job by setting `lockedUntil` (90s) with a
  conditional update; a second run finds it locked and stops ("busy"). A run that
  dies leaves the lock to expire.
- **Recovery** for a lost hand-off or a dead run: the sync page's loader restarts its
  group's stalled jobs (and polls every 3s while a job is unfinished, so an open page
  keeps it moving), and a daily Vercel Cron (`vercel.json`; Hobby allows daily only)
  calls the same endpoint with GET to sweep every stalled job.

Requires `CRON_SECRET` (and `SHOPIFY_APP_URL`, already set for Shopify) in the
Vercel project. Without `CRON_SECRET` the endpoint rejects everything, so a job only
advances while its sync page is open.

## Definitions are never trusted from the browser

The checkbox UI only sends _selection keys_
(`metaobject:<type>` / `metafield:<ownerType>:<namespace>:<key>`) — never the actual
field list or type info. The worker's first run re-reads the full definition catalog from the
source store's own admin session right before syncing and filters it down to the
selected keys. A client could otherwise submit an arbitrary "field list" for a
type it doesn't actually control.

## Idempotency: `TAKEN` means skipped, not failed

Re-running a sync that already created a definition on the target used to just surface
whatever `userErrors` message Shopify returned as a target-level failure. Confirmed via
Shopify's schema (`MetaobjectUserErrorCode`/`MetafieldDefinitionCreateUserErrorCode`
enums) that a duplicate-definition error carries `code: "TAKEN"` on both mutations —
`syncTarget.server.ts`'s `createOne` now checks for that code and counts it as
`itemsSkipped`, not `itemsFailed`. A target's status only goes `FAILED` when something
_actually_ went wrong; a clean re-run reports `SUCCEEDED` with a "N already existed" note
instead of reading as an error.

`metafieldsSet` (the shop-value-sync mutation) needed none of this — it's an upsert with
no `TAKEN`-style duplicate error to begin with.

## Shop metafield value sync

For each selected metafield definition with `ownerType: SHOP`, once its definition step
succeeds or is skipped-as-`TAKEN` on a target, `syncTarget.server.ts` also copies its
_value_:

1. Read the source's current value: `shop { metafield(namespace, key) { value type } }`.
   `null` (no value set yet) is a no-op, not a failure.
2. Fetch the target's own Shop id once per target (`{ shop { id } }`) — not per
   definition — the first time a SHOP-owned def needs it.
3. Write it with `metafieldsSet([{ ownerId: <target Shop id>, namespace, key, value,
type }])`.

No new selection UI: this rides along automatically with the existing
`metafield:SHOP:<namespace>:<key>` checkbox — selecting a shop metafield definition
means "sync this and its value," since for Shop (unlike Product/Customer/Order) there's
no ambiguity about _which_ value that means.

## Metaobject entry sync (#63, phase 1)

Selecting a type under "Metaobject entries" (`metaobjectEntries:<type>`)
syncs its entries, not just its definition. Design record and the decisions
behind it: issue #63. In short:

- **Matched by `(type, handle)`.** `metaobjectUpsert` creates or updates by
  handle natively, so there's no cross-store matching problem and no mapping
  table. Source is authoritative for every field it has a value for.
- **Not mirrored:** a field that's empty on the source is left as-is on the
  target (the `metaobject:` argument updates only fields given; the
  full-replacement `values:` argument's JSON shape isn't described by the
  schema), and deleting a source entry never deletes it on a target.
- **References.** `metaobject_reference` / `list.metaobject_reference`
  values are source GIDs, meaningless on a target. They're read as
  `(type, handle)` via one `nodes(ids:)` lookup on the source, then
  resolved to the target's own GIDs with `metaobjectByHandle`. Selected
  types are ordered so a referenced type syncs first; a reference that
  still can't be resolved fails that entry and succeeds on a re-run. Any
  other non-empty reference field (file, product, page, …) fails the entry
  with an explicit reason: those records have no shared identity yet.
- **Capped at `ENTRY_CAP_PER_TYPE` (1,000) entries per type per job**
  (`entryCap.ts`). Syncing is chunked across runs (see "Execution model"), but the
  planning run reads every selected entry from the source in one go, and the cap
  bounds that. The UI shows each type's entry count and says when the cap applies.
- One `SyncJobItem` per entry (`metaobjectEntry:<type>:<handle>`,
  `kind: VALUE`) — bounded by the cap.

## Job/job-target/job-item schema

One `SyncJob` row per "Sync now" click (group, requested selection, overall status,
timing), one `SyncJobTarget` row per target that was APPROVED when the job ran
(per-target status, item counts, error), and one `SyncJobItem` row per definition-or-value
attempt within that target (`key` — the same `metaobject:<type>` /
`metafield:<ownerType>:<namespace>:<key>` format the selection UI uses, unchanged for
both steps of a SHOP metafield; `kind`: `DEFINITION` | `VALUE` is what distinguishes the
definition-create attempt from the value-copy attempt that can follow it for the same
key; `status`: `SUCCEEDED` | `SKIPPED` | `FAILED`; `errorMessage`). Same reasoning as `Store`/
`SyncGroup`/`SyncGroupTarget`'s split in `data-model.md`: a job's overall status, one
target's result, and one item's outcome within that target are genuinely different
things — a run can succeed for one target and fail for another, and within a failed
target only one of several selected items might be the actual problem.
`runSyncSteps` returns each run's `items`, folded into counts by `tallyItems` — the counts and the
per-item detail travel together, but `SyncJobTarget` keeps only the counts (cheap to
render a summary line from) while the per-item detail is `SyncJobItem` rows, joined in by
`getJobHistory` and rendered by `JobHistoryList` (only failed items are surfaced there
today — "N synced, M already existed, K failed" plus a line per failure — since a
successful or skipped item's `key`/`kind` alone isn't yet useful to show).

Schema file split: `SyncJob`/`SyncJobTarget`/`SyncJobItem` live in
`app/db/syncJobsSchema.server.ts`, not `schema.server.ts` (which holds the pairing domain:
`Session`/`Store`/`SyncGroup`/`SyncGroupTarget`) — adding `SyncJobItem` would have pushed
`schema.server.ts` past the 300-line file limit (AGENTS.md §5). The import graph is
strictly one-directional to avoid an ESM circular-import risk: `syncJobsSchema.server.ts`
imports `stores`/`syncGroups` from `schema.server.ts`, never the reverse; the shared
`serviceRoleOnly` RLS-policy helper lives in its own leaf file (`rls.server.ts`) so both
schema files can import it without importing each other. `db.server.ts` combines both via
object spread into one `schema` object for Drizzle's relational query API.

## Things intentionally _not_ built (YAGNI)

- **Webhooks/automatic sync on source change.** Manual-trigger only, per the product
  decision this feature shipped with. Revisit once merchants actually ask for it.
- **Resource-level metafield value sync** (Product/Customer/Order/…). Needs a
  record-matching step this app doesn't have yet — see "Scope" above. The
  agreed approach (natural keys: handle/email) is phase 2 of #63.
