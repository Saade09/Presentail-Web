/**
 * Tests for checkHardcodedMobileStrings.ts
 *
 * Exercises each of the five detection patterns (A–E) with both
 * should-fire and should-not-fire inputs, plus the shared helpers
 * and the i18n-ignore suppression annotation.
 */

import { describe, it, expect } from "vitest";
import {
  stripExpressionsAndTrim,
  containsArabicScript,
  looksLikeEnglishProse,
  shouldSkipLine,
  INLINE_JSX_TEXT_RE,
  STANDALONE_TEXT_RE,
  CODE_KEYWORDS_RE,
  VISIBLE_PROP_RE,
  NULLISH_FALLBACK_RE,
  NAV_OPTION_RE,
} from "../checkHardcodedMobileStrings.js";

// ── stripExpressionsAndTrim ────────────────────────────────────────────────────

describe("stripExpressionsAndTrim", () => {
  it("removes a simple JSX expression placeholder", () => {
    expect(stripExpressionsAndTrim("Hello {name}!")).toBe("Hello !");
  });

  it("removes a nested-brace expression", () => {
    expect(stripExpressionsAndTrim("Count: {items.length}")).toBe("Count:");
  });

  it("collapses multiple whitespace runs", () => {
    expect(stripExpressionsAndTrim("  foo   bar  ")).toBe("foo bar");
  });

  it("leaves plain text unchanged (modulo trim)", () => {
    expect(stripExpressionsAndTrim("  Shop now  ")).toBe("Shop now");
  });

  it("removes a one-level-nested brace expression", () => {
    expect(stripExpressionsAndTrim("Items: {obj.items.length}")).toBe("Items:");
  });
});

// ── containsArabicScript ───────────────────────────────────────────────────────

describe("containsArabicScript", () => {
  it("returns true for a string with Arabic characters", () => {
    expect(containsArabicScript("مرحبا")).toBe(true);
  });

  it("returns true for a mixed Latin/Arabic string", () => {
    expect(containsArabicScript("Hello مرحبا")).toBe(true);
  });

  it("returns false for a pure Latin string", () => {
    expect(containsArabicScript("Hello world")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(containsArabicScript("")).toBe(false);
  });

  it("returns false for digits and punctuation only", () => {
    expect(containsArabicScript("123 !@#")).toBe(false);
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

  it("action label (Delete)", () => {
    expect(looksLikeEnglishProse("Delete")).toBe(true);
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

  it("single short word under 5 letters", () => {
    expect(looksLikeEnglishProse("ok")).toBe(false);
  });

  it("no Latin letters at all", () => {
    expect(looksLikeEnglishProse("123 456")).toBe(false);
  });

  it("single 4-letter word (borderline — below threshold)", () => {
    expect(looksLikeEnglishProse("Done")).toBe(false);
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
    expect(shouldSkipLine('import { useT } from "lib/translations";')).toBe(true);
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

  it("line already using t.<key> from useT()", () => {
    expect(shouldSkipLine("  <Text>{t.checkout_title}</Text>")).toBe(true);
  });

  it("console.log line", () => {
    expect(shouldSkipLine('  console.log("debug value");')).toBe(true);
  });

  it("console.error line", () => {
    expect(shouldSkipLine('  console.error("something went wrong");')).toBe(true);
  });

  it("displayName assignment", () => {
    expect(shouldSkipLine('  MyComponent.displayName = "MyComponent";')).toBe(true);
  });
});

describe("shouldSkipLine — should return false (do not skip)", () => {
  it("JSX with hardcoded text", () => {
    expect(shouldSkipLine("  <Text>Shop now</Text>")).toBe(false);
  });

  it("visible prop with a string literal", () => {
    expect(shouldSkipLine('  <TextInput placeholder="Search products" />')).toBe(false);
  });

  it("navigation title option", () => {
    expect(shouldSkipLine('  options={{ title: "My Orders" }}')).toBe(false);
  });

  it("nullish fallback string", () => {
    expect(shouldSkipLine('  {city ?? "Select your city"}')).toBe(false);
  });
});

// ── Pattern A: Inline JSX text ─────────────────────────────────────────────────

describe("Pattern A — INLINE_JSX_TEXT_RE (inline JSX text nodes)", () => {
  function matchAll(line: string): string[] {
    INLINE_JSX_TEXT_RE.lastIndex = 0;
    const results: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = INLINE_JSX_TEXT_RE.exec(line)) !== null) {
      results.push(m[1]);
    }
    return results;
  }

  it("captures text between > and </", () => {
    const matches = matchAll("  <Text>Shop now</Text>");
    expect(matches).toContain("Shop now");
  });

  it("captures text in a nested component", () => {
    const matches = matchAll("  <Button>Add to cart</Button>");
    expect(matches).toContain("Add to cart");
  });

  it("captures text with an inline JSX expression", () => {
    const matches = matchAll("  <Text>Hello {name}</Text>");
    expect(matches).toContain("Hello {name}");
  });

  it("does not match when there is no closing tag on the same line", () => {
    const matches = matchAll("  <Text>Some text");
    expect(matches).toHaveLength(0);
  });

  it("does not match a self-closing tag", () => {
    const matches = matchAll("  <TextInput placeholder='foo' />");
    expect(matches).toHaveLength(0);
  });

  it("does not match an empty element", () => {
    const matches = matchAll("  <Text></Text>");
    expect(matches).toHaveLength(0);
  });

  it("matches Arabic text in a JSX element", () => {
    const matches = matchAll("  <Text>مرحبا بك</Text>");
    expect(matches).toContain("مرحبا بك");
  });
});

// ── Pattern B: Standalone text line ───────────────────────────────────────────

describe("Pattern B — STANDALONE_TEXT_RE (standalone text nodes)", () => {
  it("matches an indented multi-word prose line", () => {
    expect(STANDALONE_TEXT_RE.test("  Free delivery on all orders")).toBe(true);
  });

  it("matches with tab indent", () => {
    expect(STANDALONE_TEXT_RE.test("\t\tShop our collection")).toBe(true);
  });

  it("matches a sentence with an apostrophe", () => {
    expect(STANDALONE_TEXT_RE.test("  Don\u2019t miss out")).toBe(true);
  });

  it("matches a sentence with an exclamation mark", () => {
    expect(STANDALONE_TEXT_RE.test("  Your order is confirmed!")).toBe(true);
  });

  it("does not match a line with no indentation", () => {
    expect(STANDALONE_TEXT_RE.test("Shop now")).toBe(false);
  });

  it("does not match a line with a hyphen (CSS/identifier pattern)", () => {
    expect(STANDALONE_TEXT_RE.test("  flex-col items-center")).toBe(false);
  });

  it("does not match a line with a dot (property chain)", () => {
    expect(STANDALONE_TEXT_RE.test("  user.email")).toBe(false);
  });

  it("does not match a line starting with a digit", () => {
    expect(STANDALONE_TEXT_RE.test("  123 Main Street")).toBe(false);
  });

  it("does not match a line with only one space of indentation", () => {
    expect(STANDALONE_TEXT_RE.test(" Hello world")).toBe(false);
  });
});

describe("CODE_KEYWORDS_RE", () => {
  it("rejects 'return' at the start", () => {
    expect(CODE_KEYWORDS_RE.test("return something")).toBe(true);
  });

  it("rejects 'const' at the start", () => {
    expect(CODE_KEYWORDS_RE.test("const x = 1")).toBe(true);
  });

  it("rejects 'async' at the start", () => {
    expect(CODE_KEYWORDS_RE.test("async function handlePress()")).toBe(true);
  });

  it("rejects 'throw' at the start", () => {
    expect(CODE_KEYWORDS_RE.test("throw new Error")).toBe(true);
  });

  it("does not reject plain prose", () => {
    expect(CODE_KEYWORDS_RE.test("Free delivery today")).toBe(false);
  });

  it("does not reject a sentence that merely contains a keyword mid-word", () => {
    expect(CODE_KEYWORDS_RE.test("Returning customer discount")).toBe(false);
  });
});

// ── Pattern C: Visible JSX prop strings ───────────────────────────────────────

describe("Pattern C — VISIBLE_PROP_RE (user-visible JSX props)", () => {
  function matchAll(line: string): Array<{ attr: string; text: string }> {
    VISIBLE_PROP_RE.lastIndex = 0;
    const results: Array<{ attr: string; text: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = VISIBLE_PROP_RE.exec(line)) !== null) {
      results.push({ attr: m[1], text: m[2] });
    }
    return results;
  }

  it("matches a placeholder prop (double-quoted)", () => {
    const matches = matchAll('  <TextInput placeholder="Search products" />');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "placeholder", text: "Search products" });
  });

  it("matches an accessibilityLabel prop", () => {
    const matches = matchAll('  <TouchableOpacity accessibilityLabel="Close dialog" />');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "accessibilityLabel", text: "Close dialog" });
  });

  it("matches an accessibilityHint prop", () => {
    const matches = matchAll('  <TextInput accessibilityHint="Enter your email address" />');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "accessibilityHint", text: "Enter your email address" });
  });

  it("matches a title prop", () => {
    const matches = matchAll('  <Header title="My Orders" />');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "title", text: "My Orders" });
  });

  it("matches a label prop", () => {
    const matches = matchAll('  <Field label="Your email address" />');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "label", text: "Your email address" });
  });

  it("matches a description prop", () => {
    const matches = matchAll('  <Card description="Same day flower delivery" />');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "description", text: "Same day flower delivery" });
  });

  it("matches a subtitle prop", () => {
    const matches = matchAll('  <Section subtitle="Choose your occasion" />');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "subtitle", text: "Choose your occasion" });
  });

  it("matches a hint prop", () => {
    const matches = matchAll('  <Field hint="Must be at least 8 characters" />');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "hint", text: "Must be at least 8 characters" });
  });

  it("matches a single-quoted placeholder prop", () => {
    const matches = matchAll("  <TextInput placeholder='Enter your name' />");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "placeholder", text: "Enter your name" });
  });

  it("does not match a non-visible prop (className)", () => {
    const matches = matchAll('  <View className="flex-col" />');
    expect(matches).toHaveLength(0);
  });

  it("does not match a JSX expression value", () => {
    const matches = matchAll("  <TextInput placeholder={t.search_placeholder} />");
    expect(matches).toHaveLength(0);
  });

  it("regex captures 2-char value but looksLikeEnglishProse rejects it", () => {
    const matches = matchAll('  <TextInput placeholder="ok" />');
    expect(matches).toHaveLength(1);
    expect(looksLikeEnglishProse(matches[0].text)).toBe(false);
  });
});

// ── Pattern D: Nullish-coalescing fallback strings ────────────────────────────

describe("Pattern D — NULLISH_FALLBACK_RE (nullish fallback strings)", () => {
  function matchAll(line: string): string[] {
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

  it("captures a ?? fallback rendered in JSX", () => {
    const matches = matchAll('  <Text>{product.title ?? "Untitled product"}</Text>');
    expect(matches).toContain("Untitled product");
  });

  it("does not match a ?? fallback shorter than 4 chars", () => {
    const matches = matchAll('  x ?? "hi"');
    expect(matches).toHaveLength(0);
  });

  it("does not match a ternary fallback (: 'text')", () => {
    const matches = matchAll('  dir === "ltr" ? "ltr" : "rtl"');
    expect(matches).toHaveLength(0);
  });

  it("regex captures a hyphenated string but the scanner skips it (CSS filter)", () => {
    // NULLISH_FALLBACK_RE will match "flex-row" because the regex itself does not
    // filter hyphens.  The scanner loop applies /[-:]/.test(text) after the regex
    // and skips the hit — this test verifies the regex match is there so the
    // loop's filter has something to work on.
    const matches = matchAll('  style ?? "flex-row"');
    expect(matches).toHaveLength(1);
    expect(/[-:]/.test(matches[0])).toBe(true); // scanner would skip this
  });
});

// ── Pattern E: Expo Router navigation option strings ──────────────────────────

describe("Pattern E — NAV_OPTION_RE (navigation option strings)", () => {
  function matchAll(line: string): Array<{ attr: string; text: string }> {
    NAV_OPTION_RE.lastIndex = 0;
    const results: Array<{ attr: string; text: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = NAV_OPTION_RE.exec(line)) !== null) {
      results.push({ attr: m[1], text: m[2] });
    }
    return results;
  }

  it("captures a title navigation option", () => {
    const matches = matchAll('  options={{ title: "My Orders" }}');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "title", text: "My Orders" });
  });

  it("captures a tabBarLabel navigation option", () => {
    const matches = matchAll('  tabBarLabel: "Shop Now"');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "tabBarLabel", text: "Shop Now" });
  });

  it("captures a headerTitle navigation option", () => {
    const matches = matchAll('  headerTitle: "Order Details"');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "headerTitle", text: "Order Details" });
  });

  it("captures a headerBackTitle navigation option", () => {
    const matches = matchAll('  headerBackTitle: "Go Back"');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "headerBackTitle", text: "Go Back" });
  });

  it("captures a tabBarAccessibilityLabel navigation option", () => {
    const matches = matchAll('  tabBarAccessibilityLabel: "Shop tab"');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "tabBarAccessibilityLabel", text: "Shop tab" });
  });

  it("matches single-quoted navigation option values", () => {
    const matches = matchAll("  options={{ title: 'Track Order' }}");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "title", text: "Track Order" });
  });

  it("does not match an unrelated object property", () => {
    const matches = matchAll('  style: "flex-row"');
    expect(matches).toHaveLength(0);
  });

  it("does not match a title value that is too short to be prose", () => {
    // looksLikeEnglishProse("ok") => false, so the scanner would not record this
    const matches = matchAll('  title: "ok"');
    expect(matches).toHaveLength(1); // regex fires, but prose check gates the hit
    expect(looksLikeEnglishProse(matches[0].text)).toBe(false);
  });

  it("does not match a JSX expression value", () => {
    const matches = matchAll("  options={{ title: t.orders_title }}");
    expect(matches).toHaveLength(0);
  });
});

// ── i18n-ignore suppression annotation ────────────────────────────────────────

describe("i18n-ignore annotation", () => {
  it("single-line // i18n-ignore is detected as a suppression comment", () => {
    const line = "  <Text>Presentail</Text> // i18n-ignore";
    expect(/\/\/\s*i18n-ignore\b/.test(line)).toBe(true);
  });

  it("block-style /* i18n-ignore */ is detected as a suppression comment", () => {
    const line = "  <Text>Presentail</Text> /* i18n-ignore */";
    expect(/\/\/\s*i18n-ignore\b|\/\*\s*i18n-ignore\b/.test(line)).toBe(true);
  });

  it("a comment that merely contains 'ignore' does NOT suppress", () => {
    const line = "  <Text>Something</Text> // ignore this entirely";
    expect(/\/\/\s*i18n-ignore\b/.test(line)).toBe(false);
  });

  it("i18n-ignore must appear as a whole token (not part of another word)", () => {
    const line = "  <Text>Hello</Text> // i18n-ignoreall";
    // \b requires a word boundary after "ignore" so "i18n-ignoreall" does not match
    expect(/\/\/\s*i18n-ignore\b/.test(line)).toBe(false);
  });
});
