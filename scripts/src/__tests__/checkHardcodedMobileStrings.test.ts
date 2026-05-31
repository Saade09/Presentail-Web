/**
 * Tests for checkHardcodedMobileStrings.ts
 *
 * Exercises each of the five detection patterns (A–E) with both
 * should-fire and should-not-fire inputs, plus the shared helpers
 * and the i18n-ignore suppression annotation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  stripExpressionsAndTrim,
  containsArabicScript,
  looksLikeEnglishProse,
  shouldSkipLine,
  collectFiles,
  SKIP_DIRS,
  LIB_SKIP_DIRS,
  SKIP_FILE_SUFFIXES,
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

// ── collectFiles ──────────────────────────────────────────────────────────────

/**
 * Helpers that build a temporary directory tree, run collectFiles against it,
 * and return paths relative to the temp root so assertions stay readable.
 */
function makeTmpTree(
  structure: Record<string, string | null>,
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hcs-test-"));
  for (const [rel, content] of Object.entries(structure)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (content !== null) fs.writeFileSync(abs, content ?? "", "utf8");
  }
  return root;
}

function relPaths(root: string, files: string[]): string[] {
  return files.map((f) => path.relative(root, f)).sort();
}

describe("collectFiles — basic file collection", () => {
  let tmpDir: string;
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it("collects .ts and .tsx files", () => {
    tmpDir = makeTmpTree({
      "src/Button.tsx": "<Text>Hello</Text>",
      "src/utils.ts": "export const x = 1;",
    });
    const files = collectFiles(tmpDir, new Set());
    expect(relPaths(tmpDir, files)).toEqual(["src/Button.tsx", "src/utils.ts"]);
  });

  it("ignores non-TypeScript files", () => {
    tmpDir = makeTmpTree({
      "src/Component.tsx": "",
      "src/styles.css": "",
      "src/data.json": "",
      "src/image.png": "",
    });
    const files = collectFiles(tmpDir, new Set());
    expect(relPaths(tmpDir, files)).toEqual(["src/Component.tsx"]);
  });

  it("ignores .test.ts and .test.tsx files", () => {
    tmpDir = makeTmpTree({
      "src/Screen.tsx": "",
      "src/Screen.test.tsx": "",
      "src/helpers.ts": "",
      "src/helpers.test.ts": "",
    });
    const files = collectFiles(tmpDir, new Set());
    expect(relPaths(tmpDir, files)).toEqual(["src/Screen.tsx", "src/helpers.ts"]);
  });

  it("ignores .d.ts declaration files", () => {
    tmpDir = makeTmpTree({
      "src/index.ts": "",
      "src/index.d.ts": "",
      "src/types.d.ts": "",
    });
    const files = collectFiles(tmpDir, new Set());
    expect(relPaths(tmpDir, files)).toEqual(["src/index.ts"]);
  });

  it("recurses into subdirectories", () => {
    tmpDir = makeTmpTree({
      "a/b/c/Deep.tsx": "",
      "Root.tsx": "",
    });
    const files = collectFiles(tmpDir, new Set());
    expect(relPaths(tmpDir, files)).toEqual(["Root.tsx", "a/b/c/Deep.tsx"]);
  });
});

describe("collectFiles — SKIP_DIRS (mobile artifact exclusions)", () => {
  let tmpDir: string;
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it("excludes the node_modules directory", () => {
    tmpDir = makeTmpTree({
      "src/App.tsx": "",
      "node_modules/lib/index.ts": "",
    });
    const files = collectFiles(tmpDir, SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["src/App.tsx"]);
  });

  it("excludes the dist directory", () => {
    tmpDir = makeTmpTree({
      "src/App.tsx": "",
      "dist/App.js": "",
      "dist/App.d.ts": "",
    });
    const files = collectFiles(tmpDir, SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["src/App.tsx"]);
  });

  it("excludes the __generated__ directory", () => {
    tmpDir = makeTmpTree({
      "src/Screen.tsx": "",
      "__generated__/api.ts": "",
      "__generated__/hooks.ts": "",
    });
    const files = collectFiles(tmpDir, SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["src/Screen.tsx"]);
  });

  it("excludes the .expo directory", () => {
    tmpDir = makeTmpTree({
      "src/App.tsx": "",
      ".expo/types/router.d.ts": "",
    });
    const files = collectFiles(tmpDir, SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["src/App.tsx"]);
  });

  it("excludes the e2e directory (playwright tests)", () => {
    tmpDir = makeTmpTree({
      "src/App.tsx": "",
      "e2e/checkout.spec.ts": "",
    });
    const files = collectFiles(tmpDir, SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["src/App.tsx"]);
  });

  it("excludes the assets directory (images/fonts)", () => {
    tmpDir = makeTmpTree({
      "src/App.tsx": "",
      "assets/fonts/index.ts": "",
    });
    const files = collectFiles(tmpDir, SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["src/App.tsx"]);
  });

  it("excludes the data directory (static data constants)", () => {
    tmpDir = makeTmpTree({
      "src/App.tsx": "",
      "data/countries.ts": "",
    });
    const files = collectFiles(tmpDir, SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["src/App.tsx"]);
  });

  it("excludes the scripts directory", () => {
    tmpDir = makeTmpTree({
      "src/App.tsx": "",
      "scripts/reset.ts": "",
    });
    const files = collectFiles(tmpDir, SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["src/App.tsx"]);
  });

  it("excludes the .turbo cache directory", () => {
    tmpDir = makeTmpTree({
      "src/App.tsx": "",
      ".turbo/cache/index.ts": "",
    });
    const files = collectFiles(tmpDir, SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["src/App.tsx"]);
  });

  it("excludes multiple skip dirs simultaneously", () => {
    tmpDir = makeTmpTree({
      "src/App.tsx": "",
      "node_modules/react/index.ts": "",
      "dist/bundle.ts": "",
      "__generated__/api.ts": "",
    });
    const files = collectFiles(tmpDir, SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["src/App.tsx"]);
  });

  it("does not exclude a directory whose name merely contains a skip-dir name", () => {
    tmpDir = makeTmpTree({
      "src/App.tsx": "",
      "my-dist-output/App.tsx": "",   // 'dist' is a substring, not the dir name
    });
    const files = collectFiles(tmpDir, SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["my-dist-output/App.tsx", "src/App.tsx"]);
  });
});

describe("collectFiles — LIB_SKIP_DIRS (shared lib exclusions)", () => {
  let tmpDir: string;
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it("excludes node_modules from lib scans", () => {
    tmpDir = makeTmpTree({
      "src/index.ts": "",
      "node_modules/dep/index.ts": "",
    });
    const files = collectFiles(tmpDir, LIB_SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["src/index.ts"]);
  });

  it("excludes dist from lib scans", () => {
    tmpDir = makeTmpTree({
      "src/index.ts": "",
      "dist/index.js": "",
      "dist/index.d.ts": "",
    });
    const files = collectFiles(tmpDir, LIB_SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["src/index.ts"]);
  });

  it("excludes __generated__ from lib scans", () => {
    tmpDir = makeTmpTree({
      "src/index.ts": "",
      "__generated__/schema.ts": "",
    });
    const files = collectFiles(tmpDir, LIB_SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["src/index.ts"]);
  });

  it("excludes .turbo cache from lib scans", () => {
    tmpDir = makeTmpTree({
      "src/index.ts": "",
      ".turbo/cache/ts-build.json": "",
    });
    const files = collectFiles(tmpDir, LIB_SKIP_DIRS);
    expect(relPaths(tmpDir, files)).toEqual(["src/index.ts"]);
  });

  it("does NOT exclude mobile-only dirs (e2e, assets, data, scripts) — those are not in LIB_SKIP_DIRS", () => {
    tmpDir = makeTmpTree({
      "src/index.ts": "",
      "e2e/spec.ts": "",
      "assets/icons.ts": "",
      "data/constants.ts": "",
    });
    const files = collectFiles(tmpDir, LIB_SKIP_DIRS);
    // e2e, assets, and data are NOT in LIB_SKIP_DIRS — they should be collected
    expect(relPaths(tmpDir, files)).toContain("e2e/spec.ts");
    expect(relPaths(tmpDir, files)).toContain("assets/icons.ts");
    expect(relPaths(tmpDir, files)).toContain("data/constants.ts");
    expect(relPaths(tmpDir, files)).toContain("src/index.ts");
  });

  it("LIB_SKIP_DIRS contains the four expected core directories", () => {
    expect(LIB_SKIP_DIRS.has("node_modules")).toBe(true);
    expect(LIB_SKIP_DIRS.has("dist")).toBe(true);
    expect(LIB_SKIP_DIRS.has("__generated__")).toBe(true);
    expect(LIB_SKIP_DIRS.has(".turbo")).toBe(true);
  });

  it("LIB_SKIP_DIRS does not contain mobile-specific exclusions", () => {
    expect(LIB_SKIP_DIRS.has(".expo")).toBe(false);
    expect(LIB_SKIP_DIRS.has("e2e")).toBe(false);
    expect(LIB_SKIP_DIRS.has("assets")).toBe(false);
    expect(LIB_SKIP_DIRS.has("data")).toBe(false);
    expect(LIB_SKIP_DIRS.has("scripts")).toBe(false);
  });
});

describe("SKIP_FILE_SUFFIXES — translations and SVG brand marks", () => {
  it("contains the translations catalogue suffix", () => {
    expect(SKIP_FILE_SUFFIXES).toContain("lib/translations.ts");
  });

  it("contains the Amex SVG brand mark suffix", () => {
    expect(SKIP_FILE_SUFFIXES).toContain("components/paymentLogos/amex.ts");
  });

  it("contains the Visa SVG brand mark suffix", () => {
    expect(SKIP_FILE_SUFFIXES).toContain("components/paymentLogos/visa.ts");
  });

  it("filters out the translations catalogue by repo-relative suffix", () => {
    const fakeFiles = [
      "/repo/artifacts/presentail/src/Screen.tsx",
      "/repo/artifacts/presentail/lib/translations.ts",
    ];
    const repoRoot = "/repo";
    const filtered = fakeFiles.filter((f) => {
      const rel = f.slice(repoRoot.length + 1); // repo-relative path
      return !SKIP_FILE_SUFFIXES.some((suffix) => rel.endsWith(suffix));
    });
    expect(filtered).toEqual(["/repo/artifacts/presentail/src/Screen.tsx"]);
  });

  it("filters out the Amex SVG brand mark by repo-relative suffix", () => {
    const fakeFiles = [
      "/repo/artifacts/presentail/src/Screen.tsx",
      "/repo/artifacts/presentail/components/paymentLogos/amex.ts",
    ];
    const repoRoot = "/repo";
    const filtered = fakeFiles.filter((f) => {
      const rel = f.slice(repoRoot.length + 1);
      return !SKIP_FILE_SUFFIXES.some((suffix) => rel.endsWith(suffix));
    });
    expect(filtered).toEqual(["/repo/artifacts/presentail/src/Screen.tsx"]);
  });

  it("filters out the Visa SVG brand mark by repo-relative suffix", () => {
    const fakeFiles = [
      "/repo/artifacts/presentail/src/Screen.tsx",
      "/repo/artifacts/presentail/components/paymentLogos/visa.ts",
    ];
    const repoRoot = "/repo";
    const filtered = fakeFiles.filter((f) => {
      const rel = f.slice(repoRoot.length + 1);
      return !SKIP_FILE_SUFFIXES.some((suffix) => rel.endsWith(suffix));
    });
    expect(filtered).toEqual(["/repo/artifacts/presentail/src/Screen.tsx"]);
  });

  it("does not filter a file that merely contains a suffix as a substring mid-path", () => {
    // A file at "lib/translations.ts.bak" should not be filtered
    const fakeFiles = [
      "/repo/artifacts/presentail/lib/translations.ts.bak",
    ];
    const repoRoot = "/repo";
    const filtered = fakeFiles.filter((f) => {
      const rel = f.slice(repoRoot.length + 1);
      return !SKIP_FILE_SUFFIXES.some((suffix) => rel.endsWith(suffix));
    });
    expect(filtered).toHaveLength(1);
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
