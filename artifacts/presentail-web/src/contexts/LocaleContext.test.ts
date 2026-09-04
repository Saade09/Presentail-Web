import { describe, it, expect } from "vitest";
import { STRINGS_FR } from "@/locales/fr";
import { STRINGS_EL } from "@/locales/el";
import { loadLocaleStrings } from "@/locales/load";
import { STRINGS } from "@/locales/index";

describe("LocaleContext string dictionaries", () => {
  const keys = Object.keys(STRINGS);

  it("every key in STRINGS has a non-empty English value", () => {
    const missing: string[] = [];
    for (const key of keys) {
      if (!STRINGS[key].en || STRINGS[key].en.trim() === "") {
        missing.push(key);
      }
    }
    expect(missing, `Keys with empty 'en' value: ${missing.join(", ")}`).toHaveLength(0);
  });

  it("every key in STRINGS has a non-empty Arabic value", () => {
    const missing: string[] = [];
    for (const key of keys) {
      if (!STRINGS[key].ar || STRINGS[key].ar.trim() === "") {
        missing.push(key);
      }
    }
    expect(missing, `Keys with empty 'ar' value: ${missing.join(", ")}`).toHaveLength(0);
  });

  it("every key in STRINGS has a corresponding entry in STRINGS_FR", () => {
    const missing = keys.filter((key) => !(key in STRINGS_FR));
    expect(
      missing,
      `Keys missing from STRINGS_FR (add French translations for): ${missing.join(", ")}`,
    ).toHaveLength(0);
  });

  it("every key in STRINGS_FR has a non-empty French value", () => {
    const empty: string[] = [];
    for (const key of Object.keys(STRINGS_FR)) {
      if (!STRINGS_FR[key] || STRINGS_FR[key].trim() === "") {
        empty.push(key);
      }
    }
    expect(empty, `Keys with empty French value: ${empty.join(", ")}`).toHaveLength(0);
  });

  it("STRINGS_FR contains no keys that are absent from STRINGS (no orphans)", () => {
    const stringsKeySet = new Set(keys);
    const orphans = Object.keys(STRINGS_FR).filter((key) => !stringsKeySet.has(key));
    expect(
      orphans,
      `Keys in STRINGS_FR not present in STRINGS (stale translations): ${orphans.join(", ")}`,
    ).toHaveLength(0);
  });

  it("every key in STRINGS has a corresponding entry in STRINGS_EL", () => {
    const missing = keys.filter((key) => !(key in STRINGS_EL));
    expect(
      missing,
      `Keys missing from STRINGS_EL (add Greek translations for): ${missing.join(", ")}`,
    ).toHaveLength(0);
  });

  it("every key in STRINGS_EL has a non-empty Greek value", () => {
    const empty: string[] = [];
    for (const key of Object.keys(STRINGS_EL)) {
      if (!STRINGS_EL[key] || STRINGS_EL[key].trim() === "") {
        empty.push(key);
      }
    }
    expect(empty, `Keys with empty Greek value: ${empty.join(", ")}`).toHaveLength(0);
  });

  it("STRINGS_EL contains no keys that are absent from STRINGS (no orphans)", () => {
    const stringsKeySet = new Set(keys);
    const orphans = Object.keys(STRINGS_EL).filter((key) => !stringsKeySet.has(key));
    expect(
      orphans,
      `Keys in STRINGS_EL not present in STRINGS (stale translations): ${orphans.join(", ")}`,
    ).toHaveLength(0);
  });
});

describe("on-demand locale tables", () => {
  it.each(["en", "ar", "fr", "el"] as const)(
    "loads and caches the %s table",
    async (language) => {
      const locale = loadLocaleStrings(language);

      expect(locale).not.toBeNull();
      expect(loadLocaleStrings(language)).toBe(locale);
      await expect(locale!).resolves.toEqual(expect.any(Object));
    },
  );

  it("keeps French and Greek tables distinct", async () => {
    const french = loadLocaleStrings("fr")!;
    const greek = loadLocaleStrings("el")!;

    await expect(french!).resolves.toBe(STRINGS_FR);
    await expect(greek!).resolves.toBe(STRINGS_EL);
    expect(await french).not.toBe(await greek);
  });
});
