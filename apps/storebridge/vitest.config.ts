import { createVitestConfig } from "@repo/vitest-config";

export default createVitestConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
  },
});
