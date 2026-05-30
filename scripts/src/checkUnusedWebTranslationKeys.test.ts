/**
 * Unit tests for the undefined-key check (check #3) in
 * checkUnusedWebTranslationKeys.ts.
 *
 * These tests exercise the two exported pure functions that underpin check #3:
 *   - extractStaticTCallKeys  — finds literal t("key") call sites
 *   - extractDynamicPrefixes  — finds template-literal t(`prefix.${expr}`) prefixes
 *
 * The tests prove that a typo in a t() call site is caught, that valid keys
 * are not false-positives, and that dynamic call sites are excluded from the
 * hard check (they can only be validated by prefix).
 */

import { describe, it, expect } from "vitest";
import {
  extractStaticTCallKeys,
  extractDynamicPrefixes,
  extractEmptyValueKeys,
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
