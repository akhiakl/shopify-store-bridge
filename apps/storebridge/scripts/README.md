# screenshot-app.mjs

Generates PR screenshots of embedded admin routes without a live Shopify
store or dev store install. Two things stand in for what a real embedded
session would normally provide:

- **Auth**: a locally-signed session token (same approach `e2e/support/`
  uses for Playwright tests) plus a seeded offline `Session` row, so
  `authenticate.admin()` accepts the request with no network call to
  Shopify.
- **Styling**: real Polaris Web Components load their definitions from
  `https://cdn.shopify.com/shopifycloud/polaris.js` at runtime. Where
  that host isn't reachable (sandboxed CI/dev environments), the script
  intercepts it and injects `mock-polaris.css` instead — a plain-CSS
  approximation (tag/attribute selectors, `content: attr(...)` for props
  like `heading`) that keeps structure, spacing, and flow legible. **It is
  not real Polaris** — treat the output as a layout/flow preview, not a
  pixel-accurate one. If `cdn.shopify.com` _is_ reachable, prefer running
  a real embedded session (`shopify app dev`) and screenshotting that
  instead — it'll be the real thing, not a mock.

## Usage

```bash
npm run build
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/storebridge_e2e \
  npx prisma migrate deploy
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/storebridge_e2e \
  npm run screenshot
```

Writes `docs/screenshots/stores-empty.png` and `stores-populated.png`
(seeded fixture data, deleted again once the script finishes). Add a call
to `screenshotRoute` in `screenshot-app.mjs` for any other route you need
covered.
