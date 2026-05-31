/**
 * ESLint flat config for the Presentail web app.
 *
 * presentail/no-unknown-t-call — warns when code calls t("some.key") (where
 *   t comes from useLocale()) and "some.key" is not a valid key in the web
 *   STRINGS locale map.
 *
 * presentail/no-orphan-translation-key — warns when a key is defined in a
 *   locale file under src/locales/ but never passed to t("…") anywhere in
 *   the web source tree. Scoped to locale files only.
 *
 * Run:  pnpm --filter @workspace/presentail-web run lint
 */

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import presentailPlugin from "@workspace/eslint-plugin-presentail";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["node_modules/**", "dist/**", "__generated__/**"],
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
      presentail: presentailPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    linterOptions: {
      // Existing files may have eslint-disable comments for plugins that are
      // not part of this minimal config (e.g. react-hooks, @typescript-eslint).
      // Ignore them rather than erroring on "rule not found".
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "presentail/no-unknown-t-call": "warn",
      // Catch duplicate variable declarations (e.g. two `const { t } = useLocale()` in
      // the same scope). The base rule is turned off because it doesn't understand
      // TypeScript declaration merging; the @typescript-eslint version handles both.
      "no-redeclare": "off",
      "@typescript-eslint/no-redeclare": "error",
    },
  },
  // Orphan-key check: scoped to the locale catalogue files only so the rule
  // never fires on ordinary application code.
  {
    files: ["src/locales/*.ts"],
    plugins: {
      presentail: presentailPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "presentail/no-orphan-translation-key": "warn",
    },
  },
];
