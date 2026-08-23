---
name: storebridge-dependency-parity
description: Use when checking whether StoreBridge's Shopify-template-derived config or dependencies have drifted from what a fresh `shopify app init` scaffold actually produces — e.g. investigating a bug that might be version-related, auditing shopify.app.toml/shopify.web.toml against the current CLI template, or deciding whether to bump a Shopify-ecosystem package. Not for general "check for outdated npm packages" — that's a different, much broader task this skill deliberately doesn't cover (see the note on scope below).
---

# StoreBridge dependency/scaffold parity check

The pattern for answering "did we drift from what the Shopify CLI actually scaffolds, and does it matter" — worked out across two real parity checks (one on `shopify.app.toml`/`shopify.web.toml` structure, one on `package.json` dependency versions).

## Scope: parity with the template, not "what's the latest version of everything"

This is specifically about comparing against what `shopify app init` produces _right now_, not npm's absolute latest. A fresh scaffold's own pinned versions can be behind npm's latest too (that's normal — templates lag) — matching the _template_, not chasing the newest release of every package, is the goal here. If the actual ask is "audit all dependencies for updates," that's a different, broader task — do that with plain `npm view <pkg> version` checks against `package.json`, not this skill.

## Getting a real reference scaffold

`shopify app init` needs interactive org/client-id auth and won't run non-interactively (`--organization-id`/`--client-id` required in CI-like sessions). Two fallbacks, in order of trustworthiness:

1. **A scaffold from earlier in the same working session**, if one was already generated interactively — reuse its `package.json`/`shopify.*.toml` content rather than re-fetching, since re-cloning later can catch the template mid-update and give you a _different_ answer than what was actually scaffolded.
2. **Clone the template repo directly**, as a fallback only: `git clone --depth 1 https://github.com/Shopify/shopify-app-template-react-router.git`. Caveat: this pulls whatever's on `main` _right now_, which may be ahead of the specific commit the CLI actually references for stable releases — treat it as directionally useful, not authoritative, if it disagrees with a previously-observed real scaffold.

Either way: **delete the reference scaffold once the comparison is done.** It's throwaway, not something to leave lying around in the repo or its parent directory.

## What to actually compare

- `shopify.app.toml`/`shopify.app.staging.toml` structure: does ours have every section a fresh one does (`[access_scopes]`, `[auth]`, `[build]`, etc.), even if the _values_ differ because ours is customized? A missing section is drift; a customized value with a comment explaining why is not.
- `shopify.web.toml`: this file is templated with Liquid in the CLI's source (`{{ dependency_manager }}` etc.) — make sure what's actually committed is the _rendered_ output for this repo's package manager, not a leftover `.liquid` template file that never got processed.
- `package.json` dependency versions, package by package. For each mismatch, classify it before acting:
  - **Behind the scaffold** → likely safe to bump to match, unless there's a reason not to (check for an existing comment explaining a deliberate pin).
  - **Ahead of the scaffold on a _patch/minor_** → almost always fine to leave, often a deliberate earlier fix (check git blame/commit history before reverting).
  - **Ahead of the scaffold on a _major_** → the one case worth real scrutiny. A major-version gap between what StoreBridge runs and what the template (and by extension every other package in that dependency chain) was actually built/tested against is a plausible root cause for subtle bugs, even without a specific error pointing at it yet.

## Verifying an alignment change didn't break anything

After bumping versions to match: `pnpm install`, then `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run test:coverage` — all four, not a subset. A version bump that "just" changes a peer dependency range can break typecheck or build without touching any test.

## What this doesn't prove

Matching the scaffold's versions rules out "we drifted from a known-good baseline" — it does **not** prove the scaffold itself is bug-free. If a fresh scaffold reproduces the same symptom you're chasing, versions were never the actual cause; look elsewhere (see `storebridge-auth-troubleshooting` for the auth-specific case this happened in). Don't treat "now matches the template" as confirmation of a fix without independently verifying the original symptom is actually gone.
