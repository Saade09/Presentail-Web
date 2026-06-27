import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// @ts-expect-error - mjs module without type declarations.
import { RETURN_WINDOW_DAYS } from "../../seo-inject.mjs";
import { FAQ_COPY } from "../data/faqsCopy.js";

// ---------------------------------------------------------------------------
// Guards that the 7-day returns window declared in seo-inject.mjs
// (RETURN_WINDOW_DAYS — used in the MerchantReturnPolicy JSON-LD) stays in sync
// with the human-readable copy on /faqs (src/data/faqsCopy.js) and /terms
// (src/pages/Terms.tsx). Google penalises return-policy mismatches, so if the
// window is changed in one place this test fails until every surface agrees.
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Locates the satisfaction-guarantee "send us a photo within N <days>" sentence
// in each locale and captures N. Scoped to the photo sentence so it never
// collides with unrelated day counts (e.g. "removed within 15 days").
const FAQ_RETURN_WINDOW_PATTERNS: Record<string, RegExp> = {
  en: /photo within\s+(\d+)\s+days/i,
  fr: /photo sous\s+(\d+)\s+jours/i,
  // Arabic: "أرسل لنا صورة خلال 7 أيام" — "send us a photo within 7 days".
  ar: /\u0635\u0648\u0631\u0629 \u062e\u0644\u0627\u0644\s+(\d+)\s+\u0623\u064a\u0627\u0645/,
};

function findReturnWindowInFaq(lang: string, pattern: RegExp): number {
  const copy = (FAQ_COPY as Record<string, any>)[lang];
  expect(copy, `FAQ_COPY missing locale "${lang}"`).toBeTruthy();

  const matches: number[] = [];
  for (const group of copy.groups) {
    for (const item of group.items) {
      const m = pattern.exec(item.a);
      if (m) matches.push(Number(m[1]));
    }
  }

  expect(
    matches.length,
    `Expected exactly one returns-window sentence in the "${lang}" FAQ copy, found ${matches.length}. ` +
      `If you reworded the satisfaction-guarantee answer, update FAQ_RETURN_WINDOW_PATTERNS in this test.`,
  ).toBe(1);

  return matches[0];
}

describe("returns window stays in sync across SEO JSON-LD, FAQ and Terms", () => {
  it("exposes a positive integer RETURN_WINDOW_DAYS from seo-inject", () => {
    expect(Number.isInteger(RETURN_WINDOW_DAYS)).toBe(true);
    expect(RETURN_WINDOW_DAYS).toBeGreaterThan(0);
  });

  for (const [lang, pattern] of Object.entries(FAQ_RETURN_WINDOW_PATTERNS)) {
    it(`FAQ (${lang}) states the same returns window as the JSON-LD`, () => {
      expect(findReturnWindowInFaq(lang, pattern)).toBe(RETURN_WINDOW_DAYS);
    });
  }

  it("Terms page states the same returns window as the JSON-LD", () => {
    const termsPath = path.resolve(__dirname, "../pages/Terms.tsx");
    const terms = fs.readFileSync(termsPath, "utf8");

    // Terms spells the window as a word ("within seven days"); accept either the
    // word or a digit form so a future numeric edit still passes when consistent.
    const numberWords = [
      "zero",
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
      "ten",
      "eleven",
      "twelve",
    ];
    const word = numberWords[RETURN_WINDOW_DAYS];

    const matches = [
      ...terms.matchAll(/reported to us within\s+([a-z]+|\d+)\s+days/gi),
    ].map((m) => m[1].toLowerCase());

    expect(
      matches.length,
      "Expected exactly one returns-window sentence in Terms.tsx. " +
        "If you reworded it, update the regex in this test.",
    ).toBe(1);

    const stated = matches[0];
    const expected = new Set<string>([String(RETURN_WINDOW_DAYS)]);
    if (word) expected.add(word);

    expect(
      expected.has(stated),
      `Terms.tsx says the returns window is "${stated}" but RETURN_WINDOW_DAYS is ${RETURN_WINDOW_DAYS}` +
        (word ? ` ("${word}")` : "") +
        ". Update Terms.tsx and the FAQ copy together so the structured data and visible policy agree.",
    ).toBe(true);
  });
});
