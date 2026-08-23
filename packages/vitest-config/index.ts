import {
  configDefaults,
  defineConfig,
  mergeConfig,
  type ViteUserConfig,
} from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Shared StoreBridge Vitest defaults. Apps call this with their own
 * overrides (setupFiles, extra coverage excludes, etc.) rather than
 * duplicating the jsdom/coverage-threshold setup per app.
 *
 * The 80% coverage floor is a StoreBridge standard — see AGENTS.md §5 —
 * enforced here so every app gets it without having to remember to set it.
 */
export function createVitestConfig(
  overrides: ViteUserConfig = {},
): ViteUserConfig {
  return mergeConfig(
    defineConfig({
      plugins: [tsconfigPaths()],
      test: {
        environment: "jsdom",
        globals: true,
        // e2e/** holds Playwright specs, run by `playwright test`, not
        // vitest — vitest's default *.spec.ts glob would otherwise try
        // (and fail) to run them too.
        exclude: [...configDefaults.exclude, "e2e/**"],
        coverage: {
          provider: "v8",
          // json-summary feeds the CI "Quality Gate" job's PR summary
          // comment (.github/workflows/ci.yml) — it reads
          // coverage/coverage-summary.json for the totals table.
          reporter: ["text", "html", "lcov", "json-summary"],
          thresholds: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
          },
          exclude: [
            "node_modules/**",
            "build/**",
            "**/*.config.*",
            "**/*.d.ts",
            "drizzle/**",
            // Declarative table/relation definitions, not testable logic —
            // tests import real table objects from here (e.g. to assert
            // `db.insert` was called with the right table) which would
            // otherwise drag it into the coverage report.
            "**/db/schema.server.ts",
            "extensions/**",
            "e2e/**",
          ],
        },
      },
    }),
    overrides,
  );
}
