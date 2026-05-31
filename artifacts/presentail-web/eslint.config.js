/**
 * ESLint flat config for the Presentail web app.
 *
 * The custom `presentail/no-unknown-t-call` rule warns whenever code calls
 * `t("some.key")` (where `t` comes from `useLocale()`) and `"some.key"` is
 * not a valid key in the web STRINGS locale map.
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
    },
  },
];
