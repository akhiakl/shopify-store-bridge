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

- File ≤ 300 lines (source) / ≤ 500 lines (tests) — split by responsibility before disabling the rule.
- Functions ≤ 3 parameters — 4+ becomes a single options object.
- SOLID pragmatically, YAGNI strictly — don't build for phases not yet in scope.
- JSDoc on exported symbols and non-obvious logic only; comments explain _why_.
- Polaris for UI; every async action has loading/error/empty states.

## Before committing

- Run through `pre-commit` (lint-staged: ESLint --fix + Prettier) mentally — code should already pass it.
- Conventional Commit message (`type(scope): subject`), one logical change per commit.
- **Never** add AI co-author trailers or "generated with" footers.

## Before pushing

- Type-check, build, and full test suite (≥80% coverage on touched files) all pass — these run automatically via Husky `pre-push`.
- Note: coverage currently only counts files a test imports (`coverage.all: false`) — see AGENTS.md §5 for when to revisit this.

## Config file locations (already scaffolded)

`.eslintrc.cjs`, `vitest.config.ts`, `vitest.setup.ts`, `commitlint.config.cjs`, `.lintstagedrc.json`, `.husky/pre-commit`, `.husky/commit-msg`, `.husky/pre-push`, `prisma/schema.prisma` (Supabase Postgres).
