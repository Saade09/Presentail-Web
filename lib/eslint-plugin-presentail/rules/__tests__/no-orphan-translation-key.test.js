/**
 * Tests for the no-orphan-translation-key ESLint rule.
 *
 * Two complementary test suites:
 *
 * 1. Scanner unit tests — exercise `_scanMobileSource`, `_scanWebSource`, and
 *    `_resolveWebVarNames` directly with synthetic source-text strings.  These
 *    cover the regex logic (dot-notation, bracket-notation, dynamic-variable
 *    t[variable] conservative treatment, template-literal prefix extraction,
 *    pass-2 variable resolution) without any filesystem I/O.
 *
 * 2. RuleTester (AST visitor) tests — exercise `_createRuleForTest` with
 *    injected referenced-key sets and a fake filename to drive the rule visitor.
 *    Covers: used key → no warning; unused key → orphanKey* warning; suppress
 *    comment silences the warning; non-locale file → no visitors; keysNotLoaded
 *    when the referenced set is null.
 */

import { describe, it, expect } from "vitest";
import { RuleTester, Linter } from "eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  _createRuleForTest,
  _scanMobileSource,
  _scanWebSource,
  _resolveWebVarNames,
} from "../no-orphan-translation-key.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Fake filesystem paths ─────────────────────────────────────────────────────
// These paths don't need to exist on disk; the rule only compares them as
// strings against `context.filename`.

const FAKE_MOBILE_TRANSLATIONS_FILE = path.resolve(
  __dirname,
  "fake-mobile/lib/translations.ts",
);
const FAKE_WEB_LOCALES_DIR = path.resolve(
  __dirname,
  "fake-web/src/locales",
);
const FAKE_WEB_LOCALE_FILE = path.join(FAKE_WEB_LOCALES_DIR, "index.ts");

// ── Shared RuleTester ─────────────────────────────────────────────────────────

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Scanner unit tests — pure regex logic, no ESLint/AST
// ═══════════════════════════════════════════════════════════════════════════════

describe("_scanMobileSource — dot-notation t.key references", () => {
  it("adds keys accessed via t.keyName to the referenced set", () => {
    const ref = new Set();
    _scanMobileSource(`
      const t = useT();
      return <Text>{t.greeting}</Text>;
    `, ref);
    expect(ref.has("greeting")).toBe(true);
  });

  it("adds multiple different keys found via dot notation", () => {
    const ref = new Set();
    _scanMobileSource(`
      const t = useT();
      console.log(t.greeting, t.farewell, t.ctaLabel);
    `, ref);
    expect([...ref]).toEqual(expect.arrayContaining(["greeting", "farewell", "ctaLabel"]));
  });

  it("does NOT add method calls — t.someMethod() is excluded", () => {
    const ref = new Set();
    _scanMobileSource("const t = useT(); t.someMethod();", ref);
    expect(ref.has("someMethod")).toBe(false);
  });

  it("skips files that do not contain useT( or translations[", () => {
    const ref = new Set();
    _scanMobileSource("const x = { greeting: 'hello' };", ref);
    expect(ref.size).toBe(0);
  });
});

describe("_scanMobileSource — bracket-notation t['key'] / t[\"key\"] references", () => {
  it("adds keys accessed via t['keyName'] single-quoted bracket", () => {
    const ref = new Set();
    _scanMobileSource(`const t = useT(); return t['greeting'];`, ref);
    expect(ref.has("greeting")).toBe(true);
  });

  it("adds keys accessed via t[\"keyName\"] double-quoted bracket", () => {
    const ref = new Set();
    _scanMobileSource(`const t = useT(); return t["farewell"];`, ref);
    expect(ref.has("farewell")).toBe(true);
  });
});

describe("_scanMobileSource — dynamic t[variable] conservative treatment", () => {
  it("adds quoted string literals in the file when t[variable] is found", () => {
    const ref = new Set();
    // The file has a dynamic t[someVar] access AND quoted string literals in
    // non-key positions (e.g. array entries, variable values).  The scanner
    // conservatively adds those quoted strings to avoid false positives.
    _scanMobileSource(`
      const t = useT();
      const keys = ['greeting', 'farewell'];
      const nameKey = keys[Math.floor(Math.random() * keys.length)];
      return t[nameKey];
    `, ref);
    // 'greeting' and 'farewell' appear as quoted strings NOT followed by ':' → added
    expect(ref.has("greeting")).toBe(true);
    expect(ref.has("farewell")).toBe(true);
  });

  it("does not add keys that appear in object literal positions (foo: val)", () => {
    const ref = new Set();
    _scanMobileSource(`
      const t = useT();
      const key = nameMap[id];
      t[key];
      const x = { orphan: "value" };
    `, ref);
    // "orphan" appears as an object key (followed by :), so keyLiteralRe excludes it
    expect(ref.has("orphan")).toBe(false);
  });
});

describe("_scanWebSource — static t('key') references", () => {
  it("collects a key from t('key') with single quotes", () => {
    const ref = new Set();
    const prefixes = new Set();
    const vars = new Set();
    _scanWebSource(`const label = t('home.title');`, ref, prefixes, vars);
    expect(ref.has("home.title")).toBe(true);
    expect(prefixes.size).toBe(0);
    expect(vars.size).toBe(0);
  });

  it("collects a key from t(\"key\") with double quotes", () => {
    const ref = new Set();
    const prefixes = new Set();
    const vars = new Set();
    _scanWebSource(`const label = t("home.subtitle");`, ref, prefixes, vars);
    expect(ref.has("home.subtitle")).toBe(true);
  });

  it("collects multiple keys from multiple t() calls in one file", () => {
    const ref = new Set();
    _scanWebSource(
      `t("nav.home"); t('nav.about', { count }); t("footer.copy");`,
      ref,
      new Set(),
      new Set(),
    );
    expect([...ref]).toEqual(
      expect.arrayContaining(["nav.home", "nav.about", "footer.copy"]),
    );
  });
});

describe("_scanWebSource — template-literal prefix extraction", () => {
  it("extracts the prefix before ${ from t(`prefix.${expr}`)", () => {
    const ref = new Set();
    const prefixes = new Set();
    const vars = new Set();
    _scanWebSource("t(`seo.${routeKey}.title`)", ref, prefixes, vars);
    expect(prefixes.has("seo.")).toBe(true);
  });

  it("extracts a multi-segment prefix correctly", () => {
    const ref = new Set();
    const prefixes = new Set();
    const vars = new Set();
    _scanWebSource("t(`lang.label.${lang}`)", ref, prefixes, vars);
    expect(prefixes.has("lang.label.")).toBe(true);
  });

  it("ignores a template with no static prefix (pure variable)", () => {
    const ref = new Set();
    const prefixes = new Set();
    const vars = new Set();
    _scanWebSource("t(`${someVar}`)", ref, prefixes, vars);
    expect(prefixes.size).toBe(0);
  });
});

describe("_scanWebSource — variable call t(someVar) collection", () => {
  it("collects bare identifier from t(varName)", () => {
    const ref = new Set();
    const prefixes = new Set();
    const vars = new Set();
    _scanWebSource("t(titleKey)", ref, prefixes, vars);
    expect(vars.has("titleKey")).toBe(true);
    expect(ref.size).toBe(0);
  });

  it("does not mistake t('string') for a variable call", () => {
    const ref = new Set();
    const prefixes = new Set();
    const vars = new Set();
    _scanWebSource(`t("some.key")`, ref, prefixes, vars);
    expect(vars.size).toBe(0);
    expect(ref.has("some.key")).toBe(true);
  });
});

describe("_resolveWebVarNames — pass-2 variable-to-string tracing", () => {
  it("resolves const varName = 'key.name' to a referenced key", () => {
    const ref = new Set();
    _resolveWebVarNames(
      [`const titleKey = "bestSellers.title";`],
      new Set(["titleKey"]),
      ref,
    );
    expect(ref.has("bestSellers.title")).toBe(true);
  });

  it("resolves assignment varName = 'key.name' (without const/let)", () => {
    const ref = new Set();
    _resolveWebVarNames(
      [`titleKey = "collections.summer.title";`],
      new Set(["titleKey"]),
      ref,
    );
    expect(ref.has("collections.summer.title")).toBe(true);
  });

  it("resolves JSX-attribute-style varName='key.name' (no spaces around =)", () => {
    const ref = new Set();
    _resolveWebVarNames(
      [`<Comp key="foo" titleKey="bestSellers.title" />`],
      new Set(["titleKey"]),
      ref,
    );
    expect(ref.has("bestSellers.title")).toBe(true);
  });

  it("collects multiple keys from multiple matching lines in multiple files", () => {
    const ref = new Set();
    _resolveWebVarNames(
      [
        `const titleKey = "home.title";`,
        `const titleKey = "brand.title"; const bodyKey = "home.body";`,
      ],
      new Set(["titleKey", "bodyKey"]),
      ref,
    );
    expect([...ref]).toEqual(
      expect.arrayContaining(["home.title", "brand.title", "home.body"]),
    );
  });

  it("is a no-op when varNames is empty", () => {
    const ref = new Set();
    _resolveWebVarNames([`const titleKey = "home.title";`], new Set(), ref);
    expect(ref.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. RuleTester tests — AST visitor logic via _createRuleForTest
// ═══════════════════════════════════════════════════════════════════════════════

// ── Mobile ────────────────────────────────────────────────────────────────────

describe("no-orphan-translation-key — mobile (AST visitor)", () => {
  it("reports no warnings for a key that IS referenced", () => {
    const rule = _createRuleForTest({
      mobileReferenced: new Set(["greeting", "farewell"]),
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });

    tester.run("no-orphan-translation-key", rule, {
      valid: [
        {
          filename: FAKE_MOBILE_TRANSLATIONS_FILE,
          code: `const EN = { greeting: "Hello", farewell: "Goodbye" };`,
        },
      ],
      invalid: [],
    });
  });

  it("warns for a key in EN that is never referenced", () => {
    const rule = _createRuleForTest({
      mobileReferenced: new Set(["greeting"]),
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });

    tester.run("no-orphan-translation-key", rule, {
      valid: [],
      invalid: [
        {
          filename: FAKE_MOBILE_TRANSLATIONS_FILE,
          code: `const EN = { greeting: "Hello", orphanKey: "Never used" };`,
          errors: [
            { messageId: "orphanKeyMobile", data: { key: "orphanKey" } },
          ],
        },
      ],
    });
  });

  it("suppress comment silences the orphanKeyMobile warning", () => {
    // Use Linter directly so the rule registers under its production plugin
    // name "presentail/no-orphan-translation-key", matching the disable comment
    // form that developers use in real locale files.
    const rule = _createRuleForTest({
      mobileReferenced: new Set([]),
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });
    const linter = new Linter({ configType: "flat" });
    const code = [
      `const EN = {`,
      `  // eslint-disable-next-line presentail/no-orphan-translation-key -- used dynamically`,
      `  dynamicKey: "Accessed at runtime via t[someVar]",`,
      `};`,
    ].join("\n");
    const messages = linter.verify(code, [
      {
        plugins: { presentail: { rules: { "no-orphan-translation-key": rule } } },
        rules: { "presentail/no-orphan-translation-key": "warn" },
        languageOptions: { ecmaVersion: 2022, sourceType: "module" },
      },
    ], { filename: FAKE_MOBILE_TRANSLATIONS_FILE });
    const ruleMessages = messages.filter(
      (m) => m.ruleId === "presentail/no-orphan-translation-key",
    );
    expect(ruleMessages).toHaveLength(0);
  });

  it("does not warn for properties outside the EN variable declaration", () => {
    const rule = _createRuleForTest({
      mobileReferenced: new Set([]),
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });

    tester.run("no-orphan-translation-key", rule, {
      valid: [
        {
          filename: FAKE_MOBILE_TRANSLATIONS_FILE,
          code: `
            const EN = {};
            const AR = { greeting: "مرحبا" };
            const FR = { greeting: "Bonjour" };
          `,
        },
      ],
      invalid: [],
    });
  });

  it("does not warn for a computed property key inside EN", () => {
    const rule = _createRuleForTest({
      mobileReferenced: new Set([]),
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });

    tester.run("no-orphan-translation-key", rule, {
      valid: [
        {
          filename: FAKE_MOBILE_TRANSLATIONS_FILE,
          code: `const key = "dynamic"; const EN = { [key]: "value" };`,
        },
      ],
      invalid: [],
    });
  });

  it("reports keysNotLoaded when mobileReferenced is null (I/O failure)", () => {
    const rule = _createRuleForTest({
      mobileReferenced: null,
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });

    tester.run("no-orphan-translation-key", rule, {
      valid: [],
      invalid: [
        {
          filename: FAKE_MOBILE_TRANSLATIONS_FILE,
          code: `const EN = { greeting: "Hello" };`,
          errors: [{ messageId: "keysNotLoaded" }],
        },
      ],
    });
  });

  it("flags multiple orphan keys in a single EN block", () => {
    const rule = _createRuleForTest({
      mobileReferenced: new Set(["used"]),
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });

    tester.run("no-orphan-translation-key", rule, {
      valid: [],
      invalid: [
        {
          filename: FAKE_MOBILE_TRANSLATIONS_FILE,
          code: `const EN = { used: "ok", orphanA: "x", orphanB: "y" };`,
          errors: [
            { messageId: "orphanKeyMobile", data: { key: "orphanA" } },
            { messageId: "orphanKeyMobile", data: { key: "orphanB" } },
          ],
        },
      ],
    });
  });
});

// ── Web ───────────────────────────────────────────────────────────────────────

describe("no-orphan-translation-key — web (AST visitor)", () => {
  it("reports no warnings when the key appears in a static t('key') call", () => {
    const rule = _createRuleForTest({
      webReferenced: {
        referenced: new Set(["home.title", "home.subtitle"]),
        dynamicPrefixes: [],
      },
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });

    tester.run("no-orphan-translation-key", rule, {
      valid: [
        {
          filename: FAKE_WEB_LOCALE_FILE,
          code: `export const STRINGS = {
            "home.title":    { en: "Home",     ar: "الرئيسية" },
            "home.subtitle": { en: "Welcome",  ar: "أهلاً"    },
          };`,
        },
      ],
      invalid: [],
    });
  });

  it("warns when a Dict entry key is never passed to t()", () => {
    const rule = _createRuleForTest({
      webReferenced: {
        referenced: new Set(["home.title"]),
        dynamicPrefixes: [],
      },
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });

    tester.run("no-orphan-translation-key", rule, {
      valid: [],
      invalid: [
        {
          filename: FAKE_WEB_LOCALE_FILE,
          code: `export const STRINGS = {
            "home.title":   { en: "Home",        ar: "الرئيسية"      },
            "home.orphan":  { en: "Never used",  ar: "غير مستخدم" },
          };`,
          errors: [
            { messageId: "orphanKeyWeb", data: { key: "home.orphan" } },
          ],
        },
      ],
    });
  });

  it("suppress comment silences the orphanKeyWeb warning", () => {
    // Use Linter directly so the rule registers under its production plugin
    // name "presentail/no-orphan-translation-key", matching the disable comment
    // form that developers use in real locale files.
    const rule = _createRuleForTest({
      webReferenced: {
        referenced: new Set(),
        dynamicPrefixes: [],
      },
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });
    const linter = new Linter({ configType: "flat" });
    const code = [
      `export const STRINGS = {`,
      `  // eslint-disable-next-line presentail/no-orphan-translation-key -- used via t(titleKey)`,
      `  "bestSellers.title": { en: "Best Sellers", ar: "الأكثر مبيعاً" },`,
      `};`,
    ].join("\n");
    const messages = linter.verify(code, [
      {
        plugins: { presentail: { rules: { "no-orphan-translation-key": rule } } },
        rules: { "presentail/no-orphan-translation-key": "warn" },
        languageOptions: { ecmaVersion: 2022, sourceType: "module" },
      },
    ], { filename: FAKE_WEB_LOCALE_FILE });
    const ruleMessages = messages.filter(
      (m) => m.ruleId === "presentail/no-orphan-translation-key",
    );
    expect(ruleMessages).toHaveLength(0);
  });

  it("no false positive when key is covered by a dynamic template-literal prefix", () => {
    const rule = _createRuleForTest({
      webReferenced: {
        referenced: new Set(),
        dynamicPrefixes: ["seo."],
      },
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });

    tester.run("no-orphan-translation-key", rule, {
      valid: [
        {
          filename: FAKE_WEB_LOCALE_FILE,
          code: `export const STRINGS = {
            "seo.home.title":    { en: "Flowers Lebanon", ar: "زهور لبنان" },
            "seo.brand.title":   { en: "Brand",           ar: "ماركة"      },
          };`,
        },
      ],
      invalid: [],
    });
  });

  it("does not warn for entries whose value is a plain string (not a Dict)", () => {
    const rule = _createRuleForTest({
      webReferenced: {
        referenced: new Set(),
        dynamicPrefixes: [],
      },
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });

    tester.run("no-orphan-translation-key", rule, {
      valid: [
        {
          filename: FAKE_WEB_LOCALE_FILE,
          code: `export const STRINGS_FR = {
            "home.title":  "Accueil",
            "home.orphan": "Jamais utilisé",
          };`,
        },
      ],
      invalid: [],
    });
  });

  it("does not warn for a computed web locale property", () => {
    const rule = _createRuleForTest({
      webReferenced: {
        referenced: new Set(),
        dynamicPrefixes: [],
      },
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });

    tester.run("no-orphan-translation-key", rule, {
      valid: [
        {
          filename: FAKE_WEB_LOCALE_FILE,
          code: `const k = "dyn"; export const STRINGS = { [k]: { en: "x", ar: "y" } };`,
        },
      ],
      invalid: [],
    });
  });

  it("reports keysNotLoaded when webReferenced is null (I/O failure)", () => {
    const rule = _createRuleForTest({
      webReferenced: null,
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });

    tester.run("no-orphan-translation-key", rule, {
      valid: [],
      invalid: [
        {
          filename: FAKE_WEB_LOCALE_FILE,
          code: `export const STRINGS = { "home.title": { en: "Home", ar: "الرئيسية" } };`,
          errors: [{ messageId: "keysNotLoaded" }],
        },
      ],
    });
  });

  it("flags multiple orphan keys and leaves referenced and prefix-covered keys clean", () => {
    const rule = _createRuleForTest({
      webReferenced: {
        referenced: new Set(["nav.home"]),
        dynamicPrefixes: ["seo."],
      },
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });

    tester.run("no-orphan-translation-key", rule, {
      valid: [],
      invalid: [
        {
          filename: FAKE_WEB_LOCALE_FILE,
          code: `export const STRINGS = {
            "nav.home":     { en: "Home",       ar: "الرئيسية"     },
            "seo.og.title": { en: "OG Title",   ar: "العنوان"      },
            "orphan.one":   { en: "Unused one", ar: "غير مستخدم ١" },
            "orphan.two":   { en: "Unused two", ar: "غير مستخدم ٢" },
          };`,
          errors: [
            { messageId: "orphanKeyWeb", data: { key: "orphan.one" } },
            { messageId: "orphanKeyWeb", data: { key: "orphan.two" } },
          ],
        },
      ],
    });
  });
});

// ── Non-locale file ───────────────────────────────────────────────────────────

describe("no-orphan-translation-key — non-locale file", () => {
  it("fires no visitors and produces no errors for an unrelated source file", () => {
    const rule = _createRuleForTest({
      mobileReferenced: new Set(),
      webReferenced: { referenced: new Set(), dynamicPrefixes: [] },
      mobileTranslationsFile: FAKE_MOBILE_TRANSLATIONS_FILE,
      webLocalesDir: FAKE_WEB_LOCALES_DIR,
    });

    tester.run("no-orphan-translation-key", rule, {
      valid: [
        {
          filename: "/some/other/Component.tsx",
          code: `const greeting = "hello"; const obj = { key: "value" };`,
        },
      ],
      invalid: [],
    });
  });
});
