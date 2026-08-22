# StoreBridge

A Shopify embedded admin app. This repo is a [Turborepo](https://turborepo.com/) monorepo:

- **[`apps/storebridge`](apps/storebridge/README.md)** — the app itself. Start there for
  what it does, its stack, and app-specific docs.
- **`packages/*`** — shared, reusable config (`@repo/eslint-config`, `@repo/typescript-config`,
  `@repo/vitest-config`) consumed by workspace members via `"@repo/<name>": "*"`.

## Getting started

New to this repo? See **[`CONTRIBUTING.md`](CONTRIBUTING.md)** for cloning, environment
setup, running the app locally, and the git/PR workflow.

Root-level scripts (`pnpm run build`, `lint`, `typecheck`, `test`, `test:coverage`,
`test:e2e`) fan out to every workspace via `turbo run <task>`. To target just the app, add
`--filter storebridge` (e.g. `pnpm --filter storebridge run dev`), or `cd
apps/storebridge` and use its own `package.json` scripts directly.

## More docs

- **[`AGENTS.md`](AGENTS.md)** — engineering standards (file/param limits, SOLID/YAGNI,
  commit conventions, tooling) that apply to any change in this repo, human or AI-assisted.
- **[`DEPLOYMENT.md`](DEPLOYMENT.md)** — Shopify app registration (staging/production) and
  Vercel hosting setup.
- **[`apps/storebridge/README.md`](apps/storebridge/README.md)** — the app's stack,
  authentication/GraphQL usage, webhooks, and troubleshooting.
