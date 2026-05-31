/**
 * Unit tests for checkUnusedWebTranslationKeys.ts.
 *
 * Covers:
 *   - extractStaticTCallKeys  — finds literal t("key") call sites (check #3)
 *   - extractDynamicPrefixes  — template-literal t(`prefix.${expr}`) (check #3)
 *   - extractEmptyValueKeys   — blank en/ar values (check #5)
 *   - extractNoTranslateKeys  — reads // no-translate annotations (check #6)
 *   - extractCopypasteKeys    — copy-pasted EN values in AR/FR (check #6)
 *   - isLanguageNeutralValue  — helper used by the copy-paste check
 *   - enValueIsUntranslatable — helper used by the copy-paste check
 */

import { describe, it, expect } from "vitest";
import {
  extractStaticTCallKeys,
  extractDynamicPrefixes,
  extractEmptyValueKeys,
  extractCopypasteKeys,
  extractNoTranslateKeys,
  isLanguageNeutralValue,
  enValueIsUntranslatable,
} from "./checkUnusedWebTranslationKeys.js";

describe("extractStaticTCallKeys", () => {
  it("extracts dot-notation keys from t(\"key\") calls", () => {
    const corpus = `
      const a = t("cart.title");
      const b = t('checkout.button.label');
    `;
    expect(extractStaticTCallKeys(corpus)).toEqual(
      expect.arrayContaining(["cart.title", "checkout.button.label"]),
    );
  });

  it("ignores non-dot-notation arguments (not translation keys)", () => {
    const corpus = `t("notakey"); t('alsonotakey');`;
    expect(extractStaticTCallKeys(corpus)).toHaveLength(0);
  });

  it("deduplicates keys that appear multiple times", () => {
    const corpus = `t("nav.home"); t("nav.home"); t("nav.home");`;
    const keys = extractStaticTCallKeys(corpus);
    expect(keys.filter((k) => k === "nav.home")).toHaveLength(1);
  });

  it("does not extract template-literal calls as static keys", () => {
    const corpus = "t(`seo.${route}.title`)";
    expect(extractStaticTCallKeys(corpus)).toHaveLength(0);
  });
});

describe("extractDynamicPrefixes", () => {
  it("extracts the static prefix before the first interpolation", () => {
    const corpus = "t(`lang.label.${lang}`)";
    expect(extractDynamicPrefixes(corpus)).toContain("lang.label.");
  });

  it("handles multiple different prefixes", () => {
    const corpus = `
      t(\`seo.\${routeKey}.title\`);
      t(\`lang.label.\${lang}\`);
    `;
    const prefixes = extractDynamicPrefixes(corpus);
    expect(prefixes).toContain("seo.");
    expect(prefixes).toContain("lang.label.");
  });

  it("ignores template literals with no static prefix (interpolation first)", () => {
    const corpus = "t(`${key}`)";
    expect(extractDynamicPrefixes(corpus)).toHaveLength(0);
  });
});

describe("extractEmptyValueKeys", () => {
  it("returns nothing for entries with non-empty en and ar", () => {
    const src = `
      "cart.title": { en: "Cart", ar: "عربة التسوق" },
    `;
    expect(extractEmptyValueKeys(src)).toHaveLength(0);
  });

  it("flags an entry with an empty en value", () => {
    const src = `
      "cart.title": { en: "", ar: "عربة التسوق" },
    `;
    const results = extractEmptyValueKeys(src);
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("cart.title");
    expect(results[0].fields).toContain("en");
    expect(results[0].fields).not.toContain("ar");
  });

  it("flags an entry with an empty ar value", () => {
    const src = `
      "checkout.button": { en: "Proceed", ar: "" },
    `;
    const results = extractEmptyValueKeys(src);
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("checkout.button");
    expect(results[0].fields).toContain("ar");
    expect(results[0].fields).not.toContain("en");
  });

  it("flags both fields when both are empty", () => {
    const src = `
      "nav.home": { en: "", ar: "" },
    `;
    const results = extractEmptyValueKeys(src);
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("nav.home");
    expect(results[0].fields).toContain("en");
    expect(results[0].fields).toContain("ar");
  });

  it("flags whitespace-only values (treated as empty after trim)", () => {
    const src = `
      "footer.text": { en: "   ", ar: "  " },
    `;
    const results = extractEmptyValueKeys(src);
    expect(results).toHaveLength(1);
    expect(results[0].fields).toContain("en");
    expect(results[0].fields).toContain("ar");
  });

  it("does not flag a missing ar field (that is caught by extractMissingArKeys)", () => {
    // ar field is absent — extractEmptyValueKeys should not flag it
    const src = `
      "product.name": { en: "Rose Bouquet" },
    `;
    expect(extractEmptyValueKeys(src)).toHaveLength(0);
  });

  it("handles multi-line dict entries", () => {
    const src = `
      "order.status": {
        en: "",
        ar: "حالة الطلب",
      },
    `;
    const results = extractEmptyValueKeys(src);
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("order.status");
    expect(results[0].fields).toEqual(["en"]);
  });

  it("ignores keys without a dot (non-translation keys like 'en' or 'ar' themselves)", () => {
    const src = `
      "nodot": { en: "", ar: "" },
    `;
    expect(extractEmptyValueKeys(src)).toHaveLength(0);
  });

  it("handles multiple entries, reporting only the offending ones", () => {
    const src = `
      "nav.home": { en: "Home", ar: "الرئيسية" },
      "nav.cart": { en: "", ar: "السلة" },
      "nav.about": { en: "About", ar: "" },
    `;
    const results = extractEmptyValueKeys(src);
    expect(results).toHaveLength(2);
    const keys = results.map((r) => r.key);
    expect(keys).toContain("nav.cart");
    expect(keys).toContain("nav.about");
    expect(keys).not.toContain("nav.home");
  });
});

describe("isLanguageNeutralValue", () => {
  it("returns true for digit-only strings", () => {
    expect(isLanguageNeutralValue("961")).toBe(true);
  });

  it("returns true for punctuation/symbol-only strings", () => {
    expect(isLanguageNeutralValue("—")).toBe(true);
    expect(isLanguageNeutralValue("+961")).toBe(true);
    expect(isLanguageNeutralValue("USD")).toBe(false);
  });

  it("returns false for strings containing letters", () => {
    expect(isLanguageNeutralValue("Hello")).toBe(false);
    expect(isLanguageNeutralValue("Express")).toBe(false);
  });

  it("returns true for whitespace-only", () => {
    expect(isLanguageNeutralValue("   ")).toBe(true);
  });
});

describe("enValueIsUntranslatable", () => {
  it("returns true for pure template-variable strings", () => {
    expect(enValueIsUntranslatable("{country}")).toBe(true);
    expect(enValueIsUntranslatable("{count} ")).toBe(true);
    expect(enValueIsUntranslatable("{{name}}")).toBe(true);
  });

  it("returns false when template vars are mixed with real text", () => {
    expect(enValueIsUntranslatable("{count} items")).toBe(false);
    expect(enValueIsUntranslatable("Hello, {name}!")).toBe(false);
  });

  it("returns true for empty string", () => {
    expect(enValueIsUntranslatable("")).toBe(true);
  });

  it("returns false for normal translatable text", () => {
    expect(enValueIsUntranslatable("Find the perfect floral arrangement")).toBe(false);
    expect(enValueIsUntranslatable("Proceed to Checkout")).toBe(false);
  });
});

describe("extractNoTranslateKeys", () => {
  it("returns an empty set when no // no-translate annotations are present", () => {
    const src = `  "brand.name": { en: "Presentail", ar: "Presentail" },\n`;
    expect(extractNoTranslateKeys(src).size).toBe(0);
  });

  it("detects // no-translate on a single-line Dict entry", () => {
    const src = `  "brand.tagline": { en: "Gift with Love — Presentail Lebanon", ar: "Gift with Love — Presentail Lebanon" }, // no-translate\n`;
    const keys = extractNoTranslateKeys(src);
    expect(keys.has("brand.tagline")).toBe(true);
  });

  it("detects // no-translate with extra comment text after it", () => {
    const src = `  "brand.tagline": { en: "Gift with Love — Presentail Lebanon", ar: "Gift with Love — Presentail Lebanon" }, // no-translate — brand tagline\n`;
    const keys = extractNoTranslateKeys(src);
    expect(keys.has("brand.tagline")).toBe(true);
  });

  it("detects // no-translate on the closing brace line of a multi-line Dict entry", () => {
    const src = `
  "brand.tagline": {
    en: "Gift with Love — Presentail Lebanon",
    ar: "Gift with Love — Presentail Lebanon",
  }, // no-translate — verbatim in every locale
`;
    const keys = extractNoTranslateKeys(src);
    expect(keys.has("brand.tagline")).toBe(true);
  });

  it("detects // no-translate on a FR string entry", () => {
    const src = `  "brand.tagline": "Gift with Love — Presentail Lebanon", // no-translate\n`;
    const keys = extractNoTranslateKeys(src);
    expect(keys.has("brand.tagline")).toBe(true);
  });

  it("does not include keys without a dot", () => {
    const src = `  "nodot": { en: "Something", ar: "Something" }, // no-translate\n`;
    const keys = extractNoTranslateKeys(src);
    expect(keys.has("nodot")).toBe(false);
  });

  it("collects multiple annotated keys from the same source", () => {
    const src = [
      `  "seo.siteName": { en: "Presentail", ar: "Presentail" }, // no-translate`,
      `  "footer.appUrl": { en: "https://presentail.com/app", ar: "https://presentail.com/app" }, // no-translate`,
    ].join("\n");
    const keys = extractNoTranslateKeys(src);
    expect(keys.has("seo.siteName")).toBe(true);
    expect(keys.has("footer.appUrl")).toBe(true);
  });
});

describe("extractCopypasteKeys", () => {
  // Helper: build a locale file snippet with a Dict entry and an optional FR entry.
  function makeSnippet({
    key,
    en,
    ar,
    fr,
  }: {
    key: string;
    en: string;
    ar: string;
    fr?: string;
  }) {
    const dict = `  "${key}": { en: "${en}", ar: "${ar}" },\n`;
    const frLine = fr !== undefined ? `  "${key}": "${fr}",\n` : "";
    return dict + frLine;
  }

  it("returns no hits when AR and FR are proper translations", () => {
    const src = makeSnippet({
      key: "cart.empty.desc",
      en: "Find the perfect floral arrangement or luxury gift",
      ar: "اعثر على باقة الزهور أو الهدية الفاخرة المثالية",
      fr: "Trouvez la composition florale ou le cadeau de luxe parfait",
    });
    expect(extractCopypasteKeys(src)).toHaveLength(0);
  });

  it("flags ar-identical when AR value equals EN value and EN is long enough", () => {
    const src = makeSnippet({
      key: "cart.empty.desc",
      en: "Find the perfect floral arrangement or luxury gift for your occasion",
      ar: "Find the perfect floral arrangement or luxury gift for your occasion",
    });
    const hits = extractCopypasteKeys(src);
    expect(hits).toHaveLength(1);
    expect(hits[0].key).toBe("cart.empty.desc");
    expect(hits[0].kind).toBe("ar-identical");
  });

  it("flags fr-identical when FR value equals EN value and EN is long enough", () => {
    const src = makeSnippet({
      key: "cart.empty.desc",
      en: "Find the perfect floral arrangement or luxury gift for your occasion",
      ar: "اعثر على باقة الزهور أو الهدية الفاخرة",
      fr: "Find the perfect floral arrangement or luxury gift for your occasion",
    });
    const hits = extractCopypasteKeys(src);
    expect(hits).toHaveLength(1);
    expect(hits[0].key).toBe("cart.empty.desc");
    expect(hits[0].kind).toBe("fr-identical");
  });

  it("skips AR check when EN is shorter than MIN_COPY_PASTE_LENGTH (brand name case)", () => {
    // "Express" is 7 chars — well under the 25-char minimum
    const src = makeSnippet({
      key: "cart.upsells.express",
      en: "Express",
      ar: "Express",
      fr: "Express",
    });
    expect(extractCopypasteKeys(src)).toHaveLength(0);
  });

  it("skips when EN value is untranslatable (pure template variable)", () => {
    const src = makeSnippet({
      key: "order.count",
      en: "{count}",
      ar: "{count}",
      fr: "{count}",
    });
    expect(extractCopypasteKeys(src)).toHaveLength(0);
  });

  it("skips when EN value is language-neutral (digits/symbols only)", () => {
    const src = makeSnippet({
      key: "phone.prefix",
      en: "+961",
      ar: "+961",
      fr: "+961",
    });
    expect(extractCopypasteKeys(src)).toHaveLength(0);
  });

  it("does not flag when AR is properly translated but FR is copy-pasted", () => {
    const src = makeSnippet({
      key: "cart.empty.desc",
      en: "Find the perfect floral arrangement or luxury gift for any occasion",
      ar: "اعثر على باقة الزهور أو الهدية الفاخرة المثالية لأي مناسبة",
      fr: "Find the perfect floral arrangement or luxury gift for any occasion",
    });
    const hits = extractCopypasteKeys(src);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("fr-identical");
  });

  it("flags both ar-identical and fr-identical when both are copy-pasted", () => {
    const src = makeSnippet({
      key: "cart.empty.desc",
      en: "Find the perfect floral arrangement or luxury gift for any occasion",
      ar: "Find the perfect floral arrangement or luxury gift for any occasion",
      fr: "Find the perfect floral arrangement or luxury gift for any occasion",
    });
    const hits = extractCopypasteKeys(src);
    expect(hits).toHaveLength(2);
    const kinds = hits.map((h) => h.kind);
    expect(kinds).toContain("ar-identical");
    expect(kinds).toContain("fr-identical");
  });

  it("correctly handles multi-line Dict entries", () => {
    const src = `
      "checkout.empty.message": {
        en: "Your shopping bag is empty — add something beautiful",
        ar: "Your shopping bag is empty — add something beautiful",
      },
    `;
    const hits = extractCopypasteKeys(src);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("ar-identical");
    expect(hits[0].enValue).toBe(
      "Your shopping bag is empty — add something beautiful",
    );
  });

  it("skips keys without a dot (non-translation keys)", () => {
    const src = `
      "nodot": { en: "This is a very long string that exceeds the threshold for detection", ar: "This is a very long string that exceeds the threshold for detection" },
    `;
    expect(extractCopypasteKeys(src)).toHaveLength(0);
  });

  it("does not flag a key annotated with // no-translate (single-line Dict entry)", () => {
    const src = `  "brand.tagline": { en: "Gift with Love — Presentail Lebanon", ar: "Gift with Love — Presentail Lebanon" }, // no-translate\n`;
    expect(extractCopypasteKeys(src)).toHaveLength(0);
  });

  it("does not flag a key annotated with // no-translate (multi-line Dict entry)", () => {
    const src = `
  "brand.tagline": {
    en: "Gift with Love — Presentail Lebanon",
    ar: "Gift with Love — Presentail Lebanon",
  }, // no-translate — brand tagline, verbatim in every locale
`;
    expect(extractCopypasteKeys(src)).toHaveLength(0);
  });

  it("does not flag FR copy-paste when Dict entry carries // no-translate", () => {
    const src = `  "brand.tagline": { en: "Gift with Love — Presentail Lebanon", ar: "Gift with Love — Presentail Lebanon" }, // no-translate\n  "brand.tagline": "Gift with Love — Presentail Lebanon",\n`;
    expect(extractCopypasteKeys(src)).toHaveLength(0);
  });

  it("still flags other identical keys when only one is annotated", () => {
    const annotated = `  "brand.tagline": { en: "Gift with Love — Presentail Lebanon", ar: "Gift with Love — Presentail Lebanon" }, // no-translate\n`;
    const flagged = makeSnippet({
      key: "cart.empty.desc",
      en: "Find the perfect floral arrangement or luxury gift for any occasion",
      ar: "Find the perfect floral arrangement or luxury gift for any occasion",
    });
    const hits = extractCopypasteKeys(annotated + flagged);
    expect(hits).toHaveLength(1);
    expect(hits[0].key).toBe("cart.empty.desc");
  });
});

describe("check #3 — undefined-key detection logic", () => {
  /**
   * The full check #3 pipeline:
   *   1. extract static call keys from corpus
   *   2. filter to those not in stringsKeys
   *   → the result is what the script reports as missing keys
   */

  function findUndefinedKeys(corpus: string, stringsKeys: Set<string>): string[] {
    const staticKeys = extractStaticTCallKeys(corpus);
    return staticKeys.filter((k) => !stringsKeys.has(k));
  }

  it("reports a key that does not exist in STRINGS (typo scenario)", () => {
    const stringsKeys = new Set(["cart.title", "checkout.button.label"]);
    const corpus = `t("cart.titl")`;  // typo — missing 'e'
    expect(findUndefinedKeys(corpus, stringsKeys)).toContain("cart.titl");
  });

  it("does not report a key that exists in STRINGS", () => {
    const stringsKeys = new Set(["cart.title"]);
    const corpus = `t("cart.title")`;
    expect(findUndefinedKeys(corpus, stringsKeys)).toHaveLength(0);
  });

  it("does not report dynamic template-literal calls (excluded from hard check)", () => {
    const stringsKeys = new Set<string>();  // no keys defined
    const corpus = "t(`seo.${route}.title`)";  // dynamic — full key unknown at parse time
    // extractStaticTCallKeys ignores template literals, so nothing is flagged
    expect(findUndefinedKeys(corpus, stringsKeys)).toHaveLength(0);
  });

  it("reports all typos in a mixed corpus", () => {
    const stringsKeys = new Set(["nav.home", "nav.about"]);
    const corpus = `
      t("nav.home");        // valid
      t("nav.abut");        // typo
      t("nav.contact");     // missing entirely
    `;
    const missing = findUndefinedKeys(corpus, stringsKeys);
    expect(missing).toContain("nav.abut");
    expect(missing).toContain("nav.contact");
    expect(missing).not.toContain("nav.home");
  });
});
