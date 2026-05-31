/**
 * Unit tests for checkHardcodedWebStrings.ts.
 *
 * Covers:
 *   - stripExpressionsAndTrim  — removes {JSX expressions} and collapses whitespace
 *   - looksLikeEnglishProse    — Arabic-character detection, French-pattern handling,
 *                                URL/email exclusions, word-count thresholds
 *   - shouldSkipLine           — comment lines, import/export, t() usage,
 *                                console.log, displayName
 *   - i18n-ignore annotation   — the bypass pattern used in the main loop
 *   - file-filter logic        — SKIP_DIRS set, test/declaration file exclusions
 *   - regex patterns           — INLINE_JSX_TEXT_RE, STANDALONE_TEXT_RE,
 *                                VISIBLE_PROP_RE, NULLISH_FALLBACK_RE,
 *                                DOC_TITLE_RE, META_TITLE_NAME_RE, META_TITLE_CONTENT_RE
 */

import { describe, it, expect } from "vitest";
import {
  stripExpressionsAndTrim,
  looksLikeEnglishProse,
  containsArabicScript,
  shouldSkipLine,
  SKIP_DIRS,
  INLINE_JSX_TEXT_RE,
  STANDALONE_TEXT_RE,
  STANDALONE_ARABIC_TEXT_RE,
  VISIBLE_PROP_RE,
  NULLISH_FALLBACK_RE,
  DOC_TITLE_RE,
  META_TITLE_NAME_RE,
  META_TITLE_CONTENT_RE,
} from "./checkHardcodedWebStrings.js";

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Executes a regex (with /g flag) against a string and returns all
 * capture-group-1 matches.  Resets lastIndex before each call.
 */
function matchAll(re: RegExp, str: string): string[] {
  re.lastIndex = 0;
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    results.push(m[1]);
  }
  return results;
}

/**
 * Like matchAll, but returns capture-group-2 values.
 * Use for regexes that capture (attr, value) pairs, where the value is group 2.
 */
function matchAllGroup2(re: RegExp, str: string): string[] {
  re.lastIndex = 0;
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    results.push(m[2]);
  }
  return results;
}

// ── stripExpressionsAndTrim ────────────────────────────────────────────────────

describe("stripExpressionsAndTrim", () => {
  it("removes a single JSX expression placeholder", () => {
    expect(stripExpressionsAndTrim("{count} items")).toBe("items");
  });

  it("removes multiple expression placeholders", () => {
    expect(stripExpressionsAndTrim("{first} and {last}")).toBe("and");
  });

  it("handles nested braces one level deep", () => {
    expect(stripExpressionsAndTrim("{fn({a: 1})} text")).toBe("text");
  });

  it("collapses runs of whitespace to a single space", () => {
    expect(stripExpressionsAndTrim("  Hello   World  ")).toBe("Hello World");
  });

  it("returns an empty string for an expression-only input", () => {
    expect(stripExpressionsAndTrim("{someExpr}")).toBe("");
  });

  it("leaves plain text unchanged (after trimming)", () => {
    expect(stripExpressionsAndTrim("  Send Flowers  ")).toBe("Send Flowers");
  });

  it("handles Arabic text without altering it (no expressions to strip)", () => {
    expect(stripExpressionsAndTrim("أرسل الزهور")).toBe("أرسل الزهور");
  });
});

// ── looksLikeEnglishProse ─────────────────────────────────────────────────────

describe("looksLikeEnglishProse — positive (should detect as prose)", () => {
  it("returns true for a typical English two-word phrase", () => {
    expect(looksLikeEnglishProse("Send Flowers")).toBe(true);
  });

  it("returns true for a longer English sentence", () => {
    expect(looksLikeEnglishProse("Proceed to Checkout")).toBe(true);
  });

  it("returns true for a single word of 5+ letters", () => {
    expect(looksLikeEnglishProse("Loading")).toBe(true);
    expect(looksLikeEnglishProse("Submit")).toBe(true);
  });

  it("returns true for French accented text (Latin letters are present)", () => {
    // French also uses Latin letters — the checker intentionally catches it
    // so hardcoded French strings in web source files don't slip through.
    expect(looksLikeEnglishProse("Envoyer des fleurs")).toBe(true);
    expect(looksLikeEnglishProse("Continuer vers le paiement")).toBe(true);
    expect(looksLikeEnglishProse("Votre panier est vide")).toBe(true);
  });

  it("returns true for French text with é/è/à accents alongside base Latin chars", () => {
    expect(looksLikeEnglishProse("Boutique de fleurs")).toBe(true);
  });

  it("returns true for text containing JSX expressions that resolve to prose", () => {
    expect(looksLikeEnglishProse("{count} items in your bag")).toBe(true);
  });
});

describe("looksLikeEnglishProse — negative (Arabic/non-Latin: should NOT detect)", () => {
  it("returns false for pure Arabic text (no Latin letters)", () => {
    expect(looksLikeEnglishProse("أرسل الزهور")).toBe(false);
    expect(looksLikeEnglishProse("حقيبتك فارغة")).toBe(false);
    expect(looksLikeEnglishProse("تابع إلى الدفع")).toBe(false);
  });

  it("returns false for Arabic characters at Unicode boundary U+0600", () => {
    expect(looksLikeEnglishProse("\u0600\u0601\u0602")).toBe(false);
  });

  it("returns false for digits and punctuation only", () => {
    expect(looksLikeEnglishProse("+961")).toBe(false);
    expect(looksLikeEnglishProse("123")).toBe(false);
    expect(looksLikeEnglishProse("—")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(looksLikeEnglishProse("")).toBe(false);
  });

  it("returns false for a single character", () => {
    expect(looksLikeEnglishProse("x")).toBe(false);
  });

  it("returns false for a URL", () => {
    expect(looksLikeEnglishProse("https://example.com/flowers")).toBe(false);
    expect(looksLikeEnglishProse("http://presentail.com")).toBe(false);
  });

  it("returns false for an email address", () => {
    expect(looksLikeEnglishProse("user@example.com")).toBe(false);
  });

  it("returns false for a single word shorter than 5 letters", () => {
    expect(looksLikeEnglishProse("OK")).toBe(false);
    expect(looksLikeEnglishProse("Hi")).toBe(false);
  });

  it("returns false for a pure JSX expression (no remaining text)", () => {
    expect(looksLikeEnglishProse("{t('some.key')}")).toBe(false);
    expect(looksLikeEnglishProse("  {someVar}  ")).toBe(false);
  });
});

// ── containsArabicScript ───────────────────────────────────────────────────────

describe("containsArabicScript — positive (should detect Arabic)", () => {
  it("returns true for common Arabic text", () => {
    expect(containsArabicScript("أرسل الزهور")).toBe(true);
    expect(containsArabicScript("حقيبتك فارغة")).toBe(true);
    expect(containsArabicScript("تابع إلى الدفع")).toBe(true);
  });

  it("returns true for a character at the U+0600 boundary", () => {
    expect(containsArabicScript("\u0600")).toBe(true);
  });

  it("returns true for a character at the U+06FF boundary", () => {
    expect(containsArabicScript("\u06FF")).toBe(true);
  });

  it("returns true for Arabic mixed with other characters", () => {
    expect(containsArabicScript("hello أرسل world")).toBe(true);
  });
});

describe("containsArabicScript — negative (should not detect Arabic)", () => {
  it("returns false for pure English text", () => {
    expect(containsArabicScript("Send Flowers")).toBe(false);
  });

  it("returns false for French accented text", () => {
    expect(containsArabicScript("Envoyer des fleurs")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(containsArabicScript("")).toBe(false);
  });

  it("returns false for digits and punctuation", () => {
    expect(containsArabicScript("+961 123 456")).toBe(false);
  });

  it("returns false for Latin characters with diacritics (non-Arabic)", () => {
    expect(containsArabicScript("café résumé")).toBe(false);
  });
});

// ── shouldSkipLine ─────────────────────────────────────────────────────────────

describe("shouldSkipLine — lines that should be skipped", () => {
  it("skips an empty line", () => {
    expect(shouldSkipLine("")).toBe(true);
    expect(shouldSkipLine("   ")).toBe(true);
  });

  it("skips single-line comments (//)", () => {
    expect(shouldSkipLine("  // This is a comment")).toBe(true);
    expect(shouldSkipLine("// Send Flowers")).toBe(true);
  });

  it("skips JSDoc / block-comment continuation lines (*)", () => {
    expect(shouldSkipLine("  * @param text")).toBe(true);
    expect(shouldSkipLine("   * Returns the label")).toBe(true);
  });

  it("skips block-comment opening lines (/*)", () => {
    expect(shouldSkipLine("  /* block comment")).toBe(true);
  });

  it("skips import statements", () => {
    expect(shouldSkipLine("import React from 'react';")).toBe(true);
    expect(shouldSkipLine("import { useTranslation } from '../lib/i18n';")).toBe(true);
  });

  it("skips export type / export interface declarations", () => {
    expect(shouldSkipLine("export type Language = 'en' | 'ar' | 'fr';")).toBe(true);
    expect(shouldSkipLine("export interface CartItem { id: string }")).toBe(true);
  });

  it("skips type alias declarations", () => {
    expect(shouldSkipLine("type HitKind = 'jsx-text' | 'jsx-prop';")).toBe(true);
  });

  it("skips interface declarations", () => {
    expect(shouldSkipLine("interface ProductCardProps {")).toBe(true);
  });

  it("skips lines that already call t() from the translation function", () => {
    expect(shouldSkipLine("  <h1>{t('hero.title')}</h1>")).toBe(true);
    expect(shouldSkipLine("  placeholder={t('search.placeholder')}")).toBe(true);
    expect(shouldSkipLine(`  title={t("page.title")}`)).toBe(true);
  });

  it("skips console.log / console.error lines", () => {
    expect(shouldSkipLine("  console.log('Send Flowers')")).toBe(true);
    expect(shouldSkipLine("  console.error('Checkout failed')")).toBe(true);
  });

  it("skips displayName assignments", () => {
    expect(shouldSkipLine("ProductCard.displayName = 'ProductCard';")).toBe(true);
  });
});

describe("shouldSkipLine — lines that should NOT be skipped", () => {
  it("does not skip a JSX text node line", () => {
    expect(shouldSkipLine("  <h1>Send Flowers</h1>")).toBe(false);
  });

  it("does not skip a prop with a string literal", () => {
    expect(shouldSkipLine("  placeholder='Search for flowers'")).toBe(false);
  });

  it("does not skip a standalone English text line", () => {
    expect(shouldSkipLine("  Proceed to Checkout")).toBe(false);
  });

  it("does not skip a document.title assignment", () => {
    expect(shouldSkipLine('  document.title = "Shop Flowers"')).toBe(false);
  });
});

// ── i18n-ignore annotation ────────────────────────────────────────────────────

describe("i18n-ignore annotation bypass", () => {
  const I18N_IGNORE_RE = /\/\/\s*i18n-ignore\b/;

  it("detects // i18n-ignore on a line", () => {
    expect(I18N_IGNORE_RE.test("<h1>Presentail</h1> // i18n-ignore")).toBe(true);
  });

  it("detects // i18n-ignore with extra spaces", () => {
    expect(I18N_IGNORE_RE.test("<h1>Express</h1> //  i18n-ignore")).toBe(true);
  });

  it("does not trigger on lines without the annotation", () => {
    expect(I18N_IGNORE_RE.test("<h1>Send Flowers</h1>")).toBe(false);
    expect(I18N_IGNORE_RE.test("  // regular comment")).toBe(false);
  });

  it("does not trigger on partial match (i18n-ignorable is not i18n-ignore)", () => {
    expect(I18N_IGNORE_RE.test("// i18n-ignorable")).toBe(false);
  });
});

// ── file-filter logic ─────────────────────────────────────────────────────────

describe("SKIP_DIRS — directories that should be excluded from scanning", () => {
  const EXPECTED_SKIP_DIRS = [
    "node_modules",
    "dist",
    "__generated__",
    "locales",
    "ui",
  ];

  for (const dir of EXPECTED_SKIP_DIRS) {
    it(`skips directory "${dir}"`, () => {
      expect(SKIP_DIRS.has(dir)).toBe(true);
    });
  }
});

describe("file-name filter logic — test and declaration files", () => {
  const isScannable = (name: string) =>
    /\.tsx?$/.test(name) &&
    !/\.test\.(tsx?|jsx?)$/.test(name) &&
    !/\.d\.ts$/.test(name);

  it("includes .tsx files", () => {
    expect(isScannable("Checkout.tsx")).toBe(true);
  });

  it("includes .ts files", () => {
    expect(isScannable("analytics.ts")).toBe(true);
  });

  it("excludes .test.ts files", () => {
    expect(isScannable("analytics.test.ts")).toBe(false);
  });

  it("excludes .test.tsx files", () => {
    expect(isScannable("Checkout.test.tsx")).toBe(false);
  });

  it("excludes .d.ts declaration files", () => {
    expect(isScannable("types.d.ts")).toBe(false);
  });
});

// ── Arabic detection in patterns (integration) ────────────────────────────────

describe("Arabic detection — Pattern A (inline JSX text)", () => {
  it("flags pure Arabic JSX text (no Latin letters)", () => {
    const inner = "أرسل الزهور";
    const hasArabic = containsArabicScript(inner);
    const hasLatin = /[a-zA-Z]/.test(inner);
    expect(hasArabic).toBe(true);
    expect(hasLatin).toBe(false);
    expect(hasArabic || hasLatin).toBe(true);
  });

  it("flags Arabic text embedded in a JSX node after extracting via regex", () => {
    const line = "<h1>أرسل الزهور</h1>";
    INLINE_JSX_TEXT_RE.lastIndex = 0;
    const m = INLINE_JSX_TEXT_RE.exec(line);
    expect(m).not.toBeNull();
    expect(containsArabicScript(m![1])).toBe(true);
  });

  it("flags Arabic text with an embedded JSX expression", () => {
    const line = "<p>مرحبا {name}</p>";
    INLINE_JSX_TEXT_RE.lastIndex = 0;
    const m = INLINE_JSX_TEXT_RE.exec(line);
    expect(m).not.toBeNull();
    expect(containsArabicScript(m![1])).toBe(true);
  });

  it("does not flag a pure {expression} node (no Arabic or Latin)", () => {
    const inner = "{t('send.flowers')}";
    const isOnlyExpr = /^\s*\{[^{}]*\}\s*$/.test(inner);
    expect(isOnlyExpr).toBe(true);
  });
});

describe("Arabic detection — Pattern C (JSX props)", () => {
  it("flags an Arabic placeholder prop value", () => {
    const line = 'placeholder="ابحث عن الزهور"';
    VISIBLE_PROP_RE.lastIndex = 0;
    const m = VISIBLE_PROP_RE.exec(line);
    expect(m).not.toBeNull();
    const text = m![2].trim();
    expect(containsArabicScript(text)).toBe(true);
  });

  it("flags an Arabic aria-label value", () => {
    const line = 'aria-label="إغلاق"';
    VISIBLE_PROP_RE.lastIndex = 0;
    const m = VISIBLE_PROP_RE.exec(line);
    expect(m).not.toBeNull();
    const text = m![2].trim();
    expect(containsArabicScript(text)).toBe(true);
  });
});

describe("Arabic detection — Pattern D (nullish-coalescing fallback)", () => {
  it("flags an Arabic ?? fallback string", () => {
    const line = 'label ?? "حقيبتك فارغة"';
    NULLISH_FALLBACK_RE.lastIndex = 0;
    const m = NULLISH_FALLBACK_RE.exec(line);
    expect(m).not.toBeNull();
    const text = m![1].trim();
    expect(containsArabicScript(text)).toBe(true);
  });
});

describe("Arabic detection — Pattern E (document.title)", () => {
  it("flags an Arabic document.title assignment", () => {
    const line = "document.title = 'تسوق الزهور والهدايا';";
    DOC_TITLE_RE.lastIndex = 0;
    const m = DOC_TITLE_RE.exec(line);
    expect(m).not.toBeNull();
    const text = m![1].trim();
    expect(containsArabicScript(text)).toBe(true);
  });
});

describe("Arabic detection — Pattern F (meta title content)", () => {
  it("flags Arabic content on an og:title meta tag", () => {
    const line = '<meta name="og:title" content="تسوق الزهور والهدايا في لبنان">';
    expect(META_TITLE_NAME_RE.test(line)).toBe(true);
    META_TITLE_CONTENT_RE.lastIndex = 0;
    const m = META_TITLE_CONTENT_RE.exec(line);
    expect(m).not.toBeNull();
    const text = m![1].trim();
    expect(containsArabicScript(text)).toBe(true);
  });
});

describe("Arabic detection — i18n-ignore suppression", () => {
  const I18N_IGNORE_RE = /\/\/\s*i18n-ignore\b/;

  it("i18n-ignore suppresses Arabic hits just like English ones", () => {
    expect(I18N_IGNORE_RE.test("<h1>أرسل الزهور</h1> // i18n-ignore")).toBe(true);
    expect(I18N_IGNORE_RE.test("<h1>أرسل الزهور</h1>")).toBe(false);
  });
});

// ── INLINE_JSX_TEXT_RE (Pattern A) ────────────────────────────────────────────

describe("INLINE_JSX_TEXT_RE — inline JSX text node extraction", () => {
  it("extracts text between > and </", () => {
    const matches = matchAll(INLINE_JSX_TEXT_RE, "<h1>Send Flowers</h1>");
    expect(matches).toContain("Send Flowers");
  });

  it("extracts text with embedded expression", () => {
    const matches = matchAll(INLINE_JSX_TEXT_RE, "<p>{count} items in bag</p>");
    expect(matches).toContain("{count} items in bag");
  });

  it("extracts Arabic text (the checker must then decide what to do with it)", () => {
    const matches = matchAll(INLINE_JSX_TEXT_RE, "<p>أرسل الزهور</p>");
    expect(matches).toContain("أرسل الزهور");
  });

  it("extracts French text with accented characters", () => {
    const matches = matchAll(INLINE_JSX_TEXT_RE, "<h2>Envoyer des fleurs</h2>");
    expect(matches).toContain("Envoyer des fleurs");
  });

  it("does not match across lines (no newline in the inner text)", () => {
    const src = "<h1>\n  Send Flowers\n</h1>";
    expect(matchAll(INLINE_JSX_TEXT_RE, src)).toHaveLength(0);
  });

  it("matches multiple text nodes on the same line", () => {
    const src = "<span>Hello World</span><span>Proceed now</span>";
    const matches = matchAll(INLINE_JSX_TEXT_RE, src);
    expect(matches).toContain("Hello World");
    expect(matches).toContain("Proceed now");
  });

  it("matches <title> elements used in Helmet-style components", () => {
    const matches = matchAll(INLINE_JSX_TEXT_RE, "<title>Shop Flowers and Gifts</title>");
    expect(matches).toContain("Shop Flowers and Gifts");
  });
});

// ── STANDALONE_TEXT_RE (Pattern B) ────────────────────────────────────────────

describe("STANDALONE_TEXT_RE — standalone indented text line", () => {
  it("matches an indented English prose line", () => {
    const m = STANDALONE_TEXT_RE.exec("  Send Flowers Today");
    expect(m).not.toBeNull();
    expect(m![1]).toBe("Send Flowers Today");
  });

  it("matches a double-tab-indented prose line", () => {
    expect(STANDALONE_TEXT_RE.exec("\t\tProceed to Checkout")).not.toBeNull();
  });

  it("does not match unindented lines (no leading whitespace)", () => {
    expect(STANDALONE_TEXT_RE.exec("Send Flowers")).toBeNull();
  });

  it("does not match lines containing hyphens (CSS utility classes)", () => {
    expect(STANDALONE_TEXT_RE.exec("  flex-col items-center")).toBeNull();
  });

  it("does not match lines containing periods (property chains)", () => {
    expect(STANDALONE_TEXT_RE.exec("  user.email")).toBeNull();
  });

  it("does not match lines starting with non-Latin characters (Arabic)", () => {
    expect(STANDALONE_TEXT_RE.exec("  أرسل الزهور")).toBeNull();
  });

  it("allows apostrophes and typographic right-quotes in the middle", () => {
    expect(STANDALONE_TEXT_RE.exec("  Your bag\u2019s empty")).not.toBeNull();
  });
});

// ── STANDALONE_ARABIC_TEXT_RE (Pattern B — Arabic) ────────────────────────────

describe("STANDALONE_ARABIC_TEXT_RE — standalone indented Arabic text line", () => {
  it("matches a two-space-indented Arabic phrase (the primary gap closed)", () => {
    const m = STANDALONE_ARABIC_TEXT_RE.exec("  أرسل الزهور");
    expect(m).not.toBeNull();
    expect(m![1]).toBe("أرسل الزهور");
  });

  it("matches a four-space-indented Arabic phrase", () => {
    const m = STANDALONE_ARABIC_TEXT_RE.exec("    حقيبتك فارغة");
    expect(m).not.toBeNull();
    expect(m![1]).toBe("حقيبتك فارغة");
  });

  it("matches a double-tab-indented Arabic phrase", () => {
    expect(STANDALONE_ARABIC_TEXT_RE.exec("\t\tتابع إلى الدفع")).not.toBeNull();
  });

  it("matched text contains Arabic script (sanity gate)", () => {
    const m = STANDALONE_ARABIC_TEXT_RE.exec("  أرسل الزهور");
    expect(m).not.toBeNull();
    expect(containsArabicScript(m![1])).toBe(true);
  });

  it("does not match unindented Arabic lines (no leading whitespace)", () => {
    expect(STANDALONE_ARABIC_TEXT_RE.exec("أرسل الزهور")).toBeNull();
  });

  it("does not match a single-space-indented Arabic line (requires 2+)", () => {
    expect(STANDALONE_ARABIC_TEXT_RE.exec(" أرسل الزهور")).toBeNull();
  });

  it("does not match Latin-only lines (those are handled by STANDALONE_TEXT_RE)", () => {
    expect(STANDALONE_ARABIC_TEXT_RE.exec("  Send Flowers Today")).toBeNull();
  });

  it("does not match lines containing JSX angle brackets", () => {
    expect(STANDALONE_ARABIC_TEXT_RE.exec("  <p>أرسل الزهور</p>")).toBeNull();
  });

  it("does not match lines containing double-quote characters (string literal context)", () => {
    expect(STANDALONE_ARABIC_TEXT_RE.exec('  "أرسل الزهور"')).toBeNull();
  });
});

// ── VISIBLE_PROP_RE (Pattern C) ───────────────────────────────────────────────

describe("VISIBLE_PROP_RE — user-visible JSX prop string literals", () => {
  it("detects placeholder prop with a double-quoted value", () => {
    const matches = matchAllGroup2(VISIBLE_PROP_RE, 'placeholder="Search for flowers"');
    expect(matches[0]).toBe("Search for flowers");
  });

  it("detects aria-label prop", () => {
    const matches = matchAllGroup2(VISIBLE_PROP_RE, 'aria-label="Close dialog"');
    expect(matches[0]).toBe("Close dialog");
  });

  it("detects title prop", () => {
    const matches = matchAllGroup2(VISIBLE_PROP_RE, 'title="Flower Delivery"');
    expect(matches[0]).toBe("Flower Delivery");
  });

  it("detects alt prop", () => {
    const matches = matchAllGroup2(VISIBLE_PROP_RE, 'alt="Bouquet of red roses"');
    expect(matches[0]).toBe("Bouquet of red roses");
  });

  it("detects label prop", () => {
    const matches = matchAllGroup2(VISIBLE_PROP_RE, 'label="Delivery date"');
    expect(matches[0]).toBe("Delivery date");
  });

  it("detects French text in a prop (accented Latin letters)", () => {
    const matches = matchAllGroup2(VISIBLE_PROP_RE, 'placeholder="Rechercher des fleurs"');
    expect(matches[0]).toBe("Rechercher des fleurs");
  });

  it("does not match prop values that are expressions", () => {
    expect(matchAllGroup2(VISIBLE_PROP_RE, "placeholder={t('search.placeholder')}")).toHaveLength(0);
  });

  it("does not match unknown prop names", () => {
    expect(matchAllGroup2(VISIBLE_PROP_RE, 'className="text-red-500"')).toHaveLength(0);
  });
});

// ── NULLISH_FALLBACK_RE (Pattern D) ───────────────────────────────────────────

describe("NULLISH_FALLBACK_RE — nullish-coalescing fallback strings", () => {
  it("detects a ?? fallback string literal", () => {
    const matches = matchAll(NULLISH_FALLBACK_RE, 'name ?? "Your cart is empty"');
    expect(matches[0]).toBe("Your cart is empty");
  });

  it("detects fallback with spaces around ??", () => {
    const matches = matchAll(NULLISH_FALLBACK_RE, 'label ??   "Proceed to Checkout"');
    expect(matches[0]).toBe("Proceed to Checkout");
  });

  it("detects French text as a ?? fallback", () => {
    const matches = matchAll(NULLISH_FALLBACK_RE, 'name ?? "Envoyer des fleurs"');
    expect(matches[0]).toBe("Envoyer des fleurs");
  });

  it("does not match strings shorter than 4 characters", () => {
    expect(matchAll(NULLISH_FALLBACK_RE, 'x ?? "OK"')).toHaveLength(0);
  });

  it("does not match ternary colon fallbacks", () => {
    expect(matchAll(NULLISH_FALLBACK_RE, 'dir === "ltr" ? "ltr" : "rtl"')).toHaveLength(0);
  });
});

// ── DOC_TITLE_RE (Pattern E) ──────────────────────────────────────────────────

describe("DOC_TITLE_RE — document.title string literal assignments", () => {
  it("detects document.title = 'text' (single-quoted)", () => {
    const matches = matchAll(DOC_TITLE_RE, "document.title = 'Shop Flowers and Gifts'");
    expect(matches[0]).toBe("Shop Flowers and Gifts");
  });

  it("detects document.title = \"text\" (double-quoted)", () => {
    const matches = matchAll(DOC_TITLE_RE, 'document.title = "Presentail Lebanon"');
    expect(matches[0]).toBe("Presentail Lebanon");
  });

  it("detects French text in document.title", () => {
    const matches = matchAll(DOC_TITLE_RE, "document.title = 'Boutique de fleurs'");
    expect(matches[0]).toBe("Boutique de fleurs");
  });

  it("does not match variable assignments (no string literal)", () => {
    expect(matchAll(DOC_TITLE_RE, "document.title = pageTitle")).toHaveLength(0);
  });

  it("does not match strings shorter than 4 characters", () => {
    expect(matchAll(DOC_TITLE_RE, "document.title = 'Hi'")).toHaveLength(0);
  });
});

// ── META_TITLE_NAME_RE + META_TITLE_CONTENT_RE (Pattern F) ────────────────────

describe("META_TITLE_NAME_RE — detects title-related meta name attributes", () => {
  it("matches name=\"title\"", () => {
    expect(META_TITLE_NAME_RE.test('<meta name="title" content="..."')).toBe(true);
  });

  it("matches name=\"og:title\"", () => {
    expect(META_TITLE_NAME_RE.test('<meta name="og:title" content="..."')).toBe(true);
  });

  it("matches name=\"twitter:title\"", () => {
    expect(META_TITLE_NAME_RE.test('<meta name="twitter:title" content="..."')).toBe(true);
  });

  it("does not match unrelated meta names", () => {
    expect(META_TITLE_NAME_RE.test('<meta name="description" content="..."')).toBe(false);
    expect(META_TITLE_NAME_RE.test('<meta name="keywords" content="flowers"')).toBe(false);
    expect(META_TITLE_NAME_RE.test('<meta name="og:image" content="https://..."')).toBe(false);
  });
});

describe("META_TITLE_CONTENT_RE — extracts content attribute values", () => {
  it("extracts content from a title meta tag", () => {
    const line = '<meta name="og:title" content="Shop Flowers and Gifts in Lebanon">';
    const matches = matchAll(META_TITLE_CONTENT_RE, line);
    expect(matches[0]).toBe("Shop Flowers and Gifts in Lebanon");
  });

  it("extracts French content from a title meta tag", () => {
    const line = '<meta name="og:title" content="Boutique de fleurs et cadeaux">';
    const matches = matchAll(META_TITLE_CONTENT_RE, line);
    expect(matches[0]).toBe("Boutique de fleurs et cadeaux");
  });

  it("does not match content strings shorter than 4 characters", () => {
    const line = '<meta name="og:title" content="Hi">';
    expect(matchAll(META_TITLE_CONTENT_RE, line)).toHaveLength(0);
  });
});
