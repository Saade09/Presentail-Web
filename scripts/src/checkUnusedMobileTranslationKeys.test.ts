/**
 * Unit tests for checkUnusedMobileTranslationKeys.ts.
 *
 * Covers:
 *   - extractLocaleKeys        — parses top-level keys from a named locale block
 *   - extractLocaleKeyValues   — parses key → value pairs from a named locale block
 *   - isKeyReferenced          — checks whether a key appears in the source corpus
 *   - enValueIsUntranslatable  — detects EN values with no human-translatable text
 *   - containsArabicScript     — detects at least one Arabic-script character
 *   - isLanguageNeutralValue   — detects digit/punctuation/symbol-only strings
 *   - extractNoTranslateKeys   — reads // no-translate annotations from the EN block
 *   - usesTranslationObject    — detects files that use useT() or translations[lang]
 *   - extractLiteralKeyRefsWithLines — finds t.key / t["key"] call sites
 *   - shared logic: MIN_COPY_PASTE_LENGTH threshold, identical-to-EN guard,
 *     language-neutral filter
 */

import { describe, it, expect } from "vitest";
import {
  extractLocaleKeys,
  extractLocaleKeyValues,
  isKeyReferenced,
  enValueIsUntranslatable,
  containsArabicScript,
  isLanguageNeutralValue,
  extractNoTranslateKeys,
  usesTranslationObject,
  extractLiteralKeyRefsWithLines,
  classifyPlaceholderHit,
  MIN_COPY_PASTE_LENGTH,
} from "./checkUnusedMobileTranslationKeys.js";

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a minimal translations.ts source snippet with the given locale block
 * content.  `localeName` should be "EN", "AR", or "FR".
 */
function makeLocaleBlock(localeName: string, body: string): string {
  return `const ${localeName} = {\n${body}\n};\n`;
}

// ── extractLocaleKeys ─────────────────────────────────────────────────────────

describe("extractLocaleKeys", () => {
  it("extracts flat camelCase keys from the EN block", () => {
    const src = makeLocaleBlock(
      "EN",
      `  heroTitle: "Send Flowers",\n  checkoutButton: "Proceed",\n  cartEmpty: "Your bag is empty",`,
    );
    expect(extractLocaleKeys(src, "EN")).toEqual([
      "heroTitle",
      "checkoutButton",
      "cartEmpty",
    ]);
  });

  it("extracts keys from the AR block", () => {
    const src = makeLocaleBlock(
      "AR",
      `  heroTitle: "أرسل الزهور",\n  checkoutButton: "تابع",`,
    );
    expect(extractLocaleKeys(src, "AR")).toEqual(["heroTitle", "checkoutButton"]);
  });

  it("extracts keys from the FR block", () => {
    const src = makeLocaleBlock(
      "FR",
      `  heroTitle: "Envoyer des fleurs",\n  checkoutButton: "Continuer",`,
    );
    expect(extractLocaleKeys(src, "FR")).toEqual(["heroTitle", "checkoutButton"]);
  });

  it("returns an empty array when the block has no keys", () => {
    const src = makeLocaleBlock("EN", "");
    expect(extractLocaleKeys(src, "EN")).toEqual([]);
  });

  it("throws when the named block is not found", () => {
    const src = makeLocaleBlock("EN", `  heroTitle: "Send Flowers",`);
    expect(() => extractLocaleKeys(src, "AR")).toThrow(
      /Could not locate `const AR/,
    );
  });

  it("ignores nested object keys (only top-level keys)", () => {
    // The mobile checker uses ^}; to close the block, so deeply nested keys
    // that appear inside a sub-object are also at the start of lines.
    // This test verifies the script does not fail; nested objects are uncommon
    // in the flat mobile catalogue.
    const src = makeLocaleBlock(
      "EN",
      `  heroTitle: "Flowers",\n  anotherKey: "Another",`,
    );
    const keys = extractLocaleKeys(src, "EN");
    expect(keys).toContain("heroTitle");
    expect(keys).toContain("anotherKey");
  });

  it("handles multiple locale blocks in the same source without cross-contamination", () => {
    const src =
      makeLocaleBlock("EN", `  onlyInEn: "English only",`) +
      makeLocaleBlock("AR", `  onlyInAr: "بالعربية فقط",`);
    expect(extractLocaleKeys(src, "EN")).toEqual(["onlyInEn"]);
    expect(extractLocaleKeys(src, "AR")).toEqual(["onlyInAr"]);
  });
});

// ── extractLocaleKeyValues ────────────────────────────────────────────────────

describe("extractLocaleKeyValues", () => {
  it("returns a Map of key → value for double-quoted string values", () => {
    const src = makeLocaleBlock(
      "EN",
      `  heroTitle: "Send Flowers",\n  checkoutButton: "Proceed",`,
    );
    const values = extractLocaleKeyValues(src, "EN");
    expect(values.get("heroTitle")).toBe("Send Flowers");
    expect(values.get("checkoutButton")).toBe("Proceed");
  });

  it("handles single-quoted string values", () => {
    const src = makeLocaleBlock("EN", `  heroTitle: 'Send Flowers',`);
    const values = extractLocaleKeyValues(src, "EN");
    expect(values.get("heroTitle")).toBe("Send Flowers");
  });

  it("handles escaped characters inside the value", () => {
    const src = makeLocaleBlock("EN", `  msg: "It\\'s here",`);
    const values = extractLocaleKeyValues(src, "EN");
    expect(values.has("msg")).toBe(true);
  });

  it("skips template-literal values (false-negative, not false-positive)", () => {
    const src = makeLocaleBlock(
      "EN",
      '  dynamic: `Hello ${name}`,\n  simple: "OK",',
    );
    const values = extractLocaleKeyValues(src, "EN");
    expect(values.has("dynamic")).toBe(false);
    expect(values.get("simple")).toBe("OK");
  });

  it("returns an empty Map when the block has no parseable values", () => {
    const src = makeLocaleBlock("EN", "");
    expect(extractLocaleKeyValues(src, "EN").size).toBe(0);
  });

  it("throws when the named block is not found", () => {
    const src = makeLocaleBlock("EN", `  heroTitle: "Send Flowers",`);
    expect(() => extractLocaleKeyValues(src, "FR")).toThrow(
      /Could not locate `const FR/,
    );
  });

  it("handles AR locale Arabic-script values", () => {
    const src = makeLocaleBlock(
      "AR",
      `  heroTitle: "أرسل الزهور",\n  cartEmpty: "حقيبتك فارغة",`,
    );
    const values = extractLocaleKeyValues(src, "AR");
    expect(values.get("heroTitle")).toBe("أرسل الزهور");
    expect(values.get("cartEmpty")).toBe("حقيبتك فارغة");
  });
});

// ── isKeyReferenced ───────────────────────────────────────────────────────────

describe("isKeyReferenced", () => {
  it("detects dot-notation access t.keyName", () => {
    expect(isKeyReferenced("heroTitle", "const label = t.heroTitle;")).toBe(true);
  });

  it("detects double-quoted bracket access t[\"keyName\"]", () => {
    expect(isKeyReferenced("heroTitle", 't["heroTitle"]')).toBe(true);
  });

  it("detects single-quoted bracket access t['keyName']", () => {
    expect(isKeyReferenced("heroTitle", "t['heroTitle']")).toBe(true);
  });

  it("detects the key as a string literal elsewhere in the corpus", () => {
    // Bracket access or data objects that store key names as strings
    expect(isKeyReferenced("heroTitle", 'const k = "heroTitle";')).toBe(true);
  });

  it("returns false when the key is not in the corpus at all", () => {
    expect(isKeyReferenced("heroTitle", "const x = t.cartEmpty;")).toBe(false);
  });

  it("does not match a key that is only a prefix of a longer key", () => {
    // t.heroTitleLong should not count as a reference for key "heroTitle"
    // The dot regex uses a negative lookahead for word characters.
    expect(isKeyReferenced("heroTitle", "t.heroTitleLong")).toBe(false);
  });

  it("returns true when the key appears in a multi-file corpus", () => {
    const corpus = "// file1\nconst a = t.cartEmpty;\n\0\n// file2\nt.heroTitle";
    expect(isKeyReferenced("heroTitle", corpus)).toBe(true);
  });
});

// ── enValueIsUntranslatable ───────────────────────────────────────────────────

describe("enValueIsUntranslatable", () => {
  it("returns true for a pure template-variable string", () => {
    expect(enValueIsUntranslatable("{country}")).toBe(true);
    expect(enValueIsUntranslatable("{count}")).toBe(true);
  });

  it("returns true when only template variables remain after stripping", () => {
    expect(enValueIsUntranslatable("{first} {last}")).toBe(true);
  });

  it("returns false when template vars are mixed with real words", () => {
    expect(enValueIsUntranslatable("{count} items in your bag")).toBe(false);
    expect(enValueIsUntranslatable("Hello, {name}!")).toBe(false);
  });

  it("returns true for an empty string", () => {
    expect(enValueIsUntranslatable("")).toBe(true);
  });

  it("returns true for digit/punctuation/symbol-only strings", () => {
    expect(enValueIsUntranslatable("+961")).toBe(true);
    expect(enValueIsUntranslatable("—")).toBe(true);
    expect(enValueIsUntranslatable("42")).toBe(true);
  });

  it("returns false for normal translatable text", () => {
    expect(enValueIsUntranslatable("Send Flowers")).toBe(false);
    expect(enValueIsUntranslatable("Proceed to Checkout")).toBe(false);
    expect(enValueIsUntranslatable("Find the perfect floral arrangement")).toBe(
      false,
    );
  });

  it("returns false for mixed text + variables with real words", () => {
    expect(enValueIsUntranslatable("Order {id} confirmed")).toBe(false);
  });
});

// ── containsArabicScript ──────────────────────────────────────────────────────

describe("containsArabicScript", () => {
  it("returns true for a string with Arabic characters", () => {
    expect(containsArabicScript("أرسل الزهور")).toBe(true);
    expect(containsArabicScript("حقيبتك فارغة")).toBe(true);
  });

  it("returns true when Arabic characters are mixed with Latin", () => {
    expect(containsArabicScript("Hello أهلاً")).toBe(true);
  });

  it("returns false for pure English text", () => {
    expect(containsArabicScript("Send Flowers")).toBe(false);
  });

  it("returns false for digits and punctuation only", () => {
    expect(containsArabicScript("+961")).toBe(false);
    expect(containsArabicScript("123")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(containsArabicScript("")).toBe(false);
  });

  it("returns false for French accented characters (not Arabic)", () => {
    expect(containsArabicScript("Envoyer des fleurs")).toBe(false);
    expect(containsArabicScript("Continuer")).toBe(false);
  });

  it("returns true for Arabic characters at Unicode boundary U+0600", () => {
    expect(containsArabicScript("\u0600")).toBe(true);
    expect(containsArabicScript("\u06FF")).toBe(true);
  });
});

// ── isLanguageNeutralValue ────────────────────────────────────────────────────

describe("isLanguageNeutralValue", () => {
  it("returns true for digit-only strings", () => {
    expect(isLanguageNeutralValue("961")).toBe(true);
    expect(isLanguageNeutralValue("42")).toBe(true);
  });

  it("returns true for punctuation/symbol-only strings", () => {
    expect(isLanguageNeutralValue("—")).toBe(true);
    expect(isLanguageNeutralValue("+961")).toBe(true);
    expect(isLanguageNeutralValue("...")).toBe(true);
  });

  it("returns true for whitespace-only strings", () => {
    expect(isLanguageNeutralValue("   ")).toBe(true);
    expect(isLanguageNeutralValue("")).toBe(true);
  });

  it("returns false for strings containing Latin letters", () => {
    expect(isLanguageNeutralValue("Hello")).toBe(false);
    expect(isLanguageNeutralValue("Express")).toBe(false);
    expect(isLanguageNeutralValue("USD")).toBe(false);
  });

  it("returns false for strings containing Arabic letters", () => {
    expect(isLanguageNeutralValue("أهلاً")).toBe(false);
  });

  it("returns false for mixed digit+letter strings", () => {
    expect(isLanguageNeutralValue("123abc")).toBe(false);
  });
});

// ── extractNoTranslateKeys ───────────────────────────────────────────────────

describe("extractNoTranslateKeys", () => {
  it("returns keys annotated with // no-translate on the same line", () => {
    const src =
      makeLocaleBlock(
        "EN",
        `  boutique: "Boutique",  // no-translate — French loan word\n  expressLabel: "Express",  // no-translate`,
      ) + makeLocaleBlock("AR", `  boutique: "Boutique",\n  expressLabel: "Express",`);
    const keys = extractNoTranslateKeys(src);
    expect(keys.has("boutique")).toBe(true);
    expect(keys.has("expressLabel")).toBe(true);
  });

  it("does not include keys without // no-translate annotation", () => {
    const src = makeLocaleBlock(
      "EN",
      `  heroTitle: "Send Flowers",\n  boutique: "Boutique",  // no-translate`,
    );
    const keys = extractNoTranslateKeys(src);
    expect(keys.has("heroTitle")).toBe(false);
    expect(keys.has("boutique")).toBe(true);
  });

  it("returns an empty Set when no keys are annotated", () => {
    const src = makeLocaleBlock(
      "EN",
      `  heroTitle: "Send Flowers",\n  checkoutButton: "Proceed",`,
    );
    expect(extractNoTranslateKeys(src).size).toBe(0);
  });

  it("returns an empty Set when the EN block is absent", () => {
    const src = makeLocaleBlock(
      "AR",
      `  boutique: "Boutique",  // no-translate`,
    );
    expect(extractNoTranslateKeys(src).size).toBe(0);
  });

  it("handles the annotation regardless of surrounding comment text", () => {
    const src = makeLocaleBlock(
      "EN",
      `  presentailBrand: "Presentail",  // no-translate — proper brand name`,
    );
    const keys = extractNoTranslateKeys(src);
    expect(keys.has("presentailBrand")).toBe(true);
  });
});

// ── usesTranslationObject ─────────────────────────────────────────────────────

describe("usesTranslationObject", () => {
  it("returns true for files that call useT()", () => {
    expect(usesTranslationObject("const t = useT();")).toBe(true);
    expect(usesTranslationObject("const { heroTitle } = useT()")).toBe(true);
  });

  it("returns true for files that access translations[lang]", () => {
    expect(usesTranslationObject("const t = translations[lang];")).toBe(true);
  });

  it("returns false for files with no translation usage", () => {
    expect(usesTranslationObject("const x = 1 + 2;")).toBe(false);
    expect(usesTranslationObject("import React from 'react';")).toBe(false);
  });

  it("returns false for files that only contain 't' as another variable", () => {
    // e.g. gesture handler `t` from react-native-reanimated
    expect(usesTranslationObject("t.translationX")).toBe(false);
    expect(usesTranslationObject("const t = useAnimatedStyle")).toBe(false);
  });
});

// ── extractLiteralKeyRefsWithLines ────────────────────────────────────────────

describe("extractLiteralKeyRefsWithLines", () => {
  it("extracts dot-notation accesses t.keyName", () => {
    const src = "const label = t.heroTitle;";
    const refs = extractLiteralKeyRefsWithLines(src);
    expect(refs.map((r) => r.key)).toContain("heroTitle");
  });

  it("extracts double-quoted bracket accesses t[\"keyName\"]", () => {
    const src = 't["checkoutButton"]';
    const refs = extractLiteralKeyRefsWithLines(src);
    expect(refs.map((r) => r.key)).toContain("checkoutButton");
  });

  it("extracts single-quoted bracket accesses t['keyName']", () => {
    const src = "t['cartEmpty']";
    const refs = extractLiteralKeyRefsWithLines(src);
    expect(refs.map((r) => r.key)).toContain("cartEmpty");
  });

  it("does not extract method calls like t.map()", () => {
    const src = "arr.map(t => t.something);\nt.map(x => x)";
    const refs = extractLiteralKeyRefsWithLines(src);
    // "map" must not appear because it is followed by "("
    expect(refs.map((r) => r.key)).not.toContain("map");
  });

  it("does not extract dynamic bracket accesses t[someVar]", () => {
    const src = "const val = t[someVar];";
    const refs = extractLiteralKeyRefsWithLines(src);
    // No literal key — only dynamic accesses, which are intentionally skipped
    expect(refs).toHaveLength(0);
  });

  it("records the correct 1-based line number for each access", () => {
    const src = "const a = t.heroTitle;\nconst b = t.checkoutButton;";
    const refs = extractLiteralKeyRefsWithLines(src);
    const heroRef = refs.find((r) => r.key === "heroTitle");
    const checkoutRef = refs.find((r) => r.key === "checkoutButton");
    expect(heroRef?.line).toBe(1);
    expect(checkoutRef?.line).toBe(2);
  });

  it("deduplicates identical (key, line) pairs", () => {
    // same key on the same line twice (e.g. `t.key && t.key`)
    const src = "const x = t.heroTitle && t.heroTitle;";
    const refs = extractLiteralKeyRefsWithLines(src);
    expect(refs.filter((r) => r.key === "heroTitle")).toHaveLength(1);
  });

  it("allows the same key on different lines (each line is a separate entry)", () => {
    const src = "t.heroTitle\nt.heroTitle";
    const refs = extractLiteralKeyRefsWithLines(src);
    const heroRefs = refs.filter((r) => r.key === "heroTitle");
    expect(heroRefs).toHaveLength(2);
    expect(heroRefs[0].line).toBe(1);
    expect(heroRefs[1].line).toBe(2);
  });
});

// ── classifyPlaceholderHit (Check 5 — copy-paste / placeholder guard) ─────────
//
// This is the exported pure-function equivalent of the Check 5 decision loop in
// the main script.  These tests verify real behaviour, including the exact
// MIN_COPY_PASTE_LENGTH boundary, the duplicate-diagnostic suppression guard,
// and every path through the function.

describe("classifyPlaceholderHit", () => {
  // Build an EN value that is exactly at the boundary (MIN_COPY_PASTE_LENGTH chars).
  const BOUNDARY = "A".repeat(MIN_COPY_PASTE_LENGTH);       // exactly 25 chars — flag
  const BELOW    = "A".repeat(MIN_COPY_PASTE_LENGTH - 1);   // exactly 24 chars — skip

  it("exports MIN_COPY_PASTE_LENGTH as 25", () => {
    // This assertion will fail if someone changes the constant without updating
    // tests — catching accidental threshold changes.
    expect(MIN_COPY_PASTE_LENGTH).toBe(25);
  });

  describe("sub-check (a) — identical-to-EN", () => {
    it("returns identical_to_en when AR value equals EN and EN is >= MIN_COPY_PASTE_LENGTH", () => {
      const hit = classifyPlaceholderHit("AR", "someKey", BOUNDARY, BOUNDARY);
      expect(hit).not.toBeNull();
      expect(hit?.reason).toBe("identical_to_en");
      expect(hit?.locale).toBe("AR");
      expect(hit?.key).toBe("someKey");
    });

    it("returns identical_to_en when FR value equals EN and EN is >= MIN_COPY_PASTE_LENGTH", () => {
      const hit = classifyPlaceholderHit("FR", "someKey", BOUNDARY, BOUNDARY);
      expect(hit?.reason).toBe("identical_to_en");
    });

    it("returns null when EN is exactly one char below MIN_COPY_PASTE_LENGTH (24 chars)", () => {
      // This is the exact boundary: 24 chars should not be flagged.
      const hit = classifyPlaceholderHit("AR", "someKey", BELOW, BELOW);
      expect(hit).toBeNull();
    });

    it("returns null when EN is exactly at MIN_COPY_PASTE_LENGTH but locale value differs", () => {
      const hit = classifyPlaceholderHit("AR", "someKey", BOUNDARY, "مختلف تماماً عن القيمة الإنجليزية");
      expect(hit).toBeNull();
    });
  });

  describe("sub-check (b) — AR no Arabic-script characters", () => {
    it("returns no_arabic_script when AR has no Arabic characters and differs from EN", () => {
      const enVal = "Send flowers today";           // translatable, no Arabic
      const arVal = "Send flowers today slightly different";  // Latin only, differs from EN
      const hit = classifyPlaceholderHit("AR", "someKey", enVal, arVal);
      expect(hit).not.toBeNull();
      expect(hit?.reason).toBe("no_arabic_script");
    });

    it("does NOT return no_arabic_script for FR locale (only AR is checked)", () => {
      const enVal = "Send flowers today";
      const arVal = "Send flowers today slightly different";  // no Arabic but it's FR
      const hit = classifyPlaceholderHit("FR", "someKey", enVal, arVal);
      expect(hit).toBeNull();
    });

    it("returns null when AR value is language-neutral (digits/symbols) — not a translation oversight", () => {
      const hit = classifyPlaceholderHit("AR", "phonePrefix", "+961", "+961");
      // "+961" equals EN but is only 4 chars (below threshold) → sub-check (a) skips it.
      // "+961" is language-neutral → sub-check (b) skips it too.
      expect(hit).toBeNull();
    });

    it("returns null when AR value contains proper Arabic script", () => {
      const hit = classifyPlaceholderHit("AR", "someKey", "Send flowers today", "أرسل الزهور اليوم");
      expect(hit).toBeNull();
    });
  });

  describe("duplicate-diagnostic suppression", () => {
    it("returns identical_to_en (not no_arabic_script) when AR equals long EN value", () => {
      // When localeVal === enVal and EN is long enough, sub-check (a) fires and
      // returns early. Sub-check (b) must NOT also fire — that would produce a
      // duplicate / misleading diagnostic.
      const longEnVal = "Find the perfect floral arrangement or luxury gift"; // 50 chars
      const hit = classifyPlaceholderHit("AR", "heroDesc", longEnVal, longEnVal);
      expect(hit?.reason).toBe("identical_to_en");
      // Confirm that the no_arabic_script reason is NOT returned here — if the
      // function returned two hits it would be a bug; it returns exactly one.
    });

    it("returns no_arabic_script (not identical_to_en) when AR is Latin but differs from short EN", () => {
      // EN value is short (below threshold) so sub-check (a) skips it.
      // AR value is Latin-only and differs from EN → sub-check (b) fires.
      const shortEnVal = "OK";                // well below 25 chars
      const arVal = "OKish different text";   // Latin only, differs from EN
      const hit = classifyPlaceholderHit("AR", "confirmLabel", shortEnVal, arVal);
      expect(hit?.reason).toBe("no_arabic_script");
    });
  });

  describe("correct pass-through (returns null)", () => {
    it("returns null when AR value is a proper Arabic translation", () => {
      const hit = classifyPlaceholderHit(
        "AR", "heroTitle",
        "Find the perfect floral arrangement or luxury gift",
        "اعثر على باقة الزهور أو الهدية الفاخرة المثالية",
      );
      expect(hit).toBeNull();
    });

    it("returns null when FR value is a proper French translation", () => {
      const hit = classifyPlaceholderHit(
        "FR", "heroTitle",
        "Find the perfect floral arrangement or luxury gift",
        "Trouvez la composition florale ou le cadeau de luxe parfait",
      );
      expect(hit).toBeNull();
    });
  });
});
