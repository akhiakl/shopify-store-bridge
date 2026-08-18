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
          reporter: ["text", "html", "lcov"],
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
            "prisma/**",
            "extensions/**",
            "e2e/**",
          ],
        },
      },
    }),
    overrides,
  );
}
