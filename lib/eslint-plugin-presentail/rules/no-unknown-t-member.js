/**
 * no-unknown-t-member
 *
 * Warns when `t.someKey` is accessed and `someKey` is not a key in the mobile
 * app's EN translation object (`artifacts/presentail/lib/translations.ts`).
 *
 * Only fires when `t` is bound to the return value of `useT()` in the current
 * function scope, so other objects named `t` are not affected.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../");
const TRANSLATIONS_FILE = path.join(
  REPO_ROOT,
  "artifacts/presentail/lib/translations.ts",
);

function loadMobileKeys() {
  try {
    const src = fs.readFileSync(TRANSLATIONS_FILE, "utf8");
    const keys = new Set();
    // Match lines like:   keyName: "..." or   keyName: `...`
    // We only scan until we hit the AR object to avoid picking up AR/FR keys.
    const enBlock = src.split(/^const AR\b/m)[0];
    const re = /^\s{2}([a-zA-Z_][a-zA-Z0-9_]*):/gm;
    let m;
    while ((m = re.exec(enBlock)) !== null) {
      keys.add(m[1]);
    }
    return keys;
  } catch {
    return null;
  }
}

const VALID_KEYS = loadMobileKeys();

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Warn when t.key references a translation key not defined in the mobile EN locale",
      url: "https://github.com/your-org/presentail",
    },
    messages: {
      unknownKey:
        "Unknown translation key '{{key}}'. Add it to the EN object in artifacts/presentail/lib/translations.ts.",
      keysNotLoaded:
        "Could not load translation keys from translations.ts; skipping check.",
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
     * Returns true when the VariableDeclarator's init is a call to useT().
     *   const t = useT()
     */
    function isUseTCall(node) {
      return (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        node.callee.name === "useT" &&
        node.arguments.length === 0
      );
    }

    /**
     * Walk the scope chain to find if `name` is declared via `const name = useT()`.
     */
    function isUseTVariable(scope, name) {
      let s = scope;
      while (s) {
        for (const variable of s.variables) {
          if (variable.name !== name) continue;
          for (const def of variable.defs) {
            if (
              def.type === "Variable" &&
              def.node.type === "VariableDeclarator" &&
              def.node.init &&
              isUseTCall(def.node.init)
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
      MemberExpression(node) {
        if (
          node.computed ||
          node.object.type !== "Identifier" ||
          node.property.type !== "Identifier"
        ) {
          return;
        }

        const objectName = node.object.name;
        const propertyName = node.property.name;

        if (!isUseTVariable(context.sourceCode.getScope(node), objectName)) return;

        if (!VALID_KEYS.has(propertyName)) {
          context.report({
            node: node.property,
            messageId: "unknownKey",
            data: { key: propertyName },
          });
        }
      },
    };
  },
};

export default rule;
