# StoreBridge

An embedded Shopify admin app, built on the [React Router](https://reactrouter.com/) Shopify
app template ([`shopify-app-template-react-router`](https://github.com/Shopify/shopify-app-template-react-router)).

**Status:** scaffold stage. The app home (`app/routes/app._index.tsx`) is a placeholder —
sync group setup, pairing, and job history are the intended scope but aren't built yet.

This is the app workspace of a [Turborepo monorepo](../../README.md); for cloning, local
setup, and the git workflow, see the [root `CONTRIBUTING.md`](../../CONTRIBUTING.md).

## Stack

- **Framework:** React Router 7 + `@shopify/shopify-app-react-router` (embedded admin auth,
  webhooks, billing helpers).
- **UI:** [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components)
  (`<s-page>`, `<s-section>`, …) — not the deprecated `@shopify/polaris` React library.
- **Sessions:** Prisma → Supabase Postgres (`prisma/schema.prisma`, `DATABASE_URL`). No app
  data lives here — that's Shopify metaobjects/metafields (`$app:` namespace) once built.
- **Testing:** Vitest + React Testing Library (unit), Playwright (`e2e/`) for the auth
  boundary and public routes.

## Authenticating and querying data

Use the `authenticate` export from `app/shopify.server.ts` in any loader/action:

```ts
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    { shop { name } }
  `);
  const { data } = await response.json();
  return data;
};
```

See `app/routes/app.tsx` for the embedded shell (auth + `AppProvider`) and
`app/routes/webhooks.app.uninstalled.tsx` / `webhooks.app.scopes_update.tsx` for webhook
handlers. Full API reference: [`@shopify/shopify-app-react-router` docs](https://shopify.dev/docs/api/shopify-app-react-router).

## Webhooks

Declare app-specific webhooks in `shopify.app.toml` (already done for `app/uninstalled` and
`app/scopes_update`) rather than in an `afterAuth` hook — Shopify syncs subscriptions
automatically on every `deploy`, whereas `afterAuth`-registered ones only update when a shop
re-authenticates (install, or access-token expiry). See [app-specific vs
shop-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions).

## GraphQL

`.graphqlrc.ts` + `@shopify/api-codegen-preset` wire up codegen once real operations exist —
see `AGENTS.md` §2/§7 in the repo root for the verification requirement (Shopify Dev MCP +
`validate_graphql_codeblocks` before commit). If your editor's GraphQL extension assumes the
wrong API (e.g. Storefront instead of Admin), check `.graphqlrc.ts`.

## Troubleshooting

**`The table "Session" does not exist`** — the database hasn't been migrated. Run
`pnpm exec prisma migrate deploy` (or `pnpm run setup`, which also does this) against `DATABASE_URL`.

**Embedded app navigation breaks the session** — inside the admin iframe: use `Link` from
`react-router` or Polaris, not `<a>`; use the `redirect` returned from `authenticate.admin`,
not React Router's own `redirect`; use `useSubmit`, not raw form posts.

**`"nbf" claim timestamp check failed`** — a session token JWT looked expired/not-yet-valid.
Usually means your machine's clock is out of sync — enable automatic date/time sync.

## Resources

- [Shopify App React Router docs](https://shopify.dev/docs/api/shopify-app-react-router)
- [App Bridge](https://shopify.dev/docs/api/app-bridge-library) ·
  [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components)
- [React Router docs](https://reactrouter.com/home)
- Repo root: [`AGENTS.md`](../../AGENTS.md) (standards) ·
  [`DEPLOYMENT.md`](../../DEPLOYMENT.md) (Shopify + Vercel deploy)
