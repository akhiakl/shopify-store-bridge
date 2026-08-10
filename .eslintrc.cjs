/** @type {import('@types/eslint').Linter.BaseConfig} */
// We use Vitest + React Testing Library, not Jest — dropped
// "@remix-run/eslint-config/jest-testing-library" accordingly (AGENTS.md §7).
module.exports = {
  root: true,
  extends: ["@remix-run/eslint-config", "@remix-run/eslint-config/node", "prettier"],
  globals: {
    shopify: "readonly",
  },
  rules: {
    // Hard limits — see AGENTS.md §5. Don't disable per-file; split the file instead.
    "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    "max-params": ["error", 3], // 4+ args -> single options object
  },
  overrides: [
    {
      files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
      rules: {
        "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      },
    },
  ],
};
