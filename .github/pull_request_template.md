### WHY are these changes introduced?

### WHAT is this pull request doing?

### Screenshots

_Required if this PR changes UI. If a real Shopify store/dev session isn't
available, use `apps/storebridge/scripts/screenshot-app.mjs` (see its
`scripts/README.md`) — it renders the route with a locally-signed session
token and a mocked Polaris stylesheet, since the real one loads from
`cdn.shopify.com` at runtime. Label mocked screenshots as such; they
approximate layout/spacing, not exact Polaris styling. Delete this section
if the PR has no UI changes._

### Test this PR

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm run test:coverage
pnpm run build
```

### Checklist

- [ ] Updated `README.md` / `apps/storebridge/README.md` / `AGENTS.md` / `DEPLOYMENT.md` if this changes how the project is run, deployed, or its standards
- [ ] Commits follow Conventional Commits (enforced by commitlint) and are one logical change each
