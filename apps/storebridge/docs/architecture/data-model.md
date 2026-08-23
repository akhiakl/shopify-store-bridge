# Data model

`prisma/schema.prisma` holds two genuinely different kinds of data, owned by two different things — worth being explicit about since they live in the same database and it's easy to conflate them.

## `Session` — not ours

Owned and shaped by `@shopify/shopify-app-session-storage-prisma`, not application code. StoreBridge never queries or writes it directly except through `PrismaSessionStorage` (wired up once, in `shopify.server.ts`) — the one exception is `pairing.server.ts`'s `isShopInstalled`, which reads it directly as a cheap "does this shop have an offline session" check, the same signal `authenticate.admin` itself relies on.

Don't add columns to this model for app purposes. If a schema migration ever changes its shape upstream, that's a `@shopify/shopify-app-session-storage-prisma` version bump, not a hand edit.

## `Store` / `SyncGroup` / `SyncGroupTarget` — StoreBridge's own

Everything else — the actual product. See `store-pairing.md` for the domain logic; this is just the shape:

- **`Store`** — one row per shop that's ever been involved in a pairing, either as source or target. Created lazily (`upsert`) the first time a shop appears in either role, not on install — a shop can be _invited_ before it's ever opened the `/app/stores` dashboard itself.
- **`SyncGroup`** — a source store's named (or unnamed) collection of paired targets. `sourceId` is fixed at creation; there's no "transfer ownership" operation.
- **`SyncGroupTarget`** — the actual pairing record, one row per (group, target store) pair, with a lifecycle: `PENDING` → `APPROVED` | `DECLINED`. Carries `authTokenHash`/`authTokenExpiresAt` for the out-of-band approval mechanism (see `store-pairing.md`) — null once approved/declined or once the token's been redeemed.

## Why Postgres, not Shopify metaobjects

The project's default for shop-local data is Shopify's own metaobjects/metafields (`$app:` namespace) — see AGENTS.md's tooling section. Pairing data is the deliberate exception: a `SyncGroupTarget` row represents a relationship spanning _two_ shops' worth of state (an invite pending approval before either side has agreed to trust the other), which can't be represented as a single shop's metaobject without picking one side to own it awkwardly. A real database is the natural fit for genuinely cross-shop state; metaobjects remain correct for anything that's actually local to one shop.

## Migrations

Standard Prisma migrations (`prisma/migrations/`), applied via `prisma migrate deploy` (wired into `predev`/`docker-start`/CI). One thing worth knowing if you're generating a new one in an environment where `prisma migrate dev` refuses to run (it requires an interactive terminal — fails in CI-like/non-interactive sessions with "Prisma Migrate has detected that the environment is non-interactive"): generate the SQL yourself instead —

```bash
pnpm exec prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

— then hand-create the `prisma/migrations/<timestamp>_<name>/migration.sql` file with that output and run `pnpm exec prisma migrate deploy` to apply it. This is exactly how the pairing-authorization token columns were added.
