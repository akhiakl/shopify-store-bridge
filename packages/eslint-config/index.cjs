/**
 * Shared StoreBridge ESLint config — base rules any app or package in this
 * monorepo extends. Individual apps' .eslintrc.cjs can layer app-specific
 * overrides (e.g. framework-specific globals) on top via their own
 * `overrides` array; this stays framework-agnostic.
 *
 * Follows the current shopify-app-template-react-router base
 * (@typescript-eslint + react/jsx-a11y, not the Remix-specific
 * @remix-run/eslint-config). StoreBridge's own hard limits (AGENTS.md §5)
 * are layered on top via `rules` below.
 *
 * ESLint 8 (eslintrc) resolves plugins referenced by a shareable config
 * relative to the *consuming project*, not relative to this package —
 * see https://eslint.org/docs/latest/extend/shareable-configs#publishing-a-shareable-config.
 * Combined with this repo's `--install-strategy=nested` (needed to avoid an
 * npm resolver hang across workspaces), that means every plugin below must
 * also be a devDependency of each app that extends this config, not just of
 * this package. Keep both lists in sync when adding/removing a plugin.
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    commonjs: true,
    es6: true,
  },
  // ESLint 8 ignores dotfiles by default. That's silent when linting a glob
  // (`npm run lint`), but lint-staged passes exact staged paths and ESLint
  // then *warns* "File ignored by default" for any dotfile among them —
  // which --max-warnings=0 in .lintstagedrc.json treats as a failure. Negate
  // the ones consuming apps commonly want linted.
  ignorePatterns: ["!**/.server", "!**/.client", "!.graphqlrc.ts"],

  // Base config
  extends: ["eslint:recommended", "prettier"],

  rules: {
    // Hard limits — see AGENTS.md §5. Don't disable per-file; split the file instead.
    "max-lines": [
      "error",
      { max: 300, skipBlankLines: true, skipComments: true },
    ],
    "max-params": ["error", 3], // 4+ args -> single options object
  },

  overrides: [
    // React
    {
      files: ["**/*.{js,jsx,ts,tsx}"],
      plugins: ["react", "jsx-a11y"],
      extends: [
        "plugin:react/recommended",
        "plugin:react/jsx-runtime",
        "plugin:react-hooks/recommended",
        "plugin:jsx-a11y/recommended",
      ],
      settings: {
        react: {
          version: "detect",
        },
        formComponents: ["Form"],
        linkComponents: [
          { name: "Link", linkAttribute: "to" },
          { name: "NavLink", linkAttribute: "to" },
        ],
        "import/resolver": {
          typescript: {},
        },
      },
      rules: {
        "react/no-unknown-property": ["error", { ignore: ["variant"] }],
      },
    },

    // Typescript
    {
      files: ["**/*.{ts,tsx}"],
      plugins: ["@typescript-eslint", "import"],
      parser: "@typescript-eslint/parser",
      settings: {
        "import/internal-regex": "^~/",
        "import/resolver": {
          node: {
            extensions: [".ts", ".tsx"],
          },
          typescript: {
            alwaysTryTypes: true,
          },
        },
      },
      extends: [
        "plugin:@typescript-eslint/recommended",
        "plugin:import/recommended",
        "plugin:import/typescript",
      ],
    },

    // Node
    {
      files: [
        ".eslintrc.cjs",
        "vite.config.{js,ts}",
        ".graphqlrc.{js,ts}",
        "shopify.server.{js,ts}",
        "**/*.server.{js,ts}",
      ],
      env: {
        node: true,
      },
    },

    // Tests — Vitest + React Testing Library, not Jest (AGENTS.md §7)
    {
      files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
      rules: {
        "max-lines": [
          "error",
          { max: 500, skipBlankLines: true, skipComments: true },
        ],
      },
    },
  ],
  globals: {
    shopify: "readonly",
  },
};
