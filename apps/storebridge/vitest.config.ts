import { createVitestConfig } from "@repo/vitest-config";

export default createVitestConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      // Count every real source file toward coverage, not just files a
      // test happens to import — otherwise an untested new route/util
      // simply doesn't show up instead of dragging the aggregate down.
      // See AGENTS.md §5.
      include: ["app/**/*.{ts,tsx}"],
      exclude: [
        // Framework entry points/wiring with no branching logic of our
        // own — same reasoning as schema.server.ts's exclusion in
        // @repo/vitest-config: nothing here is testable business logic.
        "app/entry.server.tsx",
        "app/root.tsx",
        "app/routes.ts",
        "app/shopify.server.ts",
        // Shopify template boilerplate (auth gate + AppProvider shell) —
        // exercised by the e2e suite's auth-boundary coverage, not unit
        // tests. loader logic that IS ours (auth.login) is unit-tested
        // via error.server.test.ts; the route component itself is the
        // same template shell.
        "app/routes/app.tsx",
        "app/routes/auth.$.tsx",
        "app/routes/auth.login/route.tsx",
      ],
    },
  },
});
