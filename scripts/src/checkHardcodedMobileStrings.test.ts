/**
 * Unit tests for checkHardcodedMobileStrings.ts.
 *
 * Covers:
 *   - stripExpressionsAndTrim  — removes {JSX expressions} and collapses whitespace
 *   - looksLikeEnglishProse    — Arabic-character detection, French-pattern handling,
 *                                URL/email exclusions, word-count thresholds
 *   - shouldSkipLine           — comment lines, import/export, t.key usage,
 *                                console.log, displayName
 *   - i18n-ignore annotation   — the bypass pattern used in the main loop
 *   - file-filter logic        — SKIP_DIRS set, SKIP_FILE_SUFFIXES list,
 *                                test/declaration file exclusions
 *   - regex patterns           — INLINE_JSX_TEXT_RE, STANDALONE_TEXT_RE,
 *                                VISIBLE_PROP_RE, NULLISH_FALLBACK_RE, NAV_OPTION_RE
 */

import { describe, it, expect } from "vitest";
import {
  stripExpressionsAndTrim,
  looksLikeEnglishProse,
  containsArabicScript,
  shouldSkipLine,
  SKIP_DIRS,
  SKIP_FILE_SUFFIXES,
  INLINE_JSX_TEXT_RE,
  STANDALONE_TEXT_RE,
  STANDALONE_ARABIC_TEXT_RE,
  VISIBLE_PROP_RE,
  NULLISH_FALLBACK_RE,
  NAV_OPTION_RE,
} from "./checkHardcodedMobileStrings.js";

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

  it("returns true for a single word of 5+ letters (Loading, Delete, etc.)", () => {
    expect(looksLikeEnglishProse("Loading")).toBe(true);
    expect(looksLikeEnglishProse("Copied")).toBe(true);
    expect(looksLikeEnglishProse("Delete")).toBe(true);
  });

  it("returns true for French accented text (Latin letters are present)", () => {
    // French text also uses Latin letters — the checker intentionally flags it
    // so hardcoded French strings don't slip through.
    expect(looksLikeEnglishProse("Envoyer des fleurs")).toBe(true);
    expect(looksLikeEnglishProse("Continuer vers le paiement")).toBe(true);
  });

  it("returns true for French text with accented characters mixed in", () => {
    expect(looksLikeEnglishProse("Votre panier est vide")).toBe(true);
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

  it("returns false for a string of Arabic characters at Unicode boundary U+0600", () => {
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
    expect(looksLikeEnglishProse("support@presentail.com")).toBe(false);
  });

  it("returns false for a single word shorter than 5 letters", () => {
    expect(looksLikeEnglishProse("OK")).toBe(false);
    expect(looksLikeEnglishProse("Hi")).toBe(false);
    expect(looksLikeEnglishProse("No")).toBe(false);
  });

  it("returns false for a pure JSX expression (no remaining text)", () => {
    expect(looksLikeEnglishProse("{t.someKey}")).toBe(false);
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
    expect(shouldSkipLine("  * @param text - the text to display")).toBe(true);
    expect(shouldSkipLine("   * Returns the label")).toBe(true);
  });

  it("skips block-comment opening lines (/*)", () => {
    expect(shouldSkipLine("  /* block comment")).toBe(true);
  });

  it("skips import statements", () => {
    expect(shouldSkipLine("import React from 'react';")).toBe(true);
    expect(shouldSkipLine("import { useT } from '../lib/translations';")).toBe(true);
  });

  it("skips export type / export interface declarations", () => {
    expect(shouldSkipLine("export type ButtonVariant = 'primary' | 'secondary';")).toBe(true);
    expect(shouldSkipLine("export interface CartItem { id: string }")).toBe(true);
  });

  it("skips type alias declarations", () => {
    expect(shouldSkipLine("type HitKind = 'jsx-text' | 'jsx-prop';")).toBe(true);
  });

  it("skips interface declarations", () => {
    expect(shouldSkipLine("interface ProductCardProps {")).toBe(true);
  });

  it("skips lines that already use t.<key> from useT()", () => {
    expect(shouldSkipLine("  <Text>{t.sendFlowers}</Text>")).toBe(true);
    expect(shouldSkipLine("  placeholder={t.searchPlaceholder}")).toBe(true);
    expect(shouldSkipLine("  title={t.pageTitle}")).toBe(true);
  });

  it("skips console.log / console.error lines", () => {
    expect(shouldSkipLine("  console.log('Send Flowers')")).toBe(true);
    expect(shouldSkipLine("  console.error('Failed to load')")).toBe(true);
    expect(shouldSkipLine("  console.warn('Proceed to Checkout')")).toBe(true);
  });

  it("skips displayName assignments", () => {
    expect(shouldSkipLine("ProductCard.displayName = 'ProductCard';")).toBe(true);
  });
});

describe("shouldSkipLine — lines that should NOT be skipped", () => {
  it("does not skip a JSX text node line", () => {
    expect(shouldSkipLine("  <Text>Send Flowers</Text>")).toBe(false);
  });

  it("does not skip a prop with a string literal", () => {
    expect(shouldSkipLine("  placeholder='Search for flowers'")).toBe(false);
  });

  it("does not skip a standalone English text line", () => {
    expect(shouldSkipLine("  Proceed to Checkout")).toBe(false);
  });

  it("does not skip a nav option string", () => {
    expect(shouldSkipLine("  title: 'My Orders',")).toBe(false);
  });
});

// ── i18n-ignore annotation ────────────────────────────────────────────────────

describe("i18n-ignore annotation bypass", () => {
  const I18N_IGNORE_RE = /\/\/\s*i18n-ignore\b|\/\*\s*i18n-ignore\b/;

  it("detects // i18n-ignore on a line", () => {
    expect(I18N_IGNORE_RE.test("<Text>Presentail</Text> // i18n-ignore")).toBe(true);
  });

  it("detects // i18n-ignore with extra spaces", () => {
    expect(I18N_IGNORE_RE.test("<Text>Express</Text> //  i18n-ignore")).toBe(true);
  });

  it("detects /* i18n-ignore */ inline block comment", () => {
    expect(I18N_IGNORE_RE.test('<Text>Brand Name</Text> /* i18n-ignore */')).toBe(true);
  });

  it("does not trigger on lines without the annotation", () => {
    expect(I18N_IGNORE_RE.test("<Text>Send Flowers</Text>")).toBe(false);
    expect(I18N_IGNORE_RE.test("  // regular comment")).toBe(false);
  });

  it("does not trigger on a partial match (i18n-ignorable is not i18n-ignore)", () => {
    expect(I18N_IGNORE_RE.test("// i18n-ignorable")).toBe(false);
  });
});

// ── file-filter logic ─────────────────────────────────────────────────────────

describe("SKIP_DIRS — directories that should be excluded from scanning", () => {
  const EXPECTED_SKIP_DIRS = [
    "node_modules",
    ".expo",
    "dist",
    "e2e",
    "assets",
    "__generated__",
  ];

  for (const dir of EXPECTED_SKIP_DIRS) {
    it(`skips directory "${dir}"`, () => {
      expect(SKIP_DIRS.has(dir)).toBe(true);
    });
  }
});

describe("SKIP_FILE_SUFFIXES — individual files excluded from scanning", () => {
  it("skips the translations catalogue file", () => {
    expect(
      SKIP_FILE_SUFFIXES.some((s) => s.endsWith("lib/translations.ts")),
    ).toBe(true);
  });

  it("skips SVG brand mark files (payment logos)", () => {
    const hasSvgExclusion = SKIP_FILE_SUFFIXES.some(
      (s) => s.includes("paymentLogos"),
    );
    expect(hasSvgExclusion).toBe(true);
  });
});

describe("file-name filter logic — test and declaration files", () => {
  const isScannable = (name: string) =>
    /\.tsx?$/.test(name) &&
    !/\.test\.(tsx?|jsx?)$/.test(name) &&
    !/\.d\.ts$/.test(name);

  it("includes .tsx files", () => {
    expect(isScannable("ProductCard.tsx")).toBe(true);
  });

  it("includes .ts files", () => {
    expect(isScannable("useCart.ts")).toBe(true);
  });

  it("excludes .test.ts files", () => {
    expect(isScannable("useCart.test.ts")).toBe(false);
  });

  it("excludes .test.tsx files", () => {
    expect(isScannable("ProductCard.test.tsx")).toBe(false);
  });

  it("excludes .d.ts declaration files", () => {
    expect(isScannable("types.d.ts")).toBe(false);
  });

  it("excludes .test.jsx files", () => {
    expect(isScannable("Component.test.jsx")).toBe(false);
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
    const line = "<Text>أرسل الزهور</Text>";
    INLINE_JSX_TEXT_RE.lastIndex = 0;
    const m = INLINE_JSX_TEXT_RE.exec(line);
    expect(m).not.toBeNull();
    expect(containsArabicScript(m![1])).toBe(true);
  });

  it("flags Arabic text with an embedded JSX expression", () => {
    const line = "<Text>مرحبا {name}</Text>";
    INLINE_JSX_TEXT_RE.lastIndex = 0;
    const m = INLINE_JSX_TEXT_RE.exec(line);
    expect(m).not.toBeNull();
    expect(containsArabicScript(m![1])).toBe(true);
  });

  it("does not flag a pure {expression} node (no Arabic or Latin)", () => {
    const inner = "{t.sendFlowers}";
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

  it("flags an Arabic accessibilityLabel value", () => {
    const line = 'accessibilityLabel="إغلاق"';
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

describe("Arabic detection — Pattern E (nav options)", () => {
  it("flags an Arabic nav title option", () => {
    const line = "title: 'طلباتي'";
    NAV_OPTION_RE.lastIndex = 0;
    const m = NAV_OPTION_RE.exec(line);
    expect(m).not.toBeNull();
    const text = m![2].trim();
    expect(containsArabicScript(text)).toBe(true);
  });
});

describe("Arabic detection — i18n-ignore suppression", () => {
  const I18N_IGNORE_RE = /\/\/\s*i18n-ignore\b|\/\*\s*i18n-ignore\b/;

  it("i18n-ignore suppresses Arabic hits just like English ones", () => {
    expect(I18N_IGNORE_RE.test("<Text>أرسل الزهور</Text> // i18n-ignore")).toBe(true);
    expect(I18N_IGNORE_RE.test("<Text>أرسل الزهور</Text>")).toBe(false);
  });
});

// ── INLINE_JSX_TEXT_RE (Pattern A) ────────────────────────────────────────────

describe("INLINE_JSX_TEXT_RE — inline JSX text node extraction", () => {
  it("extracts text between > and </", () => {
    const matches = matchAll(INLINE_JSX_TEXT_RE, "<Text>Send Flowers</Text>");
    expect(matches).toContain("Send Flowers");
  });

  it("extracts text with embedded expression", () => {
    const matches = matchAll(INLINE_JSX_TEXT_RE, "<Text>{count} items in bag</Text>");
    expect(matches).toContain("{count} items in bag");
  });

  it("extracts Arabic text (the checker must then decide what to do with it)", () => {
    const matches = matchAll(INLINE_JSX_TEXT_RE, "<Text>أرسل الزهور</Text>");
    expect(matches).toContain("أرسل الزهور");
  });

  it("extracts French text with accented characters", () => {
    const matches = matchAll(INLINE_JSX_TEXT_RE, "<Text>Envoyer des fleurs</Text>");
    expect(matches).toContain("Envoyer des fleurs");
  });

  it("does not match across lines (no newline in the inner text)", () => {
    const src = "<Text>\n  Send Flowers\n</Text>";
    const matches = matchAll(INLINE_JSX_TEXT_RE, src);
    expect(matches).toHaveLength(0);
  });

  it("matches multiple text nodes on the same line", () => {
    const src = "<A>Hello World</A><B>Proceed now</B>";
    const matches = matchAll(INLINE_JSX_TEXT_RE, src);
    expect(matches).toContain("Hello World");
    expect(matches).toContain("Proceed now");
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
    const m = STANDALONE_TEXT_RE.exec("\t\tProceed to Checkout");
    expect(m).not.toBeNull();
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

  it("does not match lines containing question marks (optional chaining)", () => {
    expect(STANDALONE_TEXT_RE.exec("  data?.items")).toBeNull();
  });

  it("does not match lines starting with non-Latin characters (Arabic)", () => {
    expect(STANDALONE_TEXT_RE.exec("  أرسل الزهور")).toBeNull();
  });

  it("allows apostrophes and typographic right-quotes in the middle", () => {
    const m = STANDALONE_TEXT_RE.exec("  Your bag\u2019s empty");
    expect(m).not.toBeNull();
  });

  it("allows en-dash and em-dash in the middle", () => {
    const m = STANDALONE_TEXT_RE.exec("  Order \u2013 confirmed");
    expect(m).not.toBeNull();
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
    expect(STANDALONE_ARABIC_TEXT_RE.exec("  <Text>أرسل الزهور</Text>")).toBeNull();
  });

  it("does not match lines containing double-quote characters (string literal context)", () => {
    expect(STANDALONE_ARABIC_TEXT_RE.exec('  "أرسل الزهور"')).toBeNull();
  });
});

// ── VISIBLE_PROP_RE (Pattern C) ───────────────────────────────────────────────

describe("VISIBLE_PROP_RE — user-visible JSX prop string literals", () => {
  it("detects placeholder prop with a double-quoted value", () => {
    const matches = matchAllGroup2(
      VISIBLE_PROP_RE,
      'placeholder="Search for flowers"',
    );
    expect(matches[0]).toBe("Search for flowers");
  });

  it("detects accessibilityLabel prop", () => {
    const matches = matchAllGroup2(
      VISIBLE_PROP_RE,
      'accessibilityLabel="Close button"',
    );
    expect(matches[0]).toBe("Close button");
  });

  it("detects accessibilityHint prop", () => {
    const matches = matchAllGroup2(
      VISIBLE_PROP_RE,
      'accessibilityHint="Opens the cart drawer"',
    );
    expect(matches[0]).toBe("Opens the cart drawer");
  });

  it("detects title prop", () => {
    const matches = matchAllGroup2(VISIBLE_PROP_RE, 'title="My Orders"');
    expect(matches[0]).toBe("My Orders");
  });

  it("detects label prop", () => {
    const matches = matchAllGroup2(VISIBLE_PROP_RE, 'label="Delivery date"');
    expect(matches[0]).toBe("Delivery date");
  });

  it("detects description prop", () => {
    const matches = matchAllGroup2(VISIBLE_PROP_RE, 'description="Choose a date and time slot"');
    expect(matches[0]).toBe("Choose a date and time slot");
  });

  it("detects French text in a prop (accented Latin letters)", () => {
    const matches = matchAllGroup2(VISIBLE_PROP_RE, 'placeholder="Rechercher des fleurs"');
    expect(matches[0]).toBe("Rechercher des fleurs");
  });

  it("does not match props whose values are expressions (not string literals)", () => {
    const matches = matchAllGroup2(VISIBLE_PROP_RE, "placeholder={t.searchPlaceholder}");
    expect(matches).toHaveLength(0);
  });

  it("does not match unknown prop names", () => {
    const matches = matchAllGroup2(VISIBLE_PROP_RE, 'style="color: red"');
    expect(matches).toHaveLength(0);
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
    const matches = matchAll(NULLISH_FALLBACK_RE, 'x ?? "OK"');
    expect(matches).toHaveLength(0);
  });

  it("does not match ternary colon fallbacks (only ?? is targeted)", () => {
    const matches = matchAll(NULLISH_FALLBACK_RE, 'dir === "ltr" ? "ltr" : "rtl"');
    expect(matches).toHaveLength(0);
  });
});

// ── NAV_OPTION_RE (Pattern E) ─────────────────────────────────────────────────

describe("NAV_OPTION_RE — Expo Router navigation option strings", () => {
  it("detects title: 'string' (object property syntax)", () => {
    const matches = matchAllGroup2(NAV_OPTION_RE, "title: 'My Orders'");
    expect(matches[0]).toBe("My Orders");
  });

  it("detects title: \"string\" (double-quoted)", () => {
    const matches = matchAllGroup2(NAV_OPTION_RE, 'title: "Track Order"');
    expect(matches[0]).toBe("Track Order");
  });

  it("detects tabBarLabel", () => {
    const matches = matchAllGroup2(NAV_OPTION_RE, 'tabBarLabel: "Shop Now"');
    expect(matches[0]).toBe("Shop Now");
  });

  it("detects headerTitle", () => {
    const matches = matchAllGroup2(NAV_OPTION_RE, 'headerTitle: "Checkout"');
    expect(matches[0]).toBe("Checkout");
  });

  it("detects headerBackTitle", () => {
    const matches = matchAllGroup2(NAV_OPTION_RE, 'headerBackTitle: "Back"');
    expect(matches[0]).toBe("Back");
  });

  it("detects tabBarAccessibilityLabel", () => {
    const matches = matchAllGroup2(
      NAV_OPTION_RE,
      'tabBarAccessibilityLabel: "Navigate to home"',
    );
    expect(matches[0]).toBe("Navigate to home");
  });

  it("detects French navigation option string", () => {
    const matches = matchAllGroup2(NAV_OPTION_RE, "title: 'Mes commandes'");
    expect(matches[0]).toBe("Mes commandes");
  });

  it("does not match prop-style (=) assignments — those are caught by Pattern C", () => {
    const matches = matchAllGroup2(NAV_OPTION_RE, 'title="My Orders"');
    expect(matches).toHaveLength(0);
  });

  it("does not match unknown navigation option keys", () => {
    const matches = matchAllGroup2(NAV_OPTION_RE, 'tabBarIcon: "icon"');
    expect(matches).toHaveLength(0);
  });
});
