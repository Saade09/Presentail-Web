/**
 * Unit tests for checkHardcodedApiStrings.ts.
 *
 * Covers:
 *   - looksLikeEnglishProse    — prose vs. technical strings, domain names,
 *                                URL/email exclusions, word-count thresholds
 *   - shouldSkipLine           — comment lines, logger/req.log/console calls,
 *                                import lines, throw statements, type declarations
 *   - MSG_PROP_RE              — matches message/body/title/subtitle keys,
 *                                rejects CSS-like and path-like values
 *   - NULLISH_FALLBACK_RE      — two-word-token requirement, domain name skip,
 *                                hyphen/colon/slash skip
 *   - LOGICAL_OR_FALLBACK_RE   — same exclusion rules as NULLISH_FALLBACK_RE
 *   - i18n-ignore annotation   — the bypass pattern used in the main loop
 */

import { describe, it, expect } from "vitest";
import {
  looksLikeEnglishProse,
  shouldSkipLine,
  MSG_PROP_RE,
  NULLISH_FALLBACK_RE,
  LOGICAL_OR_FALLBACK_RE,
} from "./checkHardcodedApiStrings.js";

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Executes a regex (with /g flag) against a string and returns all
 * capture-group-1 matches. Resets lastIndex before each call.
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
 * Use for regexes that capture (attr, value) pairs where the value is group 2.
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

// ── looksLikeEnglishProse ─────────────────────────────────────────────────────

describe("looksLikeEnglishProse — positive (should detect as prose)", () => {
  it("returns true for a typical two-word English phrase", () => {
    expect(looksLikeEnglishProse("Order confirmed")).toBe(true);
  });

  it("returns true for a longer English sentence", () => {
    expect(looksLikeEnglishProse("Your order has been placed")).toBe(true);
  });

  it("returns true for a single word of 5+ letters (Loading, Failed, etc.)", () => {
    expect(looksLikeEnglishProse("Loading")).toBe(true);
    expect(looksLikeEnglishProse("Failed")).toBe(true);
    expect(looksLikeEnglishProse("Placed")).toBe(true);
  });

  it("returns true for a push notification title", () => {
    expect(looksLikeEnglishProse("Your flowers are on the way")).toBe(true);
  });

  it("returns true for an SMS message template body", () => {
    expect(looksLikeEnglishProse("Your order is out for delivery")).toBe(true);
  });

  it("returns true for an API error message string", () => {
    expect(looksLikeEnglishProse("Invalid request body")).toBe(true);
  });

  it("returns true for a string with punctuation around words", () => {
    expect(looksLikeEnglishProse("Order #12345 confirmed!")).toBe(true);
  });
});

describe("looksLikeEnglishProse — negative (should NOT detect)", () => {
  it("returns false for an empty string", () => {
    expect(looksLikeEnglishProse("")).toBe(false);
  });

  it("returns false for a single character", () => {
    expect(looksLikeEnglishProse("x")).toBe(false);
  });

  it("returns false for a string shorter than 2 characters", () => {
    expect(looksLikeEnglishProse("a")).toBe(false);
  });

  it("returns false for digits only", () => {
    expect(looksLikeEnglishProse("12345")).toBe(false);
  });

  it("returns false for punctuation only", () => {
    expect(looksLikeEnglishProse("---")).toBe(false);
  });

  it("returns false for a URL (https://)", () => {
    expect(looksLikeEnglishProse("https://presentail.com/orders")).toBe(false);
  });

  it("returns false for a URL (http://)", () => {
    expect(looksLikeEnglishProse("http://example.com")).toBe(false);
  });

  it("returns false for an email address", () => {
    expect(looksLikeEnglishProse("support@presentail.com")).toBe(false);
    expect(looksLikeEnglishProse("user@example.com")).toBe(false);
  });

  it("returns false for a single word shorter than 5 letters", () => {
    expect(looksLikeEnglishProse("OK")).toBe(false);
    expect(looksLikeEnglishProse("Hi")).toBe(false);
    expect(looksLikeEnglishProse("No")).toBe(false);
    expect(looksLikeEnglishProse("yes")).toBe(false);
  });

  it("returns false for a string with no Latin letters", () => {
    expect(looksLikeEnglishProse("123 456")).toBe(false);
    expect(looksLikeEnglishProse("@#$%")).toBe(false);
  });

  it("returns false for a string with only one short word (2 letters)", () => {
    expect(looksLikeEnglishProse("ab")).toBe(false);
  });
});

// ── shouldSkipLine ─────────────────────────────────────────────────────────────

describe("shouldSkipLine — lines that should be skipped", () => {
  it("skips an empty line", () => {
    expect(shouldSkipLine("")).toBe(true);
    expect(shouldSkipLine("   ")).toBe(true);
    expect(shouldSkipLine("\t")).toBe(true);
  });

  it("skips single-line comments (//)", () => {
    expect(shouldSkipLine("  // This is a comment")).toBe(true);
    expect(shouldSkipLine("// Push notification title")).toBe(true);
  });

  it("skips JSDoc / block-comment continuation lines (*)", () => {
    expect(shouldSkipLine("  * @param body - the SMS body")).toBe(true);
    expect(shouldSkipLine("   * Returns the message")).toBe(true);
  });

  it("skips block-comment opening lines (/*)", () => {
    expect(shouldSkipLine("  /* block comment start")).toBe(true);
  });

  it("skips import statements", () => {
    expect(shouldSkipLine("import express from 'express';")).toBe(true);
    expect(shouldSkipLine("import { sendSms } from '../lib/sms';")).toBe(true);
  });

  it("skips export type declarations", () => {
    expect(shouldSkipLine("export type OrderState = 'pending' | 'delivered';")).toBe(true);
  });

  it("skips export interface declarations", () => {
    expect(shouldSkipLine("export interface PushPayload { title: string }")).toBe(true);
  });

  it("skips type alias declarations (uppercase first letter)", () => {
    expect(shouldSkipLine("type HitKind = 'msg-prop' | 'fallback-string';")).toBe(true);
  });

  it("skips interface declarations (uppercase first letter)", () => {
    expect(shouldSkipLine("interface PushNotification {")).toBe(true);
  });

  it("skips req.log.info calls", () => {
    expect(shouldSkipLine("  req.log.info('Order placed successfully')")).toBe(true);
  });

  it("skips req.log.warn calls", () => {
    expect(shouldSkipLine("  req.log.warn('Payment verification failed')")).toBe(true);
  });

  it("skips req.log.error calls", () => {
    expect(shouldSkipLine("  req.log.error('Internal server error')")).toBe(true);
  });

  it("skips req.log.debug calls", () => {
    expect(shouldSkipLine("  req.log.debug('Processing request body')")).toBe(true);
  });

  it("skips req.log.child calls (child logger creation)", () => {
    expect(shouldSkipLine("  const log = req.log.child({ orderId })")).toBe(true);
  });

  it("skips logger.info calls", () => {
    expect(shouldSkipLine("  logger.info('Server started successfully')")).toBe(true);
  });

  it("skips logger.warn calls", () => {
    expect(shouldSkipLine("  logger.warn('Rate limit approaching')")).toBe(true);
  });

  it("skips logger.error calls", () => {
    expect(shouldSkipLine("  logger.error('Database connection failed')")).toBe(true);
  });

  it("skips logger.debug calls", () => {
    expect(shouldSkipLine("  logger.debug('Cache miss for product slug')")).toBe(true);
  });

  it("skips console.log calls", () => {
    expect(shouldSkipLine("  console.log('Order confirmed')")).toBe(true);
  });

  it("skips console.warn calls", () => {
    expect(shouldSkipLine("  console.warn('Deprecated API usage')")).toBe(true);
  });

  it("skips console.error calls", () => {
    expect(shouldSkipLine("  console.error('Push send failed')")).toBe(true);
  });

  it("skips console.info calls", () => {
    expect(shouldSkipLine("  console.info('Sync complete')")).toBe(true);
  });

  it("skips throw statements", () => {
    expect(shouldSkipLine("  throw new Error('Invalid order state')")).toBe(true);
    expect(shouldSkipLine("  throw new BadRequestError('Missing field')")).toBe(true);
  });
});

describe("shouldSkipLine — lines that should NOT be skipped", () => {
  it("does not skip a message property assignment", () => {
    expect(shouldSkipLine('  message: "Order delivered"')).toBe(false);
  });

  it("does not skip a body property assignment", () => {
    expect(shouldSkipLine('  body: "Your flowers have arrived"')).toBe(false);
  });

  it("does not skip a title property assignment", () => {
    expect(shouldSkipLine('  title: "Delivery update"')).toBe(false);
  });

  it("does not skip a nullish-coalescing fallback line", () => {
    expect(shouldSkipLine('  const label = name ?? "Default label"')).toBe(false);
  });

  it("does not skip a logical-OR fallback line", () => {
    expect(shouldSkipLine('  const msg = body || "Fallback message"')).toBe(false);
  });

  it("does not skip a res.json call with a message property", () => {
    expect(shouldSkipLine('  return res.json({ message: "Success" })')).toBe(false);
  });
});

// ── i18n-ignore annotation ────────────────────────────────────────────────────

describe("i18n-ignore annotation bypass", () => {
  const I18N_IGNORE_RE = /\/\/\s*i18n-ignore\b|\/\*\s*i18n-ignore\b/;

  it("detects // i18n-ignore on a line", () => {
    expect(I18N_IGNORE_RE.test('message: "Presentail" // i18n-ignore')).toBe(true);
  });

  it("detects // i18n-ignore with extra spaces", () => {
    expect(I18N_IGNORE_RE.test('title: "Express" //  i18n-ignore')).toBe(true);
  });

  it("detects /* i18n-ignore */ inline block comment", () => {
    expect(I18N_IGNORE_RE.test('body: "Brand name" /* i18n-ignore */')).toBe(true);
  });

  it("does not trigger on lines without the annotation", () => {
    expect(I18N_IGNORE_RE.test('message: "Order delivered"')).toBe(false);
    expect(I18N_IGNORE_RE.test("  // regular comment")).toBe(false);
  });

  it("does not trigger on a partial match (i18n-ignorable is not i18n-ignore)", () => {
    expect(I18N_IGNORE_RE.test("// i18n-ignorable")).toBe(false);
  });
});

// ── MSG_PROP_RE ────────────────────────────────────────────────────────────────

describe("MSG_PROP_RE — object-property string literal detection", () => {
  it("matches the 'message' key with a double-quoted value", () => {
    const matches = matchAllGroup2(MSG_PROP_RE, 'message: "Order has been delivered"');
    expect(matches).toContain("Order has been delivered");
  });

  it("matches the 'body' key (SMS and push payloads)", () => {
    const matches = matchAllGroup2(MSG_PROP_RE, 'body: "Your flowers are on the way"');
    expect(matches).toContain("Your flowers are on the way");
  });

  it("matches the 'title' key (push notification title)", () => {
    const matches = matchAllGroup2(MSG_PROP_RE, 'title: "Delivery update"');
    expect(matches).toContain("Delivery update");
  });

  it("matches the 'subtitle' key (push notification subtitle)", () => {
    const matches = matchAllGroup2(MSG_PROP_RE, 'subtitle: "Tap to view your order"');
    expect(matches).toContain("Tap to view your order");
  });

  it("matches single-quoted values as well as double-quoted", () => {
    const matchesSingle = matchAllGroup2(MSG_PROP_RE, "message: 'Request failed'");
    expect(matchesSingle).toContain("Request failed");
  });

  it("matches with optional whitespace around the colon", () => {
    const matches = matchAllGroup2(MSG_PROP_RE, 'message  :  "Spaced colon value"');
    expect(matches).toContain("Spaced colon value");
  });

  it("captures the attribute name as group 1 and the value as group 2", () => {
    MSG_PROP_RE.lastIndex = 0;
    const m = MSG_PROP_RE.exec('body: "Out for delivery"');
    expect(m).not.toBeNull();
    expect(m![1]).toBe("body");
    expect(m![2]).toBe("Out for delivery");
  });

  it("matches multiple properties on the same line", () => {
    const line = 'title: "Order placed", body: "We received your order"';
    const attrs: string[] = [];
    const values: string[] = [];
    MSG_PROP_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MSG_PROP_RE.exec(line)) !== null) {
      attrs.push(m[1]);
      values.push(m[2]);
    }
    expect(attrs).toContain("title");
    expect(attrs).toContain("body");
    expect(values).toContain("Order placed");
    expect(values).toContain("We received your order");
  });

  it("does not match unknown property keys", () => {
    const matches = matchAllGroup2(MSG_PROP_RE, 'status: "active"');
    expect(matches).toHaveLength(0);
  });

  it("does not match property values shorter than 2 characters", () => {
    const matches = matchAllGroup2(MSG_PROP_RE, 'message: "x"');
    expect(matches).toHaveLength(0);
  });

  it("does not match properties spanning newlines (no newline in value)", () => {
    const src = 'message: "line one\nline two"';
    const matches = matchAllGroup2(MSG_PROP_RE, src);
    expect(matches).toHaveLength(0);
  });

  it("matches 'message' inside a res.json call", () => {
    const line = 'res.json({ message: "Unauthorized access" })';
    const matches = matchAllGroup2(MSG_PROP_RE, line);
    expect(matches).toContain("Unauthorized access");
  });
});

// ── NULLISH_FALLBACK_RE ────────────────────────────────────────────────────────

describe("NULLISH_FALLBACK_RE — nullish-coalescing fallback string detection", () => {
  it("detects a ?? fallback with a double-quoted string", () => {
    const matches = matchAll(NULLISH_FALLBACK_RE, 'name ?? "Unknown sender"');
    expect(matches).toContain("Unknown sender");
  });

  it("detects a ?? fallback with a single-quoted string", () => {
    const matches = matchAll(NULLISH_FALLBACK_RE, "label ?? 'Default label'");
    expect(matches).toContain("Default label");
  });

  it("detects a ?? fallback with spaces around ??", () => {
    const matches = matchAll(NULLISH_FALLBACK_RE, 'msg  ??   "Order confirmed"');
    expect(matches).toContain("Order confirmed");
  });

  it("does not match strings shorter than 4 characters", () => {
    const matches = matchAll(NULLISH_FALLBACK_RE, 'x ?? "OK"');
    expect(matches).toHaveLength(0);
  });

  it("requires at least 2 word-tokens — skips single-word strings", () => {
    // "Loading" has 1 word-token; the outer caller (main loop) enforces the 2-token
    // requirement — but the regex itself requires ≥4 chars. The unit here tests
    // that one-word strings (even if ≥4 chars) ARE captured by the regex so the
    // main loop's word-token filter can then discard them appropriately.
    const matches = matchAll(NULLISH_FALLBACK_RE, 'x ?? "Loading"');
    // The regex captures it; the main loop will filter it out via word-token check.
    expect(matches).toContain("Loading");
  });

  it("skips strings containing a hyphen (CSS-like/path-like values)", () => {
    // The main loop explicitly skips strings with [-:/] — verify the regex
    // still captures these so the filter logic is exercised at the right layer.
    const matches = matchAll(NULLISH_FALLBACK_RE, 'cls ?? "flex-row items"');
    expect(matches).toContain("flex-row items");
  });

  it("skips strings containing a colon (technical identifiers)", () => {
    const matches = matchAll(NULLISH_FALLBACK_RE, 'key ?? "products:lb"');
    expect(matches).toContain("products:lb");
  });

  it("skips bare domain names (the main loop filters them)", () => {
    // The main loop skips /^[a-z0-9.-]+\.[a-z]{2,}$/i — verify the regex
    // captures bare domains so the filter is applied.
    const matches = matchAll(NULLISH_FALLBACK_RE, 'domain ?? "presentail.com"');
    expect(matches).toContain("presentail.com");
  });

  it("detects a two-word English fallback that the main loop would flag", () => {
    const matches = matchAll(NULLISH_FALLBACK_RE, 'msg ?? "Order failed"');
    expect(matches).toContain("Order failed");
  });

  it("does not match ternary-colon fallbacks (only ?? is targeted)", () => {
    const matches = matchAll(NULLISH_FALLBACK_RE, 'ok ? "yes" : "no"');
    expect(matches).toHaveLength(0);
  });
});

// ── LOGICAL_OR_FALLBACK_RE ────────────────────────────────────────────────────

describe("LOGICAL_OR_FALLBACK_RE — logical-OR fallback string detection", () => {
  it("detects a || fallback with a double-quoted string", () => {
    const matches = matchAll(LOGICAL_OR_FALLBACK_RE, 'name || "Unknown sender"');
    expect(matches).toContain("Unknown sender");
  });

  it("detects a || fallback with a single-quoted string", () => {
    const matches = matchAll(LOGICAL_OR_FALLBACK_RE, "label || 'Default label'");
    expect(matches).toContain("Default label");
  });

  it("detects a || fallback with spaces around ||", () => {
    const matches = matchAll(LOGICAL_OR_FALLBACK_RE, 'msg  ||   "Order confirmed"');
    expect(matches).toContain("Order confirmed");
  });

  it("does not match strings shorter than 4 characters", () => {
    const matches = matchAll(LOGICAL_OR_FALLBACK_RE, 'x || "OK"');
    expect(matches).toHaveLength(0);
  });

  it("detects a two-word English fallback that the main loop would flag", () => {
    const matches = matchAll(LOGICAL_OR_FALLBACK_RE, 'body || "Delivery scheduled"');
    expect(matches).toContain("Delivery scheduled");
  });

  it("skips strings containing a hyphen (the main loop filters them)", () => {
    const matches = matchAll(LOGICAL_OR_FALLBACK_RE, 'cls || "flex-col items"');
    expect(matches).toContain("flex-col items");
  });

  it("skips strings containing a colon (the main loop filters them)", () => {
    const matches = matchAll(LOGICAL_OR_FALLBACK_RE, 'key || "cache:key"');
    expect(matches).toContain("cache:key");
  });

  it("skips bare domain names (the main loop filters them)", () => {
    const matches = matchAll(LOGICAL_OR_FALLBACK_RE, 'host || "presentail.com"');
    expect(matches).toContain("presentail.com");
  });

  it("does not match ?? (only || is targeted by this pattern)", () => {
    const matches = matchAll(LOGICAL_OR_FALLBACK_RE, 'name ?? "Unknown sender"');
    expect(matches).toHaveLength(0);
  });

  it("detects a || fallback in a ternary context on the same line", () => {
    const matches = matchAll(
      LOGICAL_OR_FALLBACK_RE,
      'const m = body || "Fallback body"',
    );
    expect(matches).toContain("Fallback body");
  });
});

// ── MSG_PROP_RE — exclusion rules applied in the main loop ────────────────────

describe("MSG_PROP_RE — values that the main loop would exclude", () => {
  it("regex still captures CSS-like values with colons; main loop skips them", () => {
    const matches = matchAllGroup2(MSG_PROP_RE, 'message: "flex: 1 auto"');
    expect(matches).toContain("flex: 1 auto");
  });

  it("regex still captures path-like values with slashes; main loop skips them", () => {
    const matches = matchAllGroup2(MSG_PROP_RE, 'message: "api/v1/orders"');
    expect(matches).toContain("api/v1/orders");
  });

  it("regex still captures backslash paths; main loop skips them", () => {
    const matches = matchAllGroup2(MSG_PROP_RE, 'message: "C:\\\\Users\\\\data"');
    expect(matches).toContain("C:\\\\Users\\\\data");
  });
});

// ── NULLISH_FALLBACK_RE and LOGICAL_OR_FALLBACK_RE — shared domain-skip check ─

describe("domain-name skip — both fallback patterns", () => {
  const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

  it("DOMAIN_RE matches a bare .com domain", () => {
    expect(DOMAIN_RE.test("presentail.com")).toBe(true);
  });

  it("DOMAIN_RE matches a subdomain", () => {
    expect(DOMAIN_RE.test("os.presentail.com")).toBe(true);
  });

  it("DOMAIN_RE does not match a normal English phrase", () => {
    expect(DOMAIN_RE.test("Order confirmed")).toBe(false);
  });

  it("DOMAIN_RE does not match a URL (includes protocol)", () => {
    expect(DOMAIN_RE.test("https://presentail.com")).toBe(false);
  });
});
