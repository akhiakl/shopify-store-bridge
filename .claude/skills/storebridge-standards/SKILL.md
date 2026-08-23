---
name: storebridge-standards
description: Use whenever writing, editing, or reviewing code in the StoreBridge repo — any TypeScript/React file, GraphQL operation, config, or commit. Covers the project's hard rules on file size, function params, test coverage, git hooks, GraphQL codegen, and commit hygiene. Trigger on any code-producing or committing task in this repo, not just when explicitly asked about "standards."
---

# StoreBridge Engineering Standards

Full detail lives in `AGENTS.md` at the repo root — read it once per session before writing code. This file is the quick-reference trigger.

## Before writing any code

1. If anything is ambiguous — ask. Don't guess and proceed.
2. Shopify GraphQL → verify via Shopify Dev MCP first; mark unverified if MCP is unavailable.
3. New dependency → check its actual latest version, don't assume from memory.
4. Prefer the library's official CLI/init command over a hand-written config.

## While writing code

- File ≤ 300 lines (source) / ≤ 500 lines (tests) — enforced by ESLint's
  `max-lines` (`packages/eslint-config/index.cjs`), not just documented.
  Split by responsibility before reaching for `eslint-disable`.
- Functions ≤ 3 parameters — 4+ becomes a single options object. Enforced
  the same way (`max-params`).
- JSDoc on exported symbols and non-obvious logic only; comments explain _why_.
- Polaris for UI; every async action has loading/error/empty states.

### SOLID, applied to this codebase — not ceremony

- **S**ingle responsibility: a route module's `loader`/`action` orchestrates;
  it doesn't also contain the GraphQL query string, the business rule, _and_
  the presentation logic inline. Pull a named function (or a `.server.ts`
  sibling) out once a loader/action does more than "fetch, validate,
  respond."
- **O**pen/closed: `packages/eslint-config`, `typescript-config`,
  `vitest-config` exist so new workspace members extend them via
  `overrides`/`extends`, not by forking the base file. Same idea inside the
  app — e.g. `createVitestConfig(overrides)` takes an object apps merge
  into, not a version apps copy-paste and edit.
- **L**iskov: don't give a narrower implementation of a shared interface
  (e.g. a webhook handler, a session-storage adapter) surprising
  preconditions the type doesn't advertise — callers should be able to swap
  one Shopify webhook route for another without reading its internals first.
- **I**nterface segregation: a component or function takes the fields it
  actually uses, not the whole `Shop`/`Session` object "in case." Makes
  props easy to test and mock.
- **D**ependency inversion: routes depend on `app/shopify.server.ts`'s
  exported `authenticate`/`sessionStorage`, never construct a new
  `shopifyApp(...)` instance inline — one seam, one place to swap for tests.

### YAGNI — strictly, not just as a slogan

Don't add: a config knob nothing reads yet, a resource type or extension
point for a "phase 2" that isn't scheduled, an abstraction layer over a
single implementation "in case we need a second one." One concrete
precedent already in this repo: `AGENTS.md` §5 explicitly defers turning on
`coverage.all: true` until there's enough tested surface area to not
immediately fail the pre-push hook — the flag exists, but flipping it is
deferred until it's actually useful, and that's written down as an open
decision rather than silently done "for completeness." Follow that pattern:
when you're tempted to build ahead of current scope, either don't, or write
down the open decision the way that one is written down.

### Folder structure — colocate, then promote (AGENTS.md §6)

- `app/routes/` is file-based (`@react-router/fs-routes`). A route with no
  helpers of its own stays a flat file; once it needs
  components/hooks/utils, it becomes a folder (`route.tsx` + `components/`,
  `hooks/`, `utils/` as actually needed — no empty scaffolding).
- Used by a second route? Promote — `git mv` to shared `app/components/`,
  `app/hooks/`, or `app/utils/`. Never promote pre-emptively.
- One export per file, named to match. Tests sit beside the file they test
  (`useThing.ts` + `useThing.test.ts`), not in a `__tests__/` folder.
- `~/` (→ `app/`) for anything outside the current folder; a single `../`
  to a colocated sibling is fine, `../../`+ is an ESLint error
  (`no-restricted-imports`) — move the file or use `~/` instead.

## Before committing

- Run through `pre-commit` (lint-staged: ESLint --fix + Prettier) mentally — code should already pass it.
- Conventional Commit message (`type(scope): subject`), one logical change per commit.
- **Never** add AI co-author trailers or "generated with" footers.

## Before pushing

- Type-check, build, and full test suite (≥80% coverage on touched files) all pass — these run automatically via Husky `pre-push`, fanned out across the monorepo via `turbo run <task>`.
- Note: coverage currently only counts files a test imports (`coverage.all: false`) — see AGENTS.md §5 for when to revisit this.
- Unit tests (Vitest + RTL) and e2e tests (Playwright) are separate suites — `pnpm run test:coverage` runs unit only; `pnpm run test:e2e` (from `apps/storebridge`) runs e2e. Both must pass, but only unit tests gate the 80% coverage floor.

## Repo layout (Turborepo monorepo)

- `apps/storebridge` — the Shopify app: `app/`, `prisma/`, `e2e/`, its own `package.json`/`tsconfig.json`/`.eslintrc.cjs`/`vitest.config.ts`/`playwright.config.ts`.
- `packages/eslint-config`, `packages/typescript-config`, `packages/vitest-config` — shared config, consumed via `"@repo/<name>": "*"`.
- Root — `turbo.json`, `pnpm-workspace.yaml`, `.npmrc`, `commitlint.config.cjs`, `.lintstagedrc.json`, `.husky/*` (Husky/commitlint/lint-staged stay root-level; they run repo-wide, not per-app).
- `apps/storebridge/prisma/schema.prisma` — session/token store (Supabase Postgres) _and_ the app's own cross-shop data (store pairing) — see `apps/storebridge/docs/architecture/data-model.md` for which is which.

## Deeper context (per-app, not covered above)

- `apps/storebridge/docs/architecture/` — auth/session flow, the data model, and the store-pairing trust design. Read the relevant one before touching auth code or the pairing feature; none of this is derivable from the code alone.
- `storebridge-auth-troubleshooting` skill — the embedded app isn't authenticating, or a session isn't persisting.
- `storebridge-dependency-parity` skill — checking whether config/dependencies drifted from what `shopify app init` actually scaffolds.
