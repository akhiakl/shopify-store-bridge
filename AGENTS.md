# Shopify app development

This is a Turborepo monorepo. The Shopify app itself lives in `apps/storebridge`
(scaffolded from a Shopify app template — see its README for framework-specific
details); `packages/*` holds shared, reusable config (ESLint, TypeScript, Vitest)
consumed by workspace members via `"@repo/<name>": "*"`.

Use the [Shopify AI Toolkit](https://shopify.dev/docs/apps/build/ai-toolkit) for all Shopify API and platform work. If missing, install it in the agent host per that page (or `npx skills add Shopify/shopify-ai-toolkit --list` for skill-compatible hosts) — do not add tooling to this repo.

---

# StoreBridge — Agent Instructions

Everything below governs how any coding agent works in _this_ repo specifically, on top of the Shopify-generic guidance above.

## 1. Never assume — ask when in doubt

- Ambiguous or missing requirement, API shape, config value, business rule → **stop and ask a specific question**, don't silently pick a default.
- Exception: trivial implementation details with zero product impact (internal naming, file layout within an already-agreed structure) — proceed, note the choice in the commit body.
- Never invent Shopify field/mutation/argument names from memory. If unverifiable, say so (see §2).

## 2. Always latest, always verified

- Any Shopify GraphQL work → use the **Shopify Dev MCP** first (`search_docs_chunks`/`fetch_full_docs`, `introspect_graphql_schema`, `validate_graphql_codeblocks`). Training data on Shopify APIs is assumed stale.
- MCP unavailable this session → say so explicitly, mark the code `// UNVERIFIED — confirm via Shopify Dev MCP before merge`.
- Before adding any dependency, check its actual latest stable version (`npm view <pkg> version`) — don't reuse a version number from memory.
- Pin the Admin API version to the latest **stable** release (not `unstable`, not a release candidate) in `shopify.app.toml` and all clients; re-check each new session — Shopify ships quarterly.

## 3. Prefer CLI scaffolding over hand-written config

Use the official generator when one exists, then tune its output to match §5–§7 — don't hand-roll from scratch. Manual file creation is the fallback for anything with no maintained generator.

## 4. Git & commits

- **One logical step per commit** — don't bundle unrelated changes.
- **Conventional Commits**: `type(scope): subject` — `feat|fix|refactor|test|docs|chore|build|ci|perf`. Enforced by commitlint.
- **No AI attribution.** Never add `Co-Authored-By: Claude`, "Generated with Claude Code," or similar. Commits read as the engineer's own.
- Commit body explains _why_ when it isn't obvious from the diff.

## 5. Hard limits (enforced by tooling, not convention)

| Rule                      | Limit                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| Max lines per source file | 300                                                                                      |
| Max lines per test file   | 500                                                                                      |
| Max function parameters   | 3 (4+ → single options object)                                                           |
| Test coverage             | ≥80% branches/functions/lines/statements, **on files touched by tests** (see note below) |

Approaching 300 lines → split by responsibility (SRP), don't reach for `eslint-disable`. Disabling a limit is itself a "when in doubt, ask" moment (§1) — flag it, don't silently bypass. (One accepted exception exists today: `apps/storebridge/app/entry.server.tsx`'s `handleRequest` has a framework-mandated 4-arg signature from React Router itself.)

**Open decision — coverage scope:** the shared Vitest config (`packages/vitest-config`) currently uses the default `coverage.all: false`, so the 80% floor only applies to files a test actually imports; untested new files simply don't appear in the report instead of dragging the number down. This was fine for the initial scaffold (nothing built yet) but stops being fine once real feature routes exist untested. Revisit: set `coverage.all: true` and decide the real threshold once there's enough tested surface area to not immediately fail the pre-push hook.

## 6. Design principles

- **SOLID**, applied pragmatically — not ceremony. **YAGNI** — build only for current scope; don't add config knobs or resource-type support for future phases already tracked in the KB's research list.
- Composition over inheritance; small pure functions over large stateful classes where practical.

## 7. Tooling stack (already wired up)

- TypeScript, strict mode. **Testing:** Vitest + React Testing Library (no Jest).
- **Git hooks (Husky):** `pre-commit` → lint-staged (ESLint --fix + Prettier); `commit-msg` → commitlint; `pre-push` → typecheck → build → `test:coverage`. Hooks and root-level configs (Husky, commitlint, lint-staged) live at the monorepo root and run via Turborepo (`turbo run <task>`) across all workspaces, not per-app.
- **Sessions/tokens:** Prisma → Supabase Postgres (`DATABASE_URL`), via `@shopify/shopify-app-session-storage-prisma`. No app data here — that's all Shopify metaobjects/metafields (`$app:` namespace).
- **GraphQL:** wire `@shopify/api-codegen-preset` + `graphql-config` once real operations exist; every operation passes codegen _and_ `validate_graphql_codeblocks` (MCP) before commit.

## 8. Comments & docs

JSDoc on exported symbols and non-obvious logic only — not on self-explanatory one-liners or clearly-typed props. Inline comments explain **why**, not **what**.

## 9. UI/UX

Polaris components/tokens by default. Every async action: visible loading, error, and empty state. Destructive actions require confirmation. Job status legible at a glance — this is core UX for this app, not a finishing touch.

## 10. Conflicts

An explicit user instruction for a specific task overrides a standing rule here for that task — but flag the conflict rather than silently overriding.
