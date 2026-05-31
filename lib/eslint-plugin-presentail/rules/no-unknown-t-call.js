/**
 * no-unknown-t-call
 *
 * Warns when `t("some.key")` is called with a literal key that is not defined
 * in the web app's STRINGS locale map
 * (`artifacts/presentail-web/src/locales/`).
 *
 * Only fires when `t` is the translation function bound from `useLocale()` or
 * obtained from destructuring the locale context in the current scope, avoiding
 * false positives on other `t` variables.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../");
const LOCALES_DIR = path.join(
  REPO_ROOT,
  "artifacts/presentail-web/src/locales",
);

function loadWebKeys() {
  try {
    const files = fs
      .readdirSync(LOCALES_DIR)
      .filter((f) => f.endsWith(".ts") && f !== "types.ts" && f !== "index.ts");

    const keys = new Set();
    for (const file of files) {
      const src = fs.readFileSync(path.join(LOCALES_DIR, file), "utf8");
      // Match Dict entries:  "some.key": {
      const re = /"([^"]+)":\s*\{/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        keys.add(m[1]);
      }
    }
    return keys;
  } catch {
    return null;
  }
}

const VALID_KEYS = loadWebKeys();

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Warn when t('key') references a translation key not defined in the web STRINGS locale",
      url: "https://github.com/your-org/presentail",
    },
    messages: {
      unknownKey:
        "Unknown translation key '{{key}}'. Add it to the appropriate locale file in artifacts/presentail-web/src/locales/.",
      keysNotLoaded:
        "Could not load web translation keys from locales/; skipping check.",
    },
    schema: [],
  },

  create(context) {
    if (VALID_KEYS === null) {
      return {
        Program() {
          context.report({ loc: { line: 1, column: 0 }, messageId: "keysNotLoaded" });
        },
      };
    }

    /**
     * Returns true when the node represents a call to `useLocale()`.
     */
    function isUseLocaleCall(node) {
      return (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        node.callee.name === "useLocale" &&
        node.arguments.length === 0
      );
    }

    /**
     * Walk the scope chain to check if the variable `name` was declared as:
     *   const { t } = useLocale()
     * or
     *   const t = useLocale().t  (uncommon but safe to include)
     */
    function isTFromLocale(scope, name) {
      let s = scope;
      while (s) {
        for (const variable of s.variables) {
          if (variable.name !== name) continue;
          for (const def of variable.defs) {
            if (def.type !== "Variable") continue;
            const decl = def.node; // VariableDeclarator
            if (!decl.init) continue;

            // Pattern 1: const { t } = useLocale()
            if (
              decl.id.type === "ObjectPattern" &&
              isUseLocaleCall(decl.init)
            ) {
              return true;
            }

            // Pattern 2: const t = useLocale().t  (MemberExpression)
            if (
              decl.id.type === "Identifier" &&
              decl.id.name === name &&
              decl.init.type === "MemberExpression" &&
              decl.init.property.type === "Identifier" &&
              decl.init.property.name === "t" &&
              isUseLocaleCall(decl.init.object)
            ) {
              return true;
            }
          }
        }
        s = s.upper;
      }
      return false;
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type !== "Identifier" ||
          node.callee.name !== "t"
        ) {
          return;
        }

        const firstArg = node.arguments[0];
        if (!firstArg || firstArg.type !== "Literal" || typeof firstArg.value !== "string") {
          return;
        }

        if (!isTFromLocale(context.sourceCode.getScope(node), "t")) return;

        const key = firstArg.value;

        // Skip dynamic / template patterns (already validated by the script).
        // Only flag if the key does not exist at all.
        if (!VALID_KEYS.has(key)) {
          context.report({
            node: firstArg,
            messageId: "unknownKey",
            data: { key },
          });
        }
      },
    };
  },
};

export default rule;
