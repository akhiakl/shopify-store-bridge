# Deployment

StoreBridge runs two environments, each backed by its own Shopify app registration:

| Environment | Branch    | Shopify config             | Shopify app deploy trigger                         |
| ----------- | --------- | -------------------------- | -------------------------------------------------- |
| Staging     | `staging` | `shopify.app.staging.toml` | push to `staging` (`.github/workflows/deploy.yml`) |
| Production  | `main`    | `shopify.app.toml`         | push to `main` (`.github/workflows/deploy.yml`)    |

Hosting (Vercel) and the Shopify app registration (Partner/Dev Dashboard config) are two
separate things that both need setting up — this doc covers both.

## 1. Shopify app registrations

Create **two** apps in the Shopify Partner/Dev Dashboard — one for staging, one for
production. Don't reuse a single app across environments; that's not how Shopify's own
multi-env tooling is designed (see `shopify.app.staging.toml`'s header comment).

```bash
npm run config:link:staging      # interactive — links shopify.app.staging.toml
npm run config:link:production   # interactive — links shopify.app.toml
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

1. Import the repo into a Vercel project (Vercel dashboard → Add New → Project).
2. Set the **Production Branch** to `main` in the Vercel project's Git settings — pushes to
   `staging` then land as Preview deployments, which is Vercel's native equivalent of a
   staging environment.
3. Environment variables (Vercel project → Settings → Environment Variables — set per
   Vercel environment, Production vs Preview, matching the table above):
   - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES` — from the matching linked Shopify
     app config (step 1)
   - `SHOPIFY_APP_URL` — the environment's Vercel URL
   - `DATABASE_URL` — Supabase Postgres pooled/pgbouncer connection string (see
     `prisma/schema.prisma`'s comment and `.env.example`). **Use a separate Supabase
     project (or at least a separate database) per environment** — staging and production
     must not share session storage.
4. Vercel Functions run on the Node.js runtime by default, which is what
   `@shopify/shopify-app-remix`'s (now `shopify-app-react-router`'s) Node adapter and
   Prisma need — no runtime config to change.

## 3. What's automated vs manual

- **Automated**: `shopify app deploy` (app config, webhooks, extensions) via
  `.github/workflows/deploy.yml` on push to `main`/`staging`, or manually via
  `workflow_dispatch`.
- **Automated**: the app build/hosting itself, once the Vercel project exists — Vercel's
  own Git integration deploys on every push, no GitHub Action needed for that half.
- **Manual, one-time**: everything in steps 1–3 above (dashboard app creation, CLI
  linking, secrets, Vercel project setup) — none of it can be done from an unattended
  session since it requires interactive browser auth or dashboard clicks.
- **Manual, ongoing**: `prisma migrate deploy` runs automatically in the Docker path
  (`npm run docker-start` → `npm run setup`), but Vercel's build doesn't run a migration
  step — run `npm run setup` (or just `npx prisma migrate deploy`) against each
  environment's `DATABASE_URL` after a schema change, before or alongside the deploy.
