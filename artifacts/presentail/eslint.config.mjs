/**
 * ESLint flat config for the Presentail mobile app.
 *
 * The custom `presentail/no-unknown-t-member` rule warns whenever code
 * accesses `t.someKey` (where `t` comes from `useT()`) and `someKey` is not a
 * valid key in the EN translation object in lib/translations.ts.
 *
 * Run:  pnpm --filter @workspace/presentail run lint
 */

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import presentailPlugin from "@workspace/eslint-plugin-presentail";

export default [
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["node_modules/**", ".expo/**", "dist/**", "__generated__/**"],
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react": reactPlugin,
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
      // not part of this minimal config. Ignore them rather than erroring.
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "presentail/no-unknown-t-member": "warn",
    },
  },
];
