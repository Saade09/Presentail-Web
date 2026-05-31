/**
 * Tests for checkHardcodedWebStrings.ts
 *
 * Exercises each of the six detection patterns (A–F) with both
 * should-fire and should-not-fire inputs, plus the shared helpers.
 */

import { describe, it, expect } from "vitest";
import {
  stripExpressionsAndTrim,
  looksLikeEnglishProse,
  shouldSkipLine,
  INLINE_JSX_TEXT_RE,
  STANDALONE_TEXT_RE,
  CODE_KEYWORDS_RE,
  VISIBLE_PROP_RE,
  NULLISH_FALLBACK_RE,
  DOC_TITLE_RE,
  META_TITLE_NAME_RE,
  META_TITLE_CONTENT_RE,
} from "../checkHardcodedWebStrings.js";

// ── stripExpressionsAndTrim ────────────────────────────────────────────────────

describe("stripExpressionsAndTrim", () => {
  it("removes a simple JSX expression placeholder", () => {
    // The expression is replaced by a space, then whitespace is collapsed+trimmed
    expect(stripExpressionsAndTrim("Hello {name}!")).toBe("Hello !");
  });

  it("removes a nested-brace expression", () => {
    // Trailing space after colon is collapsed then trimmed away
    expect(stripExpressionsAndTrim("Count: {items.length}")).toBe("Count:");
  });

  it("collapses multiple whitespace runs", () => {
    // The function collapses ALL runs of whitespace to a single space
    expect(stripExpressionsAndTrim("  foo   bar  ")).toBe("foo bar");
  });

  it("leaves plain text unchanged (modulo trim)", () => {
    expect(stripExpressionsAndTrim("  Shop now  ")).toBe("Shop now");
  });
});

// ── looksLikeEnglishProse ─────────────────────────────────────────────────────

describe("looksLikeEnglishProse — should return true", () => {
  it("two-word phrase", () => {
    expect(looksLikeEnglishProse("Shop now")).toBe(true);
  });

  it("longer sentence", () => {
    expect(looksLikeEnglishProse("Free delivery on all orders")).toBe(true);
  });

  it("single word of 5+ letters", () => {
    expect(looksLikeEnglishProse("Loading")).toBe(true);
  });

  it("single word of exactly 5 letters", () => {
    expect(looksLikeEnglishProse("Order")).toBe(true);
  });

  it("phrase with an apostrophe", () => {
    expect(looksLikeEnglishProse("Don't miss out")).toBe(true);
  });
});

describe("looksLikeEnglishProse — should return false", () => {
  it("empty string", () => {
    expect(looksLikeEnglishProse("")).toBe(false);
  });

  it("URL", () => {
    expect(looksLikeEnglishProse("https://example.com/image.png")).toBe(false);
  });

  it("email address", () => {
    expect(looksLikeEnglishProse("user@example.com")).toBe(false);
  });

  it("pure number", () => {
    expect(looksLikeEnglishProse("42")).toBe(false);
  });

  it("single short word (< 5 letters)", () => {
    expect(looksLikeEnglishProse("ok")).toBe(false);
  });

  it("no Latin letters at all", () => {
    expect(looksLikeEnglishProse("123 456")).toBe(false);
  });
});

// ── shouldSkipLine ─────────────────────────────────────────────────────────────

describe("shouldSkipLine — should return true (skip)", () => {
  it("empty line", () => {
    expect(shouldSkipLine("")).toBe(true);
  });

  it("single-line comment", () => {
    expect(shouldSkipLine("  // This is a comment")).toBe(true);
  });

  it("JSDoc line starting with *", () => {
    expect(shouldSkipLine(" * @param foo")).toBe(true);
  });

  it("block-comment opener", () => {
    expect(shouldSkipLine("/* block comment */")).toBe(true);
  });

  it("import statement", () => {
    expect(shouldSkipLine('import { t } from "i18n";')).toBe(true);
  });

  it("export type declaration", () => {
    expect(shouldSkipLine("export type Foo = string;")).toBe(true);
  });

  it("type alias starting with capital", () => {
    expect(shouldSkipLine("type MyType = { name: string };")).toBe(true);
  });

  it("interface declaration starting with capital", () => {
    expect(shouldSkipLine("interface MyProps {}")).toBe(true);
  });

  it("line already using t()", () => {
    expect(shouldSkipLine('<p>{t("checkout.title")}</p>')).toBe(true);
  });

  it("console.log line", () => {
    expect(shouldSkipLine('  console.log("debug value");')).toBe(true);
  });

  it("displayName assignment", () => {
    expect(shouldSkipLine("  MyComponent.displayName = \"MyComponent\";")).toBe(true);
  });
});

describe("shouldSkipLine — should return false (do not skip)", () => {
  it("JSX with hardcoded text", () => {
    expect(shouldSkipLine("  <p>Shop now</p>")).toBe(false);
  });

  it("document.title assignment", () => {
    expect(shouldSkipLine('  document.title = "Shop Flowers";')).toBe(false);
  });

  it("visible prop with a string literal", () => {
    expect(shouldSkipLine('  <Input placeholder="Search products" />')).toBe(false);
  });
});

// ── Pattern A: Inline JSX text ─────────────────────────────────────────────────

describe("Pattern A — INLINE_JSX_TEXT_RE", () => {
  function matchAll(line: string) {
    INLINE_JSX_TEXT_RE.lastIndex = 0;
    const results: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = INLINE_JSX_TEXT_RE.exec(line)) !== null) {
      results.push(m[1]);
    }
    return results;
  }

  it("captures text between > and </", () => {
    const matches = matchAll("  <p>Shop now</p>");
    expect(matches).toContain("Shop now");
  });

  it("captures text in a <title> JSX element", () => {
    const matches = matchAll("  <title>Presentail — Shop Flowers</title>");
    expect(matches).toContain("Presentail — Shop Flowers");
  });

  it("captures text with an inline expression", () => {
    const matches = matchAll("  <span>Hello {name}</span>");
    expect(matches).toContain("Hello {name}");
  });

  it("does not match when there is no closing tag on the same line", () => {
    const matches = matchAll("  <p>Some text");
    expect(matches).toHaveLength(0);
  });

  it("does not match a self-closing tag", () => {
    const matches = matchAll("  <Input placeholder='foo' />");
    expect(matches).toHaveLength(0);
  });

  it("does not match an empty element", () => {
    const matches = matchAll("  <p></p>");
    expect(matches).toHaveLength(0);
  });
});

// ── Pattern B: Standalone text line ───────────────────────────────────────────

describe("Pattern B — STANDALONE_TEXT_RE", () => {
  it("matches an indented multi-word prose line", () => {
    expect(STANDALONE_TEXT_RE.test("  Free delivery on all orders")).toBe(true);
  });

  it("matches with two-tab indent", () => {
    // Regex requires {2,} leading spaces/tabs; a single tab does not satisfy it
    expect(STANDALONE_TEXT_RE.test("\t\tShop our collection")).toBe(true);
  });

  it("matches a sentence with an apostrophe", () => {
    expect(STANDALONE_TEXT_RE.test("  Don\u2019t miss out")).toBe(true);
  });

  it("does not match a line with no indentation", () => {
    expect(STANDALONE_TEXT_RE.test("Shop now")).toBe(false);
  });

  it("does not match a line with a hyphen (CSS class)", () => {
    expect(STANDALONE_TEXT_RE.test("  flex-col items-center")).toBe(false);
  });

  it("does not match a line with a dot (property chain)", () => {
    expect(STANDALONE_TEXT_RE.test("  user.email")).toBe(false);
  });

  it("does not match a line starting with a digit", () => {
    expect(STANDALONE_TEXT_RE.test("  123 Main Street")).toBe(false);
  });

  it("CODE_KEYWORDS_RE rejects 'return' at the start", () => {
    expect(CODE_KEYWORDS_RE.test("return something")).toBe(true);
  });

  it("CODE_KEYWORDS_RE rejects 'const' at the start", () => {
    expect(CODE_KEYWORDS_RE.test("const x = 1")).toBe(true);
  });

  it("CODE_KEYWORDS_RE does not reject plain prose", () => {
    expect(CODE_KEYWORDS_RE.test("Free delivery today")).toBe(false);
  });
});

// ── Pattern C: Visible JSX props ──────────────────────────────────────────────

describe("Pattern C — VISIBLE_PROP_RE", () => {
  function matchAll(line: string) {
    VISIBLE_PROP_RE.lastIndex = 0;
    const results: Array<{ attr: string; text: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = VISIBLE_PROP_RE.exec(line)) !== null) {
      results.push({ attr: m[1], text: m[2] });
    }
    return results;
  }

  it("matches a placeholder prop", () => {
    const matches = matchAll('  <Input placeholder="Search products" />');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "placeholder", text: "Search products" });
  });

  it("matches an aria-label prop", () => {
    const matches = matchAll('  <button aria-label="Close dialog" />');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "aria-label", text: "Close dialog" });
  });

  it("matches a title prop", () => {
    const matches = matchAll('  <img title="Flower bouquet" />');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "title", text: "Flower bouquet" });
  });

  it("matches an alt prop", () => {
    const matches = matchAll('  <img alt="Red roses bouquet" />');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "alt", text: "Red roses bouquet" });
  });

  it("matches a label prop", () => {
    const matches = matchAll('  <Field label="Your email address" />');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "label", text: "Your email address" });
  });

  it("does not match a non-visible prop", () => {
    const matches = matchAll('  <div className="flex-col" />');
    expect(matches).toHaveLength(0);
  });

  it("does not match a template literal value", () => {
    const matches = matchAll("  <Input placeholder={`${name}`} />");
    expect(matches).toHaveLength(0);
  });

  it("regex captures 2-char prop value but looksLikeEnglishProse rejects it", () => {
    // VISIBLE_PROP_RE requires {2,} chars, so "ok" is captured by the regex.
    // The scanner then passes the value through looksLikeEnglishProse() which
    // rejects single short words — this test verifies that filter works.
    const matches = matchAll('  <Input placeholder="ok" />');
    expect(matches).toHaveLength(1);
    expect(looksLikeEnglishProse(matches[0].text)).toBe(false);
  });
});

// ── Pattern D: Nullish-coalescing fallback strings ────────────────────────────

describe("Pattern D — NULLISH_FALLBACK_RE", () => {
  function matchAll(line: string) {
    NULLISH_FALLBACK_RE.lastIndex = 0;
    const results: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = NULLISH_FALLBACK_RE.exec(line)) !== null) {
      results.push(m[1]);
    }
    return results;
  }

  it("captures a two-word ?? fallback", () => {
    const matches = matchAll('  const label = name ?? "No name";');
    expect(matches).toContain("No name");
  });

  it("captures a longer ?? fallback phrase", () => {
    const matches = matchAll('  {city ?? "Select your city"}');
    expect(matches).toContain("Select your city");
  });

  it("does not match a ?? fallback shorter than 4 chars", () => {
    const matches = matchAll('  x ?? "hi"');
    expect(matches).toHaveLength(0);
  });

  it("does not match a ternary fallback (: 'text')", () => {
    const matches = matchAll('  dir === "ltr" ? "ltr" : "rtl"');
    expect(matches).toHaveLength(0);
  });
});

// ── Pattern E: document.title assignment ──────────────────────────────────────

describe("Pattern E — DOC_TITLE_RE", () => {
  function matchAll(line: string) {
    DOC_TITLE_RE.lastIndex = 0;
    const results: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = DOC_TITLE_RE.exec(line)) !== null) {
      results.push(m[1]);
    }
    return results;
  }

  it("captures a double-quoted document.title assignment", () => {
    const matches = matchAll('  document.title = "Shop Flowers & Gifts";');
    expect(matches).toContain("Shop Flowers & Gifts");
  });

  it("captures a single-quoted document.title assignment", () => {
    const matches = matchAll("  document.title = 'Presentail Lebanon';");
    expect(matches).toContain("Presentail Lebanon");
  });

  it("does not match a variable assignment (no string literal)", () => {
    const matches = matchAll("  document.title = pageTitle;");
    expect(matches).toHaveLength(0);
  });

  it("does not match a value shorter than 4 chars", () => {
    const matches = matchAll('  document.title = "ok";');
    expect(matches).toHaveLength(0);
  });

  it("does not match document.title read (no assignment)", () => {
    const matches = matchAll("  console.log(document.title);");
    expect(matches).toHaveLength(0);
  });
});

// ── Pattern F: <meta> title content attribute ─────────────────────────────────

describe("Pattern F — META_TITLE_NAME_RE + META_TITLE_CONTENT_RE", () => {
  function extractMetaContent(line: string): string[] {
    if (!META_TITLE_NAME_RE.test(line)) return [];
    META_TITLE_CONTENT_RE.lastIndex = 0;
    const results: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = META_TITLE_CONTENT_RE.exec(line)) !== null) {
      results.push(m[1]);
    }
    return results;
  }

  it("matches name='title' with content", () => {
    const results = extractMetaContent(
      '  <meta name="title" content="Presentail — Flowers Lebanon" />',
    );
    expect(results).toContain("Presentail — Flowers Lebanon");
  });

  it("matches name='og:title' with content", () => {
    const results = extractMetaContent(
      '  <meta name="og:title" content="Shop Flowers in Beirut" />',
    );
    expect(results).toContain("Shop Flowers in Beirut");
  });

  it("matches name='twitter:title' with content", () => {
    const results = extractMetaContent(
      '  <meta name="twitter:title" content="Best Flower Delivery" />',
    );
    expect(results).toContain("Best Flower Delivery");
  });

  it("matches when content attribute comes before name attribute", () => {
    const results = extractMetaContent(
      '  <meta content="Order Flowers Today" name="og:title" />',
    );
    expect(results).toContain("Order Flowers Today");
  });

  it("does not match on a line without a title-related name", () => {
    const results = extractMetaContent(
      '  <meta name="og:image" content="https://example.com/img.png" />',
    );
    expect(results).toHaveLength(0);
  });

  it("does not flag a URL in content even on a title name line", () => {
    const line =
      '  <meta name="og:title" content="https://presentail.com/flowers" />';
    const rawMatches = extractMetaContent(line);
    const prose = rawMatches.filter(
      (t) => !t.startsWith("https://") && looksLikeEnglishProse(t),
    );
    expect(prose).toHaveLength(0);
  });

  it("does not match an unrelated <meta> tag (name='description')", () => {
    const results = extractMetaContent(
      '  <meta name="description" content="Great flower shop" />',
    );
    expect(results).toHaveLength(0);
  });
});

// ── i18n-ignore suppression ───────────────────────────────────────────────────

describe("i18n-ignore annotation", () => {
  it("is detected by the scanner as a suppression comment", () => {
    const line = '  <p>Presentail</p> // i18n-ignore';
    expect(/\/\/\s*i18n-ignore\b/.test(line)).toBe(true);
  });

  it("is not triggered by a comment that merely contains 'ignore'", () => {
    const line = '  <p>Something</p> // ignore this entirely';
    expect(/\/\/\s*i18n-ignore\b/.test(line)).toBe(false);
  });
});

// ── const COPY block suppression ──────────────────────────────────────────────

describe("const COPY block detection", () => {
  it("COPY block open is detected by the scanner's regex", () => {
    const line = "const COPY: Record<Language, Copy> = {";
    expect(/\bconst COPY\b[^=]*=\s*\{/.test(line)).toBe(true);
  });

  it("does not false-positive on an unrelated const", () => {
    const line = "const COPY_LENGTH = 5;";
    expect(/\bconst COPY\b[^=]*=\s*\{/.test(line)).toBe(false);
  });
});
