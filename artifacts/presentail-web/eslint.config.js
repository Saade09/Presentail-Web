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

import { createBaseConfig } from "@workspace/eslint-config-base";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import presentailPlugin from "@workspace/eslint-plugin-presentail";
import tsParser from "@typescript-eslint/parser";

export default [
  createBaseConfig(["src/**/*.{ts,tsx}"], {
    jsx: true,
    ignores: ["node_modules/**", "dist/**", "__generated__/**"],
    plugins: {
      "react-hooks": reactHooksPlugin,
      presentail: presentailPlugin,
    },
    linterOptions: {
      // Existing files may have eslint-disable comments for plugins that are
      // not part of this minimal config (e.g. react-hooks, @typescript-eslint).
      // Ignore them rather than erroring on "rule not found".
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "presentail/no-unknown-t-call": "warn",
    },
  }),
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
      "presentail/no-orphan-translation-key": "error",
    },
  },
];
