/**
 * no-unknown-t-member
 *
 * Warns when `t.someKey` or `t["someKey"]` / `t['someKey']` is accessed and
 * `someKey` is not a key in the mobile app's EN translation object
 * (`artifacts/presentail/lib/translations.ts`).
 *
 * Only fires when `t` is bound to the return value of `useT()` in the current
 * function scope, so other objects named `t` are not affected.
 *
 * Dynamic bracket access (`t[variable]`) is deliberately ignored — the rule
 * cannot statically resolve runtime values, and flagging them would produce
 * false positives on the legitimate dynamic-key patterns already tracked by
 * the no-orphan-translation-key scanner.
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

/**
 * Extract the top-level keys from the EN block of translations.ts.
 * Returns null on I/O / parse failure so the rule can report keysNotLoaded.
 *
 * @returns {Set<string>|null}
 */
function loadMobileKeys() {
  try {
    const src = fs.readFileSync(TRANSLATIONS_FILE, "utf8");
    const keys = new Set();
    // Only scan the EN block (before `const AR`).
    const enBlock = src.split(/^const AR\b/m)[0];
    // Match two-space-indented top-level key lines: `  keyName:`
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

// ── shared create logic ───────────────────────────────────────────────────────

/**
 * Build the rule's `create` function against a given key set (real or injected).
 *
 * @param {Set<string>|null} validKeys
 * @returns {(context: import("eslint").Rule.RuleContext) => import("eslint").Rule.RuleListener}
 */
function makeCreate(validKeys) {
  return function create(context) {
    if (validKeys === null) {
      return {
        Program() {
          context.report({ loc: { line: 1, column: 0 }, messageId: "keysNotLoaded" });
        },
      };
    }

    /**
     * Returns true when `node` is a call to `useT()` with no arguments.
     *
     * @param {import("estree").Node} node
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
     *
     * @param {import("eslint").Scope.Scope} scope
     * @param {string} name
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
        if (node.object.type !== "Identifier") return;

        const objectName = node.object.name;

        // ── dot notation: t.someKey ────────────────────────────────────────
        if (!node.computed && node.property.type === "Identifier") {
          const propertyName = node.property.name;
          if (!isUseTVariable(context.sourceCode.getScope(node), objectName)) return;
          if (!validKeys.has(propertyName)) {
            context.report({
              node: node.property,
              messageId: "unknownKey",
              data: { key: propertyName },
            });
          }
          return;
        }

        // ── bracket notation with a string literal: t["someKey"] ──────────
        if (
          node.computed &&
          node.property.type === "Literal" &&
          typeof node.property.value === "string"
        ) {
          const propertyName = node.property.value;
          if (!isUseTVariable(context.sourceCode.getScope(node), objectName)) return;
          if (!validKeys.has(propertyName)) {
            context.report({
              node: node.property,
              messageId: "unknownKey",
              data: { key: propertyName },
            });
          }
        }

        // Dynamic bracket access (t[variable]) is intentionally ignored.
      },
    };
  };
}

// ── rule ──────────────────────────────────────────────────────────────────────

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Warn when t.key or t['key'] references a translation key not defined in the mobile EN locale",
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

  create: makeCreate(VALID_KEYS),
};

export default rule;

// ── test factory ──────────────────────────────────────────────────────────────

/**
 * Test-only factory that creates a rule instance with an injected valid-key set
 * instead of reading from the filesystem.  Mirrors the `_createRuleForTest`
 * pattern used by `no-unknown-t-call` and `no-orphan-translation-key`.
 *
 * @param {{ validKeys: Set<string> | null }} opts
 * @returns {import("eslint").Rule.RuleModule}
 */
export function _createRuleForTest({ validKeys }) {
  return {
    meta: rule.meta,
    create: makeCreate(validKeys),
  };
}
