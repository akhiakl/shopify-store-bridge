# Contributing

Local setup and the day-to-day workflow for this repo. For coding standards (file/param
limits, SOLID/YAGNI, commit conventions) see [`AGENTS.md`](AGENTS.md) — read it once before
writing code, it's enforced by tooling, not just convention.

## Prerequisites

- Node `^22.22.2 || ^24.15.0 || >=26.0.0` (see `engines` in `package.json`)
- pnpm — the lockfile is `pnpm-lock.yaml`; other package managers aren't supported. Version
  is pinned via `packageManager` in `package.json`; run via Corepack (`corepack enable`) or
  install it directly
- A Postgres database for session storage — a local instance is enough for dev/e2e; see
  [`DEPLOYMENT.md`](DEPLOYMENT.md) for the production Supabase setup

## Setup

```bash
git clone https://github.com/akhiakl/shopify-store-bridge.git
cd shopify-store-bridge
pnpm install --frozen-lockfile
cp apps/storebridge/.env.example apps/storebridge/.env
```

Fill in `apps/storebridge/.env`:

- `DATABASE_URL` — your local (or Supabase) Postgres connection string
- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`, `SHOPIFY_APP_URL` — set by `shopify app
config link` once you've linked a Shopify app registration (see `apps/storebridge/package.json`'s
  `config:link*` scripts); any values work for running tests, since nothing in the test
  suites calls the real Shopify API

Then apply migrations:

```bash
pnpm exec prisma migrate deploy --schema apps/storebridge/prisma/schema.prisma
```

## Running the app

```bash
pnpm --filter storebridge run dev
```

This runs `shopify app dev`, which needs a linked Shopify app (see Setup above) — it logs
into your Partner/Dev Dashboard account, opens a tunnel, and installs the app on a dev store.

## Testing

```bash
pnpm run test:coverage      # unit — Vitest + React Testing Library, ≥80% coverage on touched files
pnpm run test:e2e           # e2e — Playwright; needs the env vars + migrated database above
```

`test:e2e` builds the app first (`turbo`'s task graph handles this) and boots it against
`DATABASE_URL` — it forges its own Shopify session token locally rather than calling the
real API, so no live store is needed. See `apps/storebridge/e2e/support/embedded-fixture.ts`
for how.

## Linting & type-checking

```bash
pnpm run lint
pnpm run typecheck
```

Both also run automatically: `lint` (via lint-staged) on `git commit`, both plus the full
test suite and a build on `git push` (Husky `pre-push`).

## Git workflow

Trunk-based: `main` is the trunk, short-lived branches merge via PR after CI passes.

- Branch names: `feature/<name>`, `fix/<name>`, `docs/<name>`, `chore/<name>`
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) —
  `type(scope): subject`, enforced by commitlint on `git commit`
- One logical change per commit; PR description follows `.github/PULL_REQUEST_TEMPLATE.md`

## Where to go next

- [`AGENTS.md`](AGENTS.md) — standards enforced on every change
- [`apps/storebridge/README.md`](apps/storebridge/README.md) — the app's stack, auth/GraphQL
  usage, webhooks
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — Shopify app registration + Vercel hosting
