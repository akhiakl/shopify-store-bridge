/**
 * Root fallback config — covers files outside apps/* that don't have their
 * own closer .eslintrc.cjs (e.g. packages/*). Apps get their own
 * .eslintrc.cjs extending the same shared base, for app-specific overrides.
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ["@repo/eslint-config"],
};
