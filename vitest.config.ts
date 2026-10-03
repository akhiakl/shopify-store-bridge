import { configDefaults, defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // e2e/** holds Playwright specs, run by `playwright test`, not vitest:
    // vitest's default *.spec.ts glob would otherwise try (and fail) to run
    // them too.
    exclude: [...configDefaults.exclude, "e2e/**"],
    coverage: {
      provider: "v8",
      // json-summary feeds the CI "Quality Gate" job's PR summary comment
      // (.github/workflows/ci.yml): it reads coverage/coverage-summary.json
      // for the totals table.
      reporter: ["text", "html", "lcov", "json-summary"],
      // See AGENTS.md §5.
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      // Count every real source file toward coverage, not just files a
      // test happens to import, otherwise an untested new route/util
      // simply doesn't show up instead of dragging the aggregate down.
      include: ["app/**/*.{ts,tsx}"],
      exclude: [
        "node_modules/**",
        "build/**",
        "**/*.config.*",
        "**/*.d.ts",
        "drizzle/**",
        "extensions/**",
        "e2e/**",
        // Declarative table/relation definitions, not testable logic:
        // tests import real table objects from these (e.g. to assert
        // `db.insert` was called with the right table) which would
        // otherwise drag them into the coverage report.
        "**/db/schema.server.ts",
        "**/db/syncJobsSchema.server.ts",
        "**/db/rls.server.ts",
        // Framework entry points/wiring with no branching logic of our
        // own, same reasoning as the schema exclusions above: nothing
        // here is testable business logic.
        "app/entry.server.tsx",
        "app/root.tsx",
        "app/routes.ts",
        "app/shopify.server.ts",
        // Shopify template boilerplate (auth gate + AppProvider shell):
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
