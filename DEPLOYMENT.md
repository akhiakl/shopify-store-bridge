# Deployment

StoreBridge runs two environments, each backed by its own Shopify app registration:

| Environment | Trigger                        | Shopify config             | Vercel target                                                                             |
| ----------- | ------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------- |
| Staging     | push to `staging`              | `shopify.app.staging.toml` | Preview (Vercel's Git integration, automatic)                                             |
| Production  | pushing a `v*` tag (a release) | `shopify.app.toml`         | Production (`vercel deploy --prod` in `deploy.yml`, **not** Vercel's own Git integration) |

**Merging a PR to `main` does not deploy anything by itself** — deliberately. Staging is
continuous (every push to the `staging` branch ships immediately, that's the point of having
one); production is release-gated, so a bug landing on `main` doesn't reach real merchants
until someone decides to cut a release:

```bash
git tag v1.2.0
git push origin v1.2.0
```

(or use GitHub's "Draft a new release" UI on a commit that's on `main` — publishing a release
pushes the tag for you). Both the Shopify app config deploy and the Vercel production deploy
fire off that same tag push, in `.github/workflows/deploy.yml`.

Hosting (Vercel) and the Shopify app registration (Partner/Dev Dashboard config) are two
separate things that both need setting up — this doc covers both.

## 1. Shopify app registrations

Create **two** apps in the Shopify Partner/Dev Dashboard — one for staging, one for
production. Don't reuse a single app across environments; that's not how Shopify's own
multi-env tooling is designed (see `shopify.app.staging.toml`'s header comment).

```bash
# Run from the repo root — the pnpm workspace routes these to apps/storebridge,
# where shopify.app.staging.toml / shopify.app.toml actually live.
pnpm --filter storebridge run config:link:staging      # interactive — links shopify.app.staging.toml
pnpm --filter storebridge run config:link:production   # interactive — links shopify.app.toml
```

Each command fills in that config file's `client_id` and points `application_url` /
`redirect_urls` at wherever you tell the CLI that environment is hosted (its Vercel URL,
once step 2 is done).

For each app, generate an **Automation Token** (Dashboard → app → Automation tokens — the
current CLI 4.x auth method; the old Partners CLI token is deprecated). Add it as a
`SHOPIFY_APP_AUTOMATION_TOKEN` secret on the matching GitHub **Environment**
(repo Settings → Environments → `staging` / `production` → add secret) so
`.github/workflows/deploy.yml` can deploy config/extension changes non-interactively.

## 2. Vercel hosting

This app deploys to Vercel via `@vercel/react-router`'s `vercelPreset()`
(`react-router.config.ts`) — it only activates when Vercel's own build sets the `VERCEL`
env var, so local dev and the Docker/`react-router-serve` path are unaffected.

1. Import the repo into a Vercel project (Vercel dashboard → Add New → Project). This is a
   Turborepo monorepo, so set the project's **Root Directory** to `apps/storebridge` —
   Vercel's framework detection and `vercelPreset()` both expect to run from there, not
   the repo root.
2. **Remove `main` from Vercel's auto-deploy-to-production branches** (Project Settings →
   Git → Production Branch, or the "Ignored Build Step" setting) — production deploys go
   through `deploy.yml`'s explicit `vercel deploy --prod` step on a release tag instead, not
   Vercel's own Git integration. Leaving `main` as the Production Branch defeats the whole
   point: every merge would auto-ship to production regardless of what this repo's CI does.
   Pushes to `staging` should still land as Preview deployments (Vercel's default behavior
   for any non-production branch) — that half doesn't need changing.
3. Create a Vercel API token (Account Settings → Tokens) and add it as a `VERCEL_TOKEN`
   secret on the GitHub **production** Environment. Get `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`
   from Project Settings → General (or `.vercel/project.json` after running `vercel link`
   locally once) and add those as secrets too — `deploy.yml`'s Vercel step needs all three.
4. Environment variables (Vercel project → Settings → Environment Variables — set per
   Vercel environment, Production vs Preview, matching the table above):
   - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES` — from the matching linked Shopify
     app config (step 1)
   - `SHOPIFY_APP_URL` — the environment's Vercel URL
   - `DATABASE_URL` — Supabase Postgres pooled/pgbouncer connection string (see
     `apps/storebridge/app/db/schema.server.ts`'s comment and `apps/storebridge/.env.example`).
     **Use a separate Supabase project (or at least a separate database) per environment** —
     staging and production must not share session storage.
5. Vercel Functions run on the Node.js runtime by default, which is what
   `@shopify/shopify-app-remix`'s (now `shopify-app-react-router`'s) Node adapter needs — no
   runtime config to change.

## 3. What's automated vs manual

- **Automated, continuous**: staging — `shopify app deploy --config staging` and Vercel's
  Preview deployment both fire on every push to the `staging` branch.
- **Automated, release-gated**: production — `shopify app deploy --config production` and
  `vercel deploy --prod` both fire on pushing a `v*` tag (`.github/workflows/deploy.yml`), or
  manually via `workflow_dispatch`. **Not** on merging to `main` — see the table above.
- **Manual, one-time**: everything in steps 1–4 above (dashboard app creation, CLI linking,
  secrets, Vercel project setup, disabling Vercel's auto-deploy-on-`main`) — none of it can
  be done from an unattended session since it requires interactive browser auth or dashboard
  clicks.
- **Manual, ongoing**: `drizzle-kit migrate` runs automatically in the Docker path
  (`pnpm run docker-start` → `pnpm run setup`), but Vercel's build doesn't run a migration
  step — run `pnpm --filter storebridge run setup` (or `pnpm exec drizzle-kit migrate` from
  `apps/storebridge`) against each environment's `DATABASE_URL`/`DIRECT_URL` after a schema
  change, before or alongside the deploy. For production specifically, run this _before_
  pushing the release tag, so the schema is ready before the new code that depends on it
  goes live.
