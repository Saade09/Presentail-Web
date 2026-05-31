/**
 * no-orphan-translation-key
 *
 * Warns when a key is defined in a locale source file but never referenced
 * anywhere in the application's source tree.  Shows a squiggly inline on
 * the key definition so the problem is visible in VS Code / the Replit editor
 * without having to run the manual check-translations script.
 *
 * Mobile: flags keys in the EN block of
 *   artifacts/presentail/lib/translations.ts
 *   that are never accessed via t.keyName or t["keyName"] in any mobile
 *   source file.
 *
 * Web: flags keys (string-literal property keys whose value is an object
 *   with `en`/`ar` fields, i.e. the Dict entries) in any file under
 *   artifacts/presentail-web/src/locales/ that are never passed to
 *   t("some.key") in any web source file.
 *
 * This rule is intentionally scoped to locale files only via the `files`
 * pattern in each artifact's ESLint config — it produces no output on any
 * other file.
 *
 * The source-tree scan is performed once at module load time (like the other
 * rules in this plugin) so repeated lint runs pay no extra I/O cost.
 *
 * ── Dynamic key access — known limitation ────────────────────────────────────
 *
 * This rule performs a static text scan and cannot resolve keys that are
 * accessed through a runtime variable.  Common patterns it cannot see through:
 *
 *   Web (t() calls):
 *     const titleKey = "bestSellers.title";
 *     t(titleKey)                    // ← variable, not a string literal
 *     t(condition ? "a.key" : "b.key")  // ← ternary
 *
 *   Mobile (useT() object):
 *     const key = someMap[id];
 *     t[key]                         // ← computed bracket access with variable
 *
 * The rule WILL report these keys as orphaned even though they are used.
 * This is a deliberate trade-off: the static scan catches the common case
 * (direct string literals) without requiring a full type-aware analysis pass.
 *
 * ── How to suppress a false positive ─────────────────────────────────────────
 *
 * Add an eslint-disable comment on the line immediately above the key
 * definition in the locale file, with a short explanation of the dynamic call
 * site so the next reader knows why the suppression is intentional:
 *
 *   Web (artifacts/presentail-web/src/locales/*.ts):
 *     // eslint-disable-next-line presentail/no-orphan-translation-key -- used dynamically via t(titleKey) in ComponentName
 *     "bestSellers.title": { en: "Best Sellers", ar: "الأكثر مبيعاً" },
 *
 *   Mobile (artifacts/presentail/lib/translations.ts):
 *     // eslint-disable-next-line presentail/no-orphan-translation-key -- accessed as t[nameKey] from data map in ComponentName
 *     myKey: "...",
 *
 * Do NOT use a block disable (`eslint-disable` / `eslint-enable`) unless you
 * are suppressing a large contiguous block of dynamically-accessed keys — and
 * in that case always include the rule name and a comment explaining the
 * dynamic call site so the suppression can be audited later.
 *
 * ── Template-literal prefixes (web only) ─────────────────────────────────────
 *
 * For web keys accessed via a template literal with a fixed prefix:
 *   t(`seo.${routeKey}.title`)
 * the rule automatically marks every catalogue key that starts with "seo." as
 * referenced — no suppress comment is needed.  Only pure-variable calls like
 * t(someVar) require a comment.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../");

const MOBILE_TRANSLATIONS_FILE = path.resolve(
  REPO_ROOT,
  "artifacts/presentail/lib/translations.ts",
);
const MOBILE_SCAN_ROOT = path.resolve(REPO_ROOT, "artifacts/presentail");
const WEB_LOCALES_DIR = path.resolve(
  REPO_ROOT,
  "artifacts/presentail-web/src/locales",
);
const WEB_SCAN_ROOT = path.resolve(REPO_ROOT, "artifacts/presentail-web/src");

const SKIP_DIRS = new Set([
  "node_modules",
  ".expo",
  "dist",
  "dist-web-review",
  ".turbo",
  "__generated__",
]);

// ── file collection ──────────────────────────────────────────────────────────

/**
 * Recursively collect all .ts/.tsx/.js/.jsx files under `dir`, skipping
 * directories in SKIP_DIRS and any file whose resolved path is in `exclude`.
 *
 * @param {string} dir
 * @param {Set<string>} exclude  — set of resolved absolute paths to skip
 * @param {string[]} [out]
 * @returns {string[]}
 */
function collectSourceFiles(dir, exclude, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectSourceFiles(path.join(dir, entry.name), exclude, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      const full = path.resolve(dir, entry.name);
      if (!exclude.has(full)) out.push(full);
    }
  }
  return out;
}

// ── mobile referenced-key scan ───────────────────────────────────────────────

/**
 * Read all mobile source files (excluding translations.ts itself) and collect
 * every translation key that is statically referenced via:
 *   t.keyName        — dot notation (not followed by `(`)
 *   t["keyName"]     — bracket notation with string literal
 *   t['keyName']     — bracket notation with single-quoted literal
 *
 * Only files that contain `useT(` or `translations[` are scanned to avoid
 * false positives from other uses of a variable named `t`.
 *
 * @returns {Set<string>|null}
 */
function loadMobileReferencedKeys() {
  try {
    const exclude = new Set([MOBILE_TRANSLATIONS_FILE]);
    const files = collectSourceFiles(MOBILE_SCAN_ROOT, exclude);
    const referenced = new Set();

    for (const file of files) {
      let src;
      try {
        src = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      // Only scan files that actually use the translation object.
      if (!/\buseT\s*\(/.test(src) && !/translations\s*\[/.test(src)) continue;

      const dotRe = /\bt\.([a-zA-Z_][a-zA-Z0-9_]*)(?!\s*\()/g;
      let m;
      while ((m = dotRe.exec(src)) !== null) {
        referenced.add(m[1]);
      }
      const bracketRe = /\bt\[['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]]/g;
      while ((m = bracketRe.exec(src)) !== null) {
        referenced.add(m[1]);
      }

      // When a file uses dynamic t[variable] lookups (e.g. t[nameKey] where
      // nameKey is assigned from a string literal in a data map), we cannot
      // statically trace which key will be accessed.  Conservatively treat
      // every string literal in such files that matches the key-name pattern
      // as a reference so we don't produce false-positive orphan warnings.
      if (/\bt\[\s*[a-zA-Z_$][a-zA-Z0-9_$.]*\s*\]/.test(src)) {
        const keyLiteralRe = /['"]([a-zA-Z_][a-zA-Z0-9_]*)['"](?!\s*:)/g;
        while ((m = keyLiteralRe.exec(src)) !== null) {
          referenced.add(m[1]);
        }
      }
    }
    return referenced;
  } catch {
    return null;
  }
}

// ── web referenced-key scan ──────────────────────────────────────────────────

/**
 * Collect all locale file paths from the web locales directory.
 * @returns {Set<string>}
 */
function webLocaleFilePaths() {
  const result = new Set();
  try {
    for (const f of fs.readdirSync(WEB_LOCALES_DIR)) {
      if (f.endsWith(".ts") || f.endsWith(".tsx")) {
        result.add(path.resolve(WEB_LOCALES_DIR, f));
      }
    }
  } catch {
    // ignore
  }
  return result;
}

/**
 * Read all web source files (excluding locale files themselves) and collect:
 *   (a) every translation key string passed to t() as a static string literal:
 *         t("some.key") / t('some.key')
 *   (b) every static prefix from dynamic template-literal t() calls:
 *         t(`lang.label.${lang}`) → prefix "lang.label."
 *         t(`seo.${routeKey}.title`) → prefix "seo."
 *       A catalogue key is treated as referenced when its name starts with any
 *       such prefix — matching the strategy used in checkUnusedWebTranslationKeys.ts.
 *
 * Returns null on any I/O error so the rule can report keysNotLoaded instead
 * of silently emitting false positives.
 *
 * @returns {{ referenced: Set<string>, dynamicPrefixes: string[] }|null}
 */
function loadWebReferencedKeys() {
  try {
    const exclude = webLocaleFilePaths();
    const files = collectSourceFiles(WEB_SCAN_ROOT, exclude);
    const referenced = new Set();
    const dynamicPrefixes = new Set();

    for (const file of files) {
      let src;
      try {
        src = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }

      // (a) Static: t("key") / t('key')
      const staticRe = /\bt\(\s*['"]([^'"]+)['"]\s*[,)]/g;
      let m;
      while ((m = staticRe.exec(src)) !== null) {
        referenced.add(m[1]);
      }

      // (b) Dynamic: t(`prefix.${expr}`) — capture the static text before ${
      //   Same regex as extractDynamicPrefixes() in checkUnusedWebTranslationKeys.ts
      const dynamicRe = /t\(`([^`$]*)(?:\$\{)/g;
      while ((m = dynamicRe.exec(src)) !== null) {
        const prefix = m[1];
        if (prefix.length > 0) dynamicPrefixes.add(prefix);
      }
    }
    return { referenced, dynamicPrefixes: Array.from(dynamicPrefixes) };
  } catch {
    return null;
  }
}

// ── eager load at module evaluation time ─────────────────────────────────────

const MOBILE_REFERENCED = loadMobileReferencedKeys();
const WEB_REFERENCED = loadWebReferencedKeys();

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true when `node` is an ObjectExpression whose top-level properties
 * all have keys `"en"` and `"ar"` (or a subset thereof) — i.e. a Dict entry.
 * We use this to distinguish Dict entries from the flat *Fr Record<string,string>
 * entries so we don't double-report the same key.
 *
 * @param {import("estree").Node} node
 */
function isDictEntryValue(node) {
  if (!node || node.type !== "ObjectExpression") return false;
  return node.properties.some(
    (p) =>
      p.type === "Property" &&
      !p.computed &&
      p.key.type === "Identifier" &&
      (p.key.name === "en" || p.key.name === "ar"),
  );
}

// ── rule ─────────────────────────────────────────────────────────────────────

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn when a translation key is defined in a locale file but never referenced in the source tree",
      url: "https://github.com/your-org/presentail",
    },
    messages: {
      orphanKeyMobile:
        "Translation key '{{key}}' is defined in EN but never referenced in the mobile source tree. Remove it from all three locale blocks, or add a usage.",
      orphanKeyWeb:
        "Translation key '{{key}}' is defined in the locale catalogue but never passed to t('{{key}}') in the web source tree. Remove it or add a usage.",
      keysNotLoaded:
        "Could not scan the source tree for translation key references; skipping orphan-key check.",
    },
    schema: [],
  },

  create(context) {
    // Resolve to an absolute path for reliable comparison.
    const filename = path.resolve(
      context.filename ?? context.getFilename?.() ?? "",
    );

    // ── mobile: translations.ts ─────────────────────────────────────────────
    if (filename === MOBILE_TRANSLATIONS_FILE) {
      if (MOBILE_REFERENCED === null) {
        return {
          Program() {
            context.report({
              loc: { line: 1, column: 0 },
              messageId: "keysNotLoaded",
            });
          },
        };
      }

      // Track nesting depth inside the EN ObjectExpression so we only flag
      // top-level keys (the flat `keyName: "..."` pairs), not any nested
      // objects that might exist.
      let enObjectDepth = 0;

      return {
        // Enter `const EN = { … }` — the direct ObjectExpression child
        "VariableDeclarator[id.name='EN'] > ObjectExpression"() {
          enObjectDepth++;
        },
        "VariableDeclarator[id.name='EN'] > ObjectExpression:exit"() {
          enObjectDepth--;
        },
        Property(node) {
          if (enObjectDepth !== 1) return;
          if (node.computed) return;
          if (node.key.type !== "Identifier") return;

          const key = node.key.name;
          if (!MOBILE_REFERENCED.has(key)) {
            context.report({
              node: node.key,
              messageId: "orphanKeyMobile",
              data: { key },
            });
          }
        },
      };
    }

    // ── web: locales/*.ts ───────────────────────────────────────────────────
    const isWebLocaleFile =
      path.resolve(path.dirname(filename)) === WEB_LOCALES_DIR &&
      filename.endsWith(".ts");

    if (isWebLocaleFile) {
      if (WEB_REFERENCED === null) {
        return {
          Program() {
            context.report({
              loc: { line: 1, column: 0 },
              messageId: "keysNotLoaded",
            });
          },
        };
      }

      const { referenced: webReferenced, dynamicPrefixes } = WEB_REFERENCED;

      /**
       * Returns true when `key` is considered referenced:
       *   (a) the exact key string appears in a static t("key") call, or
       *   (b) the key starts with a dynamic-template prefix extracted from
       *       t(`prefix.${expr}`) calls — same strategy as
       *       checkUnusedWebTranslationKeys.ts / extractDynamicPrefixes().
       */
      function isWebKeyReferenced(key) {
        if (webReferenced.has(key)) return true;
        return dynamicPrefixes.some((prefix) => key.startsWith(prefix));
      }

      return {
        Property(node) {
          // Only flag string-literal keys whose value is a Dict entry (an object
          // with `en` / `ar` fields). This excludes the flat *Fr Record entries
          // (which have string values) so we don't double-report the same key.
          if (node.computed) return;
          if (node.key.type !== "Literal" || typeof node.key.value !== "string")
            return;
          if (!isDictEntryValue(node.value)) return;

          const key = node.key.value;
          if (!isWebKeyReferenced(key)) {
            context.report({
              node: node.key,
              messageId: "orphanKeyWeb",
              data: { key },
            });
          }
        },
      };
    }

    // Not a locale file (shouldn't happen given the `files` filter in
    // eslint.config, but be safe).
    return {};
  },
};

export default rule;
