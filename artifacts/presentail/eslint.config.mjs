/**
 * ESLint flat config for the Presentail mobile app.
 *
 * presentail/no-unknown-t-member — warns when code accesses t.someKey (where
 *   t comes from useT()) and someKey is not a valid key in the EN translation
 *   object in lib/translations.ts.
 *
 * presentail/no-orphan-translation-key — warns when a key is defined in the
 *   EN block of lib/translations.ts but never referenced anywhere in the
 *   mobile source tree. Scoped to translations.ts only.
 *
 * Run:  pnpm --filter @workspace/presentail run lint
 */

import { createBaseConfig } from "@workspace/eslint-config-base";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import presentailPlugin from "@workspace/eslint-plugin-presentail";
import tsParser from "@typescript-eslint/parser";

export default [
  createBaseConfig(["**/*.{ts,tsx}"], {
    jsx: true,
    ignores: ["node_modules/**", ".expo/**", "dist/**", "__generated__/**"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      presentail: presentailPlugin,
    },
    linterOptions: {
      // Existing files may have eslint-disable comments for plugins that are
      // not part of this minimal config. Ignore them rather than erroring.
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "presentail/no-unknown-t-member": "warn",
    },
  }),
  // Orphan-key check: scoped to the locale catalogue file only so the rule
  // never fires on ordinary application code.
  {
    files: ["lib/translations.ts"],
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
