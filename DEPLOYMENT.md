# Deployment

StoreBridge has one environment, production, backed by one Shopify app registration
(`shopify.app.toml`). **Every push to `main` ships it**, in two independent parts:

| Part                                        | Done by                                               | Touches the database?                |
| ------------------------------------------- | ----------------------------------------------------- | ------------------------------------ |
| App code (Vercel production)                | Vercel's Git integration, production = `main`         | Yes: migrations run inside the build |
| Shopify app config (scopes, webhooks, URLs) | `.github/workflows/deploy.yml` (`shopify app deploy`) | No                                   |

Database migrations run _inside_ the Vercel build: `package.json`'s `vercel-build` script
runs `drizzle-kit migrate` before `react-router build`, and Vercel's build convention picks
that script up instead of the plain `build` one. A failed migration fails the build, so
nothing gets deployed. The Shopify config deploy never touches the database, so it runs on
its own rather than waiting on the Vercel build.

Pull requests get Vercel Preview deployments from the same integration. Their builds also
run `vercel-build`, so **a PR's migrations run against the Preview environment's
`DATABASE_URL`** before the PR merges: point Preview at a throwaway database, never at
production's.

## 1. Shopify app registration

```bash
pnpm run config:link   # interactive: links shopify.app.toml
```

Generate an **Automation Token** (Dev Dashboard → app → Automation tokens: the current CLI
4.x auth method; the old Partners CLI token is deprecated). Add it as a
`SHOPIFY_APP_AUTOMATION_TOKEN` secret on the `production` GitHub **Environment** (repo
Settings → Environments → `production` → add secret) so `deploy.yml` can deploy
non-interactively.

`shopify app dev` uses this same app. With `automatically_update_urls_on_dev = true` it
points the app's URLs at your dev tunnel while it runs, so installed stores load your
machine until the next `main` deploy restores them.

## 2. Vercel hosting

This app deploys to Vercel via `@vercel/react-router`'s `vercelPreset()`
(`react-router.config.ts`): it only activates when Vercel's own build sets the `VERCEL`
env var, so local dev and the Docker/`react-router-serve` path are unaffected.

1. Import the repo into a Vercel project (Vercel dashboard → Add New → Project). Leave the
   project's **Root Directory** empty: the app lives at the repo root.
2. Keep the Git integration on, with **Production Branch** = `main` (Project Settings →
   Git). No Vercel token is needed in GitHub.
3. Environment variables (Vercel project → Settings → Environment Variables):
   - **Production**:
     - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`: from the linked Shopify app (step 1)
     - `SHOPIFY_APP_URL`: `https://storebridge.vercel.app`
     - `DATABASE_URL`: Supabase Postgres pooled/pgbouncer connection string (see
       `app/db/schema.server.ts`'s comment and `.env.example`)
     - `DIRECT_URL`: the same database's non-pooled connection string. The
       `vercel-build` script's `drizzle-kit migrate` step (see `drizzle.config.ts`) prefers
       this over `DATABASE_URL` for DDL, since some poolers reject schema changes in
       transaction mode; it falls back to `DATABASE_URL` if unset.
   - **Preview**: a separate `DATABASE_URL`/`DIRECT_URL` (see the note above). Preview
     deployments aren't installed on any store, so the Shopify variables only need to let
     the build succeed.
4. Vercel Functions run on the Node.js runtime by default, which is what
   `shopify-app-react-router`'s Node adapter needs: no runtime config to change.

## 3. What's automated vs manual

- **Automated, on every push to `main`**: the Vercel production build (migrate, then build,
  then deploy) and `shopify app deploy`. `deploy.yml` can also be run by hand
  (`workflow_dispatch`) to redeploy the Shopify config alone.
- **Manual, one-time**: everything in steps 1 and 2 above (app linking, the automation
  token secret, Vercel project setup and environment variables). These need interactive
  browser auth or dashboard clicks.
