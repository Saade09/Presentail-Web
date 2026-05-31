import { createBaseConfig } from "@workspace/eslint-config-base";

export default [
  createBaseConfig(["src/**/*.ts"], {
    ignores: ["node_modules/**", "dist/**"],
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
    rules: {
      "no-console": "error",
    },
  }),
];
