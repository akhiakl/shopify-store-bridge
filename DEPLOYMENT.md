# Deployment

StoreBridge runs two environments, each backed by its own Shopify app registration:

| Environment | Trigger                        | Shopify config             | Vercel target                                       |
| ----------- | ------------------------------ | -------------------------- | --------------------------------------------------- |
| Staging     | push to `staging`              | `shopify.app.staging.toml` | Preview (`vercel deploy` in `deploy.yml`)           |
| Production  | pushing a `v*` tag (a release) | `shopify.app.toml`         | Production (`vercel deploy --prod` in `deploy.yml`) |

**Both environments now deploy exclusively through `deploy.yml`** — neither relies on
Vercel's own Git integration to auto-deploy on push anymore. That integration deployed
independently of whether database migrations had actually run, which is how a schema change
once shipped code against a table that was never created on staging (see §3). Database
migrations run _inside_ the Vercel build itself — `apps/storebridge/package.json`'s
`vercel-build` script runs `drizzle-kit migrate` before `react-router build`, and Vercel's
build convention picks that script up automatically instead of the plain `build` one. A
failed migration fails the build, so nothing gets deployed. The Shopify app config deploy is
decoupled from this: it never touches the database, so `deploy.yml` runs it unconditionally
rather than gating it on the Vercel build's success.

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
2. **Disable Vercel's own Git-integration auto-deploy entirely** — both for `main` (Project
   Settings → Git → Production Branch) and for `staging` (Project Settings → Git → Ignored
   Build Step, set to always skip, or remove the Git connection's auto-deploy for that
   branch). Every deploy for both environments now goes through `deploy.yml`'s explicit
   `vercel deploy` step instead — leaving either branch on Vercel's automatic path means it
   ships on every push through a separately-triggered build, duplicating what `deploy.yml`
   already does.
3. Create a Vercel API token (Account Settings → Tokens) and add it as a `VERCEL_TOKEN`
   secret on **both** the `staging` and `production` GitHub Environments. Get
   `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` from Project Settings → General (or
   `.vercel/project.json` after running `vercel link` locally once) and add those as secrets
   too, on both Environments — `deploy.yml`'s Vercel step needs all three for whichever
   environment it's deploying.
4. Environment variables (Vercel project → Settings → Environment Variables — set per
   Vercel environment, Production vs Preview, matching the table above):
   - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES` — from the matching linked Shopify
     app config (step 1)
   - `SHOPIFY_APP_URL` — the environment's Vercel URL
   - `DATABASE_URL` — Supabase Postgres pooled/pgbouncer connection string (see
     `apps/storebridge/app/db/schema.server.ts`'s comment and `apps/storebridge/.env.example`).
     **Use a separate Supabase project (or at least a separate database) per environment** —
     staging and production must not share session storage.
   - `DIRECT_URL` — the same database's non-pooled connection string. The `vercel-build`
     script's `drizzle-kit migrate` step (see `drizzle.config.ts`) prefers this over
     `DATABASE_URL` for running DDL, since some poolers reject schema changes in transaction
     mode; falls back to `DATABASE_URL` if unset, but setting both avoids relying on that
     fallback.
5. Vercel Functions run on the Node.js runtime by default, which is what
   `@shopify/shopify-app-remix`'s (now `shopify-app-react-router`'s) Node adapter needs — no
   runtime config to change.

## 3. What's automated vs manual

- **Automated, continuous**: staging — `shopify app deploy --config staging` and
  `vercel deploy` (Preview) both fire on every push to the `staging` branch, in
  `.github/workflows/deploy.yml`. The Vercel deploy's build runs `drizzle-kit migrate`
  (via the `vercel-build` package.json script) before `react-router build` — a failed
  migration fails the build, so nothing ships from that step. The Shopify app deploy is
  independent of this and runs regardless, since it never touches the database.
- **Automated, release-gated**: production — the same two deploys (`shopify app deploy
--config production`, `vercel deploy --prod`, with the same migrate-then-build sequence
  inside the latter) fire on pushing a `v*` tag, or manually via `workflow_dispatch`.
  **Not** on merging to `main` — see the table above.
- **Manual, one-time**: everything in steps 1–4 above (dashboard app creation, CLI linking,
  secrets, Vercel project setup, disabling Vercel's Git-integration auto-deploy for both
  branches) — none of it can be done from an unattended session since it requires
  interactive browser auth or dashboard clicks.
- **`DATABASE_URL`/`DIRECT_URL` as Vercel project environment variables**: these live on the
  Vercel project (step 2.4/2.5 above), set per Vercel environment (Production vs Preview),
  not as GitHub Environment secrets — the build that runs migrations is `vercel build`
  itself, so that's where they need to be visible. Missing/wrong values fail the Vercel
  build closed, which is the point.
