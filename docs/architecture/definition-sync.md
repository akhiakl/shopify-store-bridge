# Definition sync jobs

Once a connection is APPROVED (`store-pairing.md`), the source can push its
metaobject/metafield definitions (and the other types below) to the target from the
connection's pages under `/app/connections/:connectionId`. This doc covers the design decisions that aren't
obvious from the code. The engine lives in `app/utils/sync/`: selection parsing and
plan resolution in `sync.server.ts`, per-target steps in `syncTarget.server.ts`, and
background execution in `syncQueue.server.ts` / `syncWorker.server.ts`.

## Scope: definitions (+ shop metafield values), manual trigger only

The first sync-execution feature syncs **definitions** (the schema: a metaobject's
`type`/`fieldDefinitions`, a metafield's `namespace`/`key`/`type`): the natural next step
after the existing read-only browser (`definitions.server.ts`) and a much smaller surface
than syncing actual product/metaobject data.

Values sync only when selected on the Values tab, never as a side effect of selecting a
definition. **SHOP-owned metafield values** are the simplest case (see "Shop metafield
value sync" below): Shop is the one owner type with no record-matching problem, since
there's exactly one Shop per store. Values on other records
need to know which target record corresponds to which source record, since the two
stores have separate catalogs with no shared IDs. Product, collection and customer
values now sync by natural key (see "Metafield value sync" below); other owner types
still don't.

Every job is manually triggered: the merchant selects definitions on the checkbox UI and
clicks "Sync now." There's no webhook or scheduler: see "Things intentionally not
built" below.

## One page per type

`app.connections.$connectionId.tsx` is a layout (titled with the other store's name,
breadcrumb, status, page nav). Its index route
is the Job history page, and each type has its own child route: `metafields`
(Definitions | Values tabs), `metaobjects` (Definitions | Entries tabs), `policies`,
`collections`, `menus`, `locations`. Each page loads only its own data from the
source, keeps its own selection, and posts its own "Sync now", so a job usually
covers one type. Tabs use `?tab=` on the same route, so one selection spans both tabs
(a definition and its values can go in one job).

"Sync now" is the page's primary action, slotted into the layout's `s-page`, so the
embedded admin shows it in the title bar and it stays visible on long lists. The
connection's pages are linked from the layout, not the admin sidebar: Shopify's app nav
is one flat level for the whole app and can't nest per-connection pages.

Every page's loader and action go through `utils/sync/connectionRoute.server.ts`, because
React Router runs a layout's loader in parallel with its children's, so a child can't
rely on the layout's access check.

Shop branding (logo, colors, slogan) can't be a page: the Admin API has no `brand`
field on `Shop` and no mutation to update it. Brand is readable only from Liquid and
the Storefront API.

## Target-started syncs (pull into itself)

The target of an APPROVED connection can open the same pages (linked as "Sync from
source" on Connected stores) and pull from the source. `utils/sync/connectionAccess.server.ts`
decides who the viewer is: the source can open its connection in any state; the target
only once it has approved. Either way the pages browse the source's catalog: through
the source's stored offline session when the target is viewing, and "Sync now" queues
the same job, since a connection has only the one target. Approving the pairing is what
allows the target to read the source's catalog.

## Cross-shop admin access: `unauthenticated.admin`

A sync job runs from the _source_ store's request but has to act on the _target_ store's
behalf. `shopify.server.ts` exports `unauthenticated` for exactly this:
`unauthenticated.admin(shop)` loads that shop's own stored offline session and returns an
`admin` client for it, no inbound request from that shop needed (see
`@shopify/shopify-app-react-router`'s own docs on `UnauthenticatedAdminContext`). This is
the same category of "read another shop's session row directly" access
`pairing.server.ts`'s `isShopInstalled` already relies on, just reused for a live
GraphQL client instead of an existence check.

## Execution model: background jobs on Postgres (#110)

"Sync now" doesn't sync inside the request. The action inserts a `QUEUED` `SyncJob`
and starts its first run with `waitUntil` (`@vercel/functions`), which keeps the
function alive after the response is sent. Chosen over a hosted queue (QStash,
Inngest) to avoid a new vendor; the project is on Vercel Hobby.

- **Plan once.** The first run checks the connection is still APPROVED, reads
  everything selected from the source and saves it on the job (`plan`, with
  `stepsTotal`). Every later run works from that snapshot. The plan is cleared when
  the job finishes.
- **Resumable steps.** `buildSyncSteps(plan)` turns the plan into a deterministic,
  ordered list of steps; the job stores `stepsDone`/`stepsTotal`, and a run
  continues from `stepsDone`. Progress is saved once per run. A run that
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
- **Recovery** for a lost hand-off or a dead run: the Job history page's loader
  restarts its connection's stalled jobs (and polls every 3s while a job is unfinished, so an open page
  keeps it moving), and a daily Vercel Cron (`vercel.json`; Hobby allows daily only)
  calls the same endpoint with GET to sweep every stalled job.

Requires `CRON_SECRET` (and `SHOPIFY_APP_URL`, already set for Shopify) in the
Vercel project. Without `CRON_SECRET` the endpoint rejects everything, so a job only
advances while its sync page is open.

## Definitions are never trusted from the browser

The checkbox UI only sends _selection keys_
(`metaobject:<type>` / `metafield:<ownerType>:<namespace>:<key>`), never the actual
field list or type info. The worker's first run re-reads the full definition catalog from the
source store's own admin session right before syncing and filters it down to the
selected keys. A client could otherwise submit an arbitrary "field list" for a
type it doesn't actually control.

## Idempotency: `TAKEN` means skipped, not failed

Re-running a sync that already created a definition on the target used to just surface
whatever `userErrors` message Shopify returned as a target-level failure. Confirmed via
Shopify's schema (`MetaobjectUserErrorCode`/`MetafieldDefinitionCreateUserErrorCode`
enums) that a duplicate-definition error carries `code: "TAKEN"` on both mutations:
`syncTarget.server.ts`'s `createOne` now checks for that code and counts it as
`itemsSkipped`, not `itemsFailed`. A target's status only goes `FAILED` when something
_actually_ went wrong; a clean re-run reports `SUCCEEDED` with a "N already existed" note
instead of reading as an error.

`metafieldsSet` (the shop-value-sync mutation) needed none of this: it's an upsert with
no `TAKEN`-style duplicate error to begin with.

## Shop metafield value sync

Selecting a Shop definition's value on the Values tab (`metafieldValues:SHOP:<namespace>:<key>`,
the same key shape as other owner types) puts that definition in the plan's
`shopMetafieldValues`. Its step in `syncTarget.server.ts` copies the store's own value:

1. Read the source's current value: `shop { metafield(namespace, key) { value type } }`.
   `null` (no value set yet) is a no-op, not a failure.
2. Fetch the target's own Shop id once per target (`{ shop { id } }`), not per
   definition: the first time a Shop value needs it.
3. Write it with `metafieldsSet([{ ownerId: <target Shop id>, namespace, key, value,
type }])`.

This used to ride along automatically with the `metafield:SHOP:…` definition checkbox.
It was split out because a merchant picking definitions expects only the schema to
change on the target, not store data. The definition step now never touches values;
the Values tab says to sync the definition first if the target lacks it. Plans queued
before the split have no `shopMetafieldValues`, which `buildSyncSteps` treats as empty,
so their step counts (and saved resume points) are unchanged.

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
  `kind: VALUE`): bounded by the cap.

## Metafield value sync (#63, phase 2)

Selecting a definition under "Metafield values" (`metafieldValues:<ownerType>:<namespace>:<key>`)
syncs the values records hold for it. Only owner types with a natural key both stores
share are offered: **products and collections by handle, customers by email**.
Variants, orders, pages, blogs and articles have none in the 2026-07 API.

- **Plan holds IDs only.** Planning lists the source records that have a value
  (`metafieldDefinition(identifier).metafields`), capped at `VALUE_CAP_PER_DEFINITION`
  (1,000). Each step reads the current value plus the record's handle or email from the
  source _when it runs_, so emails and values are never written to StoreBridge's database.
- **Steps are batches of 25**, the `metafieldsSet` limit. Per batch: one source read, one
  reference lookup, a target lookup per record (`productByIdentifier` /
  `collectionByIdentifier` / `customerByIdentifier`, cached per target), then one
  `metafieldsSet`. `metafieldsSet` is atomic, so a rejected write fails the whole batch.
- **Unmatched records are SKIPPED with a reason** (no match on the target, no value or
  no longer on the source, customer without an email) and listed in job history.
- **References.** `product_reference`, `collection_reference` and `metaobject_reference`
  (and their `list.` forms) are rewritten to the target's GIDs by handle (type + handle for
  metaobjects). Values sync after entries and collections, so references to records synced
  in the same job resolve. Any other reference type fails that record.
- **Customers.** Reading `defaultEmailAddress` is protected customer data and needs the
  app's access approved in the Partner Dashboard; without it, those batches fail with
  Shopify's error. Job-history rows key customers by their **source GID**, never by email,
  and `customers/redact` deletes those rows (see `webhooks.customers.redact.tsx`).
- Source authoritative, deletes not propagated, same as entries.

## Navigation menu sync (#122)

Selecting a menu under "Navigation menus" (`menu:<handle>`) creates it on each target,
or replaces the items of the target menu with the same handle (`menuUpdate` replaces the
whole item list; a default menu's handle is never changed). Scopes:
read/write_online_store_navigation.

- **Links are resolved at planning time.** `planMenus` turns each item's source
  `resourceId` into a cross-store identity and persists that instead: product,
  collection and metaobject links become a handle (type + handle for metaobjects, via
  the same lookup as metafield references), and policy links become the policy type.
  Frontpage, catalog, all-collections, search and URL links need nothing.
- **At sync time** each link is looked up on the target. A link with no match (record
  missing on the target, policy not set up there) is **dropped together with its
  sub-items** and recorded as a SKIPPED `menuItem:<handle>:<title path>` row with the
  reason, so a partly synced menu is visible in job history.
- **Page, blog, article and customer-account links are always dropped**: they have no
  lookup by shared key yet. The menu row in the UI says how many a menu has.
- Menus run last, after policies, collections, entries and values, so links to records
  synced in the same job resolve. A failed lookup or a rejected write fails the whole
  menu.

## Collection rule sync (#125)

A selected collection (`collection:<handle>`) syncs its shell (title, description, SEO,
sort order, template; upserted by handle) and then its **rules**, the 2026-07+ `sources`
model that replaced `ruleSet`.

- **Planning** reads the source collection's sources and replaces every ID with a key
  both stores share: metafield definitions by owner type/namespace/key, metaobjects by
  type/handle, hand-picked products and collections (sub-collections, "not in
  collection" exclusions) by handle. Plain rules (tag, title, type, vendor, status,
  category, variant price/weight/inventory/title) are kept as their input. Each
  condition type is aliased by its input key in the read query, because GraphQL can't
  merge same-named fields of different enum and scalar types.
- **All or nothing per collection.** If any part can't be mapped (an unknown rule type,
  another app's shareable source, variant picks, more than 250 picks, or something
  missing on the target), the target's rules are **left alone** and a SKIPPED
  `collectionRules:<handle>` row records why. Dropping one rule could make the
  collection match far more products than on the source.
- **Rules replace the target's** in one `collectionUpdate` (`sourcesToDelete` for its
  non-shareable sources + `sourcesToCreate`); other apps' shareable sources are kept.
  The source is authoritative, so a collection with no rules clears the target's.
- **Own step, later in the job**: rules run after every collection shell and metaobject
  entry, so rules pointing at collections or entries synced in the same job resolve.

## Location sync (#123)

Selecting a location under "Locations" (`location:<name>`) upserts it on each target **by
exact name**, which Shopify keeps unique per store: a match gets the source's address and
"fulfills online orders" setting (`locationEdit`), no match is created (`locationAdd`).
Scopes: read/write_locations.

- **Renames aren't tracked.** A location renamed on the source creates a new one on the
  target at the next sync; the old one stays. Matching by a stored source ID was
  considered and rejected as more machinery than the case needs.
- **Active state isn't synced.** Deactivating needs inventory moved first, so each store
  manages it. Only active source locations are offered, but an inactive target location
  with the same name is still edited rather than duplicated.
- **Fulfillment-service locations are left out** on the source, and a target name held
  by one fails that location: those belong to the fulfillment app.
- Inventory, local pickup and shipping settings aren't synced.

## Job/job-item schema

One `SyncJob` row per "Sync now" click: its connection, the requested selection, status,
timing, the saved plan and progress (`stepsDone`/`stepsTotal`), and item counts
(`itemsSynced`/`itemsSkipped`/`itemsFailed`). One `SyncJobItem` row per item attempted
(`key`: the selection-key format from `definitionKey.ts`; `kind`: `DEFINITION` |
`VALUE`; `status`: `SUCCEEDED` | `SKIPPED` | `FAILED`; `errorMessage`). The counts make
the history table's one-line summary cheap; the items are what "View details" lists
(only failures and reasoned skips).

Jobs used to have a `SyncJobTarget` row per target, back when a job could go to several
stores; with one target per connection it was folded into `SyncJob` (migration
`0008_connections.sql`). `PARTIAL` stays in the status enum for jobs recorded before
then.

Schema file split: `SyncJob`/`SyncJobItem` live in
`app/db/syncJobsSchema.server.ts`, not `schema.server.ts` (which holds the pairing domain:
`Session`/`Store`/`Connection`): adding `SyncJobItem` would have pushed
`schema.server.ts` past the 300-line file limit (AGENTS.md §5). The import graph is
strictly one-directional to avoid an ESM circular-import risk: `syncJobsSchema.server.ts`
imports `connections` from `schema.server.ts`, never the reverse; the shared
`serviceRoleOnly` RLS-policy helper lives in its own leaf file (`rls.server.ts`) so both
schema files can import it without importing each other. `db.server.ts` combines both via
object spread into one `schema` object for Drizzle's relational query API.

## Things intentionally _not_ built (YAGNI)

- **Webhooks/automatic sync on source change.** Manual-trigger only, per the product
  decision this feature shipped with. Revisit once merchants actually ask for it.
- **Value sync for owners without a shared key** (variants, orders, pages,
  blogs, articles). Would need a mapping table or custom IDs; see #63.
- **Page, blog and article menu links.** Dropped for the same reason; menus sync
  everything else (#122).
