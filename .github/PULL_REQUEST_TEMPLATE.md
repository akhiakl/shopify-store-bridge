<!--
  How to write a good PR title:
  - Start with a verb, e.g. Add, Fix, Remove, Update
  - Match the Conventional Commit type of the underlying commit(s) where it helps
  - Give as much context as necessary and as little as possible
-->

### WHY are these changes introduced?

<!-- Context about the problem being addressed. Link an issue if one exists. -->

### WHAT is this pull request doing?

<!-- Summary of the changes. Before/after screenshots for UI changes. -->

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
