/**
 * Shared ESLint flat-config base for all Presentail workspace packages.
 *
 * Usage — call createBaseConfig() in each artifact's eslint.config.(m)js:
 *
 *   import { createBaseConfig } from "@workspace/eslint-config-base";
 *
 *   export default [
 *     createBaseConfig(["src/**\/*.ts"], {
 *       linterOptions: { reportUnusedDisableDirectives: "warn" },
 *       rules: { "no-console": "error" },
 *     }),
 *   ];
 *
 * Options:
 *   jsx          {boolean}  — add ecmaFeatures: { jsx: true } to parserOptions
 *   plugins      {object}   — merged with base plugins ({ "@typescript-eslint": … })
 *   rules        {object}   — merged with (and can override) base rules
 *   linterOptions {object}  — passed through to the config object as-is
 *   ignores      {string[]} — passed through to the config object as-is
 *   …any other flat-config key is forwarded as-is
 *
 * Base rules applied to every config produced by this factory:
 *   no-redeclare                      off  (superseded by the TS-aware version)
 *   @typescript-eslint/no-redeclare   error
 *   @typescript-eslint/no-unused-vars error (args/vars starting with _ are exempt)
 */

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

/**
 * Creates a base ESLint flat-config object for TypeScript packages.
 *
 * @param {string[]} files - Glob patterns for files to lint.
 * @param {object} [options]
 * @param {boolean} [options.jsx=false] - Enable JSX/TSX parsing.
 * @param {object} [options.plugins={}] - Additional plugins merged into the config.
 * @param {object} [options.rules={}] - Additional rules merged on top of the base rules.
 * @param {object} [options.linterOptions] - Passed through as-is.
 * @param {string[]} [options.ignores] - Passed through as-is.
 * @returns {import("eslint").Linter.Config}
 */
export function createBaseConfig(files, options = {}) {
  const {
    jsx = false,
    plugins: extraPlugins = {},
    rules: extraRules = {},
    ...rest
  } = options;

  return {
    files,
    plugins: {
      "@typescript-eslint": tsPlugin,
      ...extraPlugins,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ...(jsx ? { ecmaFeatures: { jsx: true } } : {}),
      },
    },
    rules: {
      "no-redeclare": "off",
      "@typescript-eslint/no-redeclare": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      ...extraRules,
    },
    ...rest,
  };
}

export default [createBaseConfig(["**/*.{ts,tsx}"])];
