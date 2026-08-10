import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Floor enforced in CI and the pre-push hook — see AGENTS.md §5.
      thresholds: { branches: 80, functions: 80, lines: 80, statements: 80 },
      exclude: [
        "node_modules/**",
        "build/**",
        "**/*.config.*",
        "**/*.d.ts",
        "prisma/**",
        "extensions/**",
      ],
    },
  },
});
