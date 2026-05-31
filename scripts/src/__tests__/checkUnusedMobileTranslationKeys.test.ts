/**
 * Unit tests for checkUnusedMobileTranslationKeys.ts.
 *
 * Each of the script's five checks is exercised with small inline fixture
 * strings so tests run entirely in-memory without touching the real
 * translations.ts or any source files.
 *
 * Checks covered:
 *   1. UNUSED KEYS          — isKeyReferenced (false-positive + true-positive)
 *   2. LOCALE PARITY        — extractLocaleKeys (EN vs AR/FR parity)
 *   3. UNDEFINED KEY REFS   — extractLiteralKeyRefsWithLines + EN key set
 *   4. ORPHAN LOCALE KEYS   — keys in AR/FR absent from EN
 *   5. PLACEHOLDER STRINGS  — extractLocaleKeyValues + value comparison
 *
 * Helper functions also exercised:
 *   - usesTranslationObject
 *   - containsArabicScript
 *   - isLanguageNeutralValue
 *   - enValueIsUntranslatable
 */

import { describe, it, expect } from "vitest";
import {
  extractLocaleKeys,
  extractLocaleKeyValues,
  extractLiteralKeyRefsWithLines,
  isKeyReferenced,
  usesTranslationObject,
  containsArabicScript,
  isLanguageNeutralValue,
  enValueIsUntranslatable,
} from "../checkUnusedMobileTranslationKeys.js";

// ── Fixture helpers ───────────────────────────────────────────────────────────

/**
 * Build a minimal translations.ts-style fixture for one locale block.
 * The closing `};` must start at column 0 to satisfy extractLocaleKeys.
 */
function makeLocaleBlock(name: string, entries: Record<string, string>): string {
  const body = Object.entries(entries)
    .map(([k, v]) => `  ${k}: "${v}",`)
    .join("\n");
  return `const ${name} = {\n${body}\n};`;
}

function makeTranslationsSrc(
  en: Record<string, string>,
  ar: Record<string, string>,
  fr: Record<string, string>,
): string {
  return [
    makeLocaleBlock("EN", en),
    makeLocaleBlock("AR", ar),
    makeLocaleBlock("FR", fr),
  ].join("\n\n");
}

// ── extractLocaleKeys ─────────────────────────────────────────────────────────

describe("extractLocaleKeys", () => {
  const src = makeTranslationsSrc(
    { heroTitle: "Welcome", checkoutButton: "Checkout" },
    { heroTitle: "مرحبا", checkoutButton: "الدفع" },
    { heroTitle: "Bienvenue", checkoutButton: "Paiement" },
  );

  it("extracts all top-level keys from the EN block", () => {
    const keys = extractLocaleKeys(src, "EN");
    expect(keys).toContain("heroTitle");
    expect(keys).toContain("checkoutButton");
    expect(keys).toHaveLength(2);
  });

  it("extracts keys from the AR block independently", () => {
    const keys = extractLocaleKeys(src, "AR");
    expect(keys).toContain("heroTitle");
    expect(keys).toContain("checkoutButton");
  });

  it("extracts keys from the FR block independently", () => {
    const keys = extractLocaleKeys(src, "FR");
    expect(keys).toContain("heroTitle");
    expect(keys).toContain("checkoutButton");
  });

  it("throws when the named locale block is absent", () => {
    expect(() => extractLocaleKeys(src, "DE")).toThrow();
  });
});

// ── extractLocaleKeyValues ────────────────────────────────────────────────────

describe("extractLocaleKeyValues", () => {
  const src = makeTranslationsSrc(
    { heroTitle: "Welcome", greeting: "Hello" },
    { heroTitle: "مرحبا", greeting: "أهلاً" },
    { heroTitle: "Bienvenue", greeting: "Bonjour" },
  );

  it("returns correct EN values", () => {
    const vals = extractLocaleKeyValues(src, "EN");
    expect(vals.get("heroTitle")).toBe("Welcome");
    expect(vals.get("greeting")).toBe("Hello");
  });

  it("returns correct AR values", () => {
    const vals = extractLocaleKeyValues(src, "AR");
    expect(vals.get("heroTitle")).toBe("مرحبا");
  });

  it("returns correct FR values", () => {
    const vals = extractLocaleKeyValues(src, "FR");
    expect(vals.get("greeting")).toBe("Bonjour");
  });
});

// ── Check 1: isKeyReferenced (unused-key detection) ───────────────────────────

describe("isKeyReferenced", () => {
  it("true positive — dot notation reference", () => {
    expect(isKeyReferenced("heroTitle", "const x = t.heroTitle;")).toBe(true);
  });

  it("true positive — bracket string literal reference", () => {
    expect(isKeyReferenced("heroTitle", 't["heroTitle"]')).toBe(true);
  });

  it("true positive — single-quoted bracket reference", () => {
    expect(isKeyReferenced("heroTitle", "t['heroTitle']")).toBe(true);
  });

  it("false positive — key is a substring of another identifier", () => {
    // 'hero' must not match against corpus containing only 'heroTitle'
    expect(isKeyReferenced("hero", "t.heroTitle;")).toBe(false);
  });

  it("false positive — key absent from corpus entirely", () => {
    expect(isKeyReferenced("unusedKey", "const x = t.heroTitle;")).toBe(false);
  });

  it("true positive — key appears as quoted string (not dot notation)", () => {
    const corpus = `const key = "checkoutButton"; t[key]`;
    expect(isKeyReferenced("checkoutButton", corpus)).toBe(true);
  });
});

// ── Check 2: locale parity (EN vs AR/FR) ─────────────────────────────────────

describe("locale parity check", () => {
  /**
   * Simulates the parity check: returns keys present in `enKeys` but absent
   * from `localeKeys`.
   */
  function missingFromLocale(enKeys: string[], localeKeys: string[]): string[] {
    const localeSet = new Set(localeKeys);
    return enKeys.filter((k) => !localeSet.has(k));
  }

  it("reports a key present in EN but missing from AR (true positive)", () => {
    const src = makeTranslationsSrc(
      { heroTitle: "Welcome", newKey: "New" },
      { heroTitle: "مرحبا" },
      { heroTitle: "Bienvenue", newKey: "Nouveau" },
    );
    const enKeys = extractLocaleKeys(src, "EN");
    const arKeys = extractLocaleKeys(src, "AR");
    expect(missingFromLocale(enKeys, arKeys)).toContain("newKey");
  });

  it("reports a key present in EN but missing from FR (true positive)", () => {
    const src = makeTranslationsSrc(
      { heroTitle: "Welcome", missingFr: "Text" },
      { heroTitle: "مرحبا", missingFr: "نص" },
      { heroTitle: "Bienvenue" },
    );
    const enKeys = extractLocaleKeys(src, "EN");
    const frKeys = extractLocaleKeys(src, "FR");
    expect(missingFromLocale(enKeys, frKeys)).toContain("missingFr");
  });

  it("reports nothing when all locales are in parity (false positive guard)", () => {
    const src = makeTranslationsSrc(
      { heroTitle: "Welcome", checkoutButton: "Checkout" },
      { heroTitle: "مرحبا", checkoutButton: "الدفع" },
      { heroTitle: "Bienvenue", checkoutButton: "Paiement" },
    );
    const enKeys = extractLocaleKeys(src, "EN");
    const arKeys = extractLocaleKeys(src, "AR");
    const frKeys = extractLocaleKeys(src, "FR");
    expect(missingFromLocale(enKeys, arKeys)).toHaveLength(0);
    expect(missingFromLocale(enKeys, frKeys)).toHaveLength(0);
  });
});

// ── Check 3: undefined key references ────────────────────────────────────────

describe("extractLiteralKeyRefsWithLines", () => {
  it("extracts dot-notation key references from files that use useT()", () => {
    const src = `
      const t = useT();
      return <Text>{t.heroTitle}</Text>;
    `;
    const refs = extractLiteralKeyRefsWithLines(src);
    const keys = refs.map((r) => r.key);
    expect(keys).toContain("heroTitle");
  });

  it("extracts bracket string literal key references", () => {
    const src = `
      const t = useT();
      const val = t["checkoutButton"];
    `;
    const refs = extractLiteralKeyRefsWithLines(src);
    const keys = refs.map((r) => r.key);
    expect(keys).toContain("checkoutButton");
  });

  it("skips method calls on t (e.g. t.map())", () => {
    const src = `
      const t = useT();
      const items = t.map((x) => x);
    `;
    const refs = extractLiteralKeyRefsWithLines(src);
    const keys = refs.map((r) => r.key);
    expect(keys).not.toContain("map");
  });

  it("reports the correct 1-based line number", () => {
    const src = `const t = useT();\nconst x = t.heroTitle;`;
    const refs = extractLiteralKeyRefsWithLines(src);
    const heroRef = refs.find((r) => r.key === "heroTitle");
    expect(heroRef?.line).toBe(2);
  });

  it("deduplicates the same key accessed twice on the same line", () => {
    const src = `const t = useT();\nconst x = t.heroTitle || t.heroTitle;`;
    const refs = extractLiteralKeyRefsWithLines(src);
    const heroRefs = refs.filter((r) => r.key === "heroTitle");
    expect(heroRefs).toHaveLength(1);
  });
});

describe("undefined key reference detection (check #3 logic)", () => {
  function findUndefinedRefs(
    src: string,
    enKeySet: Set<string>,
  ): string[] {
    const refs = extractLiteralKeyRefsWithLines(src);
    return refs.map((r) => r.key).filter((k) => !enKeySet.has(k));
  }

  it("detects a typo in a t.key reference (true positive)", () => {
    const enKeys = new Set(["heroTitle"]);
    const src = `
      const t = useT();
      return t.heroTitl; // typo — missing 'e'
    `;
    expect(findUndefinedRefs(src, enKeys)).toContain("heroTitl");
  });

  it("does not flag a valid key reference (false positive guard)", () => {
    const enKeys = new Set(["heroTitle"]);
    const src = `
      const t = useT();
      return t.heroTitle;
    `;
    expect(findUndefinedRefs(src, enKeys)).toHaveLength(0);
  });

  it("detects a completely unknown key reference", () => {
    const enKeys = new Set(["heroTitle"]);
    const src = `
      const t = useT();
      return t.ghostKey;
    `;
    expect(findUndefinedRefs(src, enKeys)).toContain("ghostKey");
  });
});

// ── Check 4: orphan locale keys (AR/FR → EN) ─────────────────────────────────

describe("orphan locale key detection (check #4)", () => {
  /**
   * Simulates the orphan check: returns keys present in `localeKeys` but
   * absent from `enKeySet`.
   */
  function findOrphans(localeKeys: string[], enKeySet: Set<string>): string[] {
    return localeKeys.filter((k) => !enKeySet.has(k));
  }

  it("detects a key in AR that is absent from EN (true positive)", () => {
    const src = makeTranslationsSrc(
      { heroTitle: "Welcome" },
      { heroTitle: "مرحبا", orphanAr: "كلمة يتيمة" },
      { heroTitle: "Bienvenue" },
    );
    const enKeys = new Set(extractLocaleKeys(src, "EN"));
    const arKeys = extractLocaleKeys(src, "AR");
    expect(findOrphans(arKeys, enKeys)).toContain("orphanAr");
  });

  it("detects a key in FR that is absent from EN (true positive)", () => {
    const src = makeTranslationsSrc(
      { heroTitle: "Welcome" },
      { heroTitle: "مرحبا" },
      { heroTitle: "Bienvenue", orphanFr: "mot orphelin" },
    );
    const enKeys = new Set(extractLocaleKeys(src, "EN"));
    const frKeys = extractLocaleKeys(src, "FR");
    expect(findOrphans(frKeys, enKeys)).toContain("orphanFr");
  });

  it("reports no orphans when locale keys are a subset of EN (false positive guard)", () => {
    const src = makeTranslationsSrc(
      { heroTitle: "Welcome", checkoutButton: "Checkout" },
      { heroTitle: "مرحبا", checkoutButton: "الدفع" },
      { heroTitle: "Bienvenue", checkoutButton: "Paiement" },
    );
    const enKeys = new Set(extractLocaleKeys(src, "EN"));
    const arKeys = extractLocaleKeys(src, "AR");
    const frKeys = extractLocaleKeys(src, "FR");
    expect(findOrphans(arKeys, enKeys)).toHaveLength(0);
    expect(findOrphans(frKeys, enKeys)).toHaveLength(0);
  });
});

// ── Check 5: placeholder / copy-paste strings ────────────────────────────────

describe("placeholder / copy-paste detection (check #5)", () => {
  it("flags an AR value identical to EN (true positive)", () => {
    const src = makeTranslationsSrc(
      { heroTitle: "Welcome" },
      { heroTitle: "Welcome" },
      { heroTitle: "Bienvenue" },
    );
    const enVals = extractLocaleKeyValues(src, "EN");
    const arVals = extractLocaleKeyValues(src, "AR");
    const enKey = "heroTitle";
    const enVal = enVals.get(enKey)!;
    const arVal = arVals.get(enKey)!;
    expect(arVal).toBe(enVal);
  });

  it("does not flag an AR value that is properly translated (false positive guard)", () => {
    const src = makeTranslationsSrc(
      { heroTitle: "Welcome" },
      { heroTitle: "مرحبا" },
      { heroTitle: "Bienvenue" },
    );
    const enVals = extractLocaleKeyValues(src, "EN");
    const arVals = extractLocaleKeyValues(src, "AR");
    expect(arVals.get("heroTitle")).not.toBe(enVals.get("heroTitle"));
  });

  it("flags an AR value with no Arabic-script characters (true positive)", () => {
    const src = makeTranslationsSrc(
      { heroTitle: "Welcome" },
      { heroTitle: "Not translated yet" },
      { heroTitle: "Bienvenue" },
    );
    const arVals = extractLocaleKeyValues(src, "AR");
    const arVal = arVals.get("heroTitle")!;
    expect(containsArabicScript(arVal)).toBe(false);
  });

  it("does not flag a language-neutral value like a phone code (false positive guard)", () => {
    const src = makeTranslationsSrc(
      { phoneCode: "+961" },
      { phoneCode: "+961" },
      { phoneCode: "+961" },
    );
    const enVals = extractLocaleKeyValues(src, "EN");
    const enVal = enVals.get("phoneCode")!;
    expect(enValueIsUntranslatable(enVal)).toBe(true);
  });

  it("does not flag a template-variable-only value like {country} (false positive guard)", () => {
    expect(enValueIsUntranslatable("{country}")).toBe(true);
    expect(enValueIsUntranslatable("{name} — {city}")).toBe(true);
  });

  it("does flag a value with real translatable text mixed with a variable", () => {
    expect(enValueIsUntranslatable("Delivering to {city}")).toBe(false);
  });
});

// ── Helper: usesTranslationObject ────────────────────────────────────────────

describe("usesTranslationObject", () => {
  it("returns true for a file that calls useT()", () => {
    expect(usesTranslationObject("const t = useT(); t.key")).toBe(true);
  });

  it("returns true for a file that accesses translations[lang]", () => {
    expect(usesTranslationObject("const t = translations[lang];")).toBe(true);
  });

  it("returns false for a file that uses t as a different variable", () => {
    expect(usesTranslationObject("const t = router.params; t.id")).toBe(false);
  });
});

// ── Helper: containsArabicScript ─────────────────────────────────────────────

describe("containsArabicScript", () => {
  it("returns true for a string with Arabic characters", () => {
    expect(containsArabicScript("مرحبا")).toBe(true);
  });

  it("returns false for a plain English string", () => {
    expect(containsArabicScript("Hello")).toBe(false);
  });

  it("returns true when Arabic is mixed with other characters", () => {
    expect(containsArabicScript("Delivering to بيروت")).toBe(true);
  });
});

// ── Helper: isLanguageNeutralValue ────────────────────────────────────────────

describe("isLanguageNeutralValue", () => {
  it("returns true for a digit-only string like a phone code", () => {
    expect(isLanguageNeutralValue("+961")).toBe(true);
  });

  it("returns true for a pure symbol string", () => {
    expect(isLanguageNeutralValue("—")).toBe(true);
  });

  it("returns false for a string with translatable words", () => {
    expect(isLanguageNeutralValue("Welcome")).toBe(false);
  });

  it("returns false for mixed word and number", () => {
    expect(isLanguageNeutralValue("Order 123")).toBe(false);
  });
});
