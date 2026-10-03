# Data model

`app/db/schema.server.ts` holds two genuinely different kinds of data, owned by two different things — worth being explicit about since they live in the same database and it's easy to conflate them.

## `Session` — not ours

Owned and shaped by `@shopify/shopify-app-session-storage-drizzle`, not application code. StoreBridge never queries or writes it directly except through `DrizzleSessionStoragePostgres` (wired up once, in `shopify.server.ts`) — the one exception is `pairing.server.ts`'s `isShopInstalled`, which reads it directly as a cheap "does this shop have an offline session" check, the same signal `authenticate.admin` itself relies on.

Don't add columns to this table for app purposes, and don't rename its columns — `sessions`' column names/modifiers in `schema.server.ts` are pinned to exactly match `@shopify/shopify-app-session-storage-drizzle`'s own reference schema (its `DrizzleSessionStoragePostgres` constructor is typed against that literal shape). If a schema migration ever changes its shape upstream, that's a `@shopify/shopify-app-session-storage-drizzle` version bump, not a hand edit.

## `Store` / `SyncGroup` / `SyncGroupTarget` — StoreBridge's own

Everything else — the actual product. See `store-pairing.md` for the domain logic; this is just the shape:

- **`Store`** — one row per shop that's ever been involved in a pairing, either as source or target. Created lazily (upsert-on-conflict) the first time a shop appears in either role, not on install — a shop can be _invited_ before it's ever opened the `/app/stores` dashboard itself.
- **`SyncGroup`** — a source store's named (or unnamed) collection of paired targets. `sourceId` is fixed at creation; there's no "transfer ownership" operation.
- **`SyncGroupTarget`** — the actual pairing record, one row per (group, target store) pair, with a lifecycle: `PENDING` → `APPROVED` | `DECLINED`. Carries `authTokenHash`/`authTokenExpiresAt` for the out-of-band approval mechanism (see `store-pairing.md`) — null once approved/declined or once the token's been redeemed.

Table and column names here (`Store`, `SyncGroup`, `SyncGroupTarget`, camelCase columns) match what the original Prisma-based schema created in Supabase — carried over as-is during the Prisma→Drizzle migration so existing data didn't need a rename migration. `Store`/`SyncGroup`/`SyncGroupTarget` primary keys default to Postgres's own `gen_random_uuid()` now, not Prisma's app-side `cuid()` — both are just opaque text ids, so this only affects the format of newly-inserted rows, not existing ones.

## Why Postgres, not Shopify metaobjects

The project's default for shop-local data is Shopify's own metaobjects/metafields (`$app:` namespace) — see AGENTS.md's tooling section. Pairing data is the deliberate exception: a `SyncGroupTarget` row represents a relationship spanning _two_ shops' worth of state (an invite pending approval before either side has agreed to trust the other), which can't be represented as a single shop's metaobject without picking one side to own it awkwardly. A real database is the natural fit for genuinely cross-shop state; metaobjects remain correct for anything that's actually local to one shop.

## Migrations

Drizzle migrations, generated with `pnpm run db:generate` (`drizzle-kit generate` — diffs `app/db/schema.server.ts` against the SQL/snapshots already in `drizzle/`, no DB connection needed) and applied with `pnpm run db:migrate` (`drizzle-kit migrate`, wired into `docker-start`/CI/`shopify.web.toml`'s `dev` command). Unlike Prisma's `migrate dev`, `generate` works fine in a non-interactive/CI-like environment — there's no separate "diff yourself" workaround needed.

**One-time note for Supabase specifically**: the tables already existed there (created by the Prisma migrations this replaced) before the first Drizzle migration (`drizzle/0000_*.sql`) was generated, so that baseline migration must never actually be _run_ against the existing Supabase database — its `CREATE TABLE` statements would fail with "relation already exists". Instead, mark it applied without running it, by inserting its hash (from `drizzle/meta/_journal.json`) directly into drizzle-kit's own tracking table (`drizzle."__drizzle_migrations"`, created automatically) before ever running `drizzle-kit migrate` against Supabase. A fresh database (CI's ephemeral Postgres service, a new local dev database) has no such history and just runs `drizzle-kit migrate` normally.
