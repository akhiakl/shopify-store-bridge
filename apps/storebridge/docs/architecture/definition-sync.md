# Definition sync jobs

Once a sync group has an APPROVED target (`store-pairing.md`), the source can push its
metaobject/metafield definitions to that target from
`app.groups.$groupId.definitions`. This doc covers the design decisions that aren't
obvious from the code — the job orchestration lives in `sync.server.ts`, the actual
per-target mutations in `syncTarget.server.ts`.

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

## Execution model: synchronous, not queued

`runSyncJob` runs inline inside the `action` — no job queue or worker process exists in
this app, and the volume (a handful of selected definitions × a handful of approved
targets) is small enough that a Vercel serverless function's execution window covers it
comfortably. If job volume or target count ever grows enough to make this slow, the fix
is a real background-job system (a queue + worker), not a bigger timeout — revisit then.

## Definitions are never trusted from the browser

The checkbox UI only sends _selection keys_
(`metaobject:<type>` / `metafield:<ownerType>:<namespace>:<key>`) — never the actual
field list or type info. `runSyncJob` re-reads the full definition catalog from the
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

## Job/job-target schema

One `SyncJob` row per "Sync now" click (group, requested selection, overall status,
timing) and one `SyncJobTarget` row per target that was APPROVED when the job ran
(per-target status, item counts, error). Same reasoning as `Store`/`SyncGroup`/
`SyncGroupTarget`'s split in `data-model.md`: a job's overall status and one target's
result are genuinely different things — a run can succeed for one target and fail for
another.

## Things intentionally _not_ built (YAGNI)

- **Webhooks/automatic sync on source change.** Manual-trigger only, per the product
  decision this feature shipped with. Revisit once merchants actually ask for it.
- **Resource-level metafield value sync** (Product/Customer/Order/…). Needs a
  record-matching step this app doesn't have yet — see "Scope" above.
- **Per-item sync log.** `SyncJobTarget` keeps counts (`itemsSynced`/`itemsSkipped`/
  `itemsFailed`), not a row per definition attempted — nothing today needs to know
  _which_ definition failed within a target, just how many did.
