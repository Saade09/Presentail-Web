/**
 * Tests for checkHardcodedApiStrings.ts
 *
 * Exercises each of the four detection patterns (A–D) with both
 * should-fire and should-not-fire inputs, plus the shared helpers.
 */

import { describe, it, expect } from "vitest";
import {
  looksLikeEnglishProse,
  shouldSkipLine,
  MSG_PROP_RE,
  NULLISH_FALLBACK_RE,
  LOGICAL_OR_FALLBACK_RE,
  TEMPLATE_LITERAL_RE,
} from "../checkHardcodedApiStrings.js";

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

  it("SMS-style message with punctuation", () => {
    expect(
      looksLikeEnglishProse("Your gift has left the atelier and is on its way."),
    ).toBe(true);
  });

  it("push notification title with brand name", () => {
    expect(looksLikeEnglishProse("Your order has been delivered.")).toBe(true);
  });
});

describe("looksLikeEnglishProse — should return false", () => {
  it("empty string", () => {
    expect(looksLikeEnglishProse("")).toBe(false);
  });

  it("URL", () => {
    expect(looksLikeEnglishProse("https://example.com/track")).toBe(false);
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

// ── shouldSkipLine ────────────────────────────────────────────────────────────

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
    expect(shouldSkipLine('import { sendSms } from "./sms.js";')).toBe(true);
  });

  it("export type declaration", () => {
    expect(shouldSkipLine("export type MessagePayload = string;")).toBe(true);
  });

  it("type alias starting with capital", () => {
    expect(shouldSkipLine("type OrderState = { id: number };")).toBe(true);
  });

  it("req.log.info call (server logging)", () => {
    expect(shouldSkipLine('  req.log.info({ orderId }, "order created");')).toBe(true);
  });

  it("req.log.warn call (server logging)", () => {
    expect(shouldSkipLine('  req.log.warn("token expired");')).toBe(true);
  });

  it("logger.error call (server logging)", () => {
    expect(shouldSkipLine('  logger.error({ err }, "sync failed");')).toBe(true);
  });

  it("console.log call (debug output)", () => {
    expect(shouldSkipLine('  console.log("debug:", value);')).toBe(true);
  });

  it("throw statement — internal validation error, never push/SMS", () => {
    expect(
      shouldSkipLine('    throw new Error(`Invalid quantity: ${qty}`);'),
    ).toBe(true);
  });

  it("throw without new — still skipped", () => {
    expect(shouldSkipLine("    throw err;")).toBe(true);
  });
});

describe("shouldSkipLine — should return false (do not skip)", () => {
  it("object literal with message property", () => {
    expect(shouldSkipLine('  res.json({ message: "Order confirmed" });')).toBe(false);
  });

  it("push notification body object literal", () => {
    expect(
      shouldSkipLine('    body: "Your order has been delivered.",'),
    ).toBe(false);
  });

  it("return statement with template literal", () => {
    expect(
      shouldSkipLine(
        "    return `Presentail: Your order ${id} has been delivered.`;",
      ),
    ).toBe(false);
  });

  it("nullish-coalescing fallback string", () => {
    expect(shouldSkipLine('  const label = region ?? "Select region";')).toBe(false);
  });
});

// ── Pattern A: Object-property string literals ────────────────────────────────

describe("Pattern A — MSG_PROP_RE", () => {
  function matchAll(line: string) {
    MSG_PROP_RE.lastIndex = 0;
    const results: Array<{ attr: string; text: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = MSG_PROP_RE.exec(line)) !== null) {
      results.push({ attr: m[1], text: m[2].trim() });
    }
    return results;
  }

  it("captures a message property with double quotes", () => {
    const matches = matchAll('  res.json({ message: "Order confirmed" });');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "message", text: "Order confirmed" });
  });

  it("captures a body property (push notification)", () => {
    const matches = matchAll("    body: 'Your order has been delivered.',");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      attr: "body",
      text: "Your order has been delivered.",
    });
  });

  it("captures a title property (push notification)", () => {
    const matches = matchAll('    title: "Order Update",');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "title", text: "Order Update" });
  });

  it("captures a subtitle property", () => {
    const matches = matchAll('    subtitle: "Track your delivery",');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "subtitle", text: "Track your delivery" });
  });

  it("captures a body property with single quotes", () => {
    const matches = matchAll("    body: 'Loyalty reward unlocked',");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ attr: "body", text: "Loyalty reward unlocked" });
  });

  it("does not match a non-user-visible property", () => {
    const matches = matchAll('    status: "ok",');
    expect(matches).toHaveLength(0);
  });

  it("does not match a template-literal value", () => {
    const matches = matchAll("    body: `Your order ${id} is ready`,");
    expect(matches).toHaveLength(0);
  });

  it("does not match a variable reference value", () => {
    const matches = matchAll("    body: messageText,");
    expect(matches).toHaveLength(0);
  });

  it("does not match a very short value (< 4 chars)", () => {
    const matches = matchAll('    message: "ok",');
    // regex captures it but looksLikeEnglishProse filters it out in the scanner
    const prose = matches.filter((m) => looksLikeEnglishProse(m.text));
    expect(prose).toHaveLength(0);
  });
});

// ── Pattern B: Nullish-coalescing fallback strings ────────────────────────────

describe("Pattern B — NULLISH_FALLBACK_RE", () => {
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
    const matches = matchAll('  const label = region ?? "Select region";');
    expect(matches).toContain("Select region");
  });

  it("captures a longer ?? fallback phrase", () => {
    const matches = matchAll('  const msg = body ?? "No message provided";');
    expect(matches).toContain("No message provided");
  });

  it("captures a single-quoted ?? fallback", () => {
    const matches = matchAll("  const name = firstName ?? 'Unknown user';");
    expect(matches).toContain("Unknown user");
  });

  it("does not match a ?? fallback shorter than 4 chars", () => {
    const matches = matchAll('  x ?? "hi"');
    expect(matches).toHaveLength(0);
  });

  it("does not match a ternary operator", () => {
    const matches = matchAll('  x === 1 ? "yes" : "no"');
    expect(matches).toHaveLength(0);
  });
});

// ── Pattern C: Logical-OR fallback strings ────────────────────────────────────

describe("Pattern C — LOGICAL_OR_FALLBACK_RE", () => {
  function matchAll(line: string) {
    LOGICAL_OR_FALLBACK_RE.lastIndex = 0;
    const results: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = LOGICAL_OR_FALLBACK_RE.exec(line)) !== null) {
      results.push(m[1]);
    }
    return results;
  }

  it("captures a two-word || fallback", () => {
    const matches = matchAll('  const title = pushTitle || "Order Update";');
    expect(matches).toContain("Order Update");
  });

  it("captures a longer || fallback phrase", () => {
    const matches = matchAll('  const body = smsBody || "No message available";');
    expect(matches).toContain("No message available");
  });

  it("does not match a || fallback shorter than 4 chars", () => {
    const matches = matchAll('  x || "ok"');
    expect(matches).toHaveLength(0);
  });

  it("does not match a logical-OR on a non-string value", () => {
    const matches = matchAll("  x || defaultValue");
    expect(matches).toHaveLength(0);
  });
});

// ── Pattern D: Template literal content ───────────────────────────────────────

describe("Pattern D — TEMPLATE_LITERAL_RE", () => {
  /**
   * Applies the same filtering logic used in the scanner's Pattern D block:
   * strip ${…} interpolations, apply all guards, and collect prose hits.
   */
  function detectTemplateLiterals(line: string): string[] {
    if (/<[a-zA-Z/]/.test(line)) return [];
    TEMPLATE_LITERAL_RE.lastIndex = 0;
    const results: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = TEMPLATE_LITERAL_RE.exec(line)) !== null) {
      const stripped = m[1]
        .replace(/\$\{[^}]*\}/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!/^[A-Z]/.test(stripped)) continue;
      if (/^https?:\/\//.test(stripped)) continue;
      if (/::/.test(stripped)) continue;
      if (/'/.test(stripped)) continue;
      if (/=/.test(stripped)) continue;
      const wordTokens = stripped.match(/\b[a-zA-Z]{3,}\b/g) ?? [];
      if (wordTokens.length < 3) continue;
      results.push(stripped);
    }
    return results;
  }

  it("detects an SMS-style message template", () => {
    const line =
      "    return `Presentail: Your gift (Order ${id}) has left the atelier.`;";
    const hits = detectTemplateLiterals(line);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("Presentail");
    expect(hits[0]).toContain("has left the atelier");
  });

  it("detects a push notification body template", () => {
    const line =
      "    body: () => `Your order has been delivered. Thank you for choosing Presentail.`,";
    const hits = detectTemplateLiterals(line);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("Your order has been delivered");
  });

  it("detects a multi-interpolation SMS template (stripped result still has 3+ words)", () => {
    const line =
      "    `Presentail: Your gift (Order ${orderId}) has been delivered. Thank you!` +";
    const hits = detectTemplateLiterals(line);
    expect(hits).toHaveLength(1);
  });

  it("detects a loyalty push template", () => {
    const line =
      "    `Enjoy ${pct}% off your next order with code ${code}.`";
    const hits = detectTemplateLiterals(line);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("off your next order with code");
  });

  it("does not detect a single HTTP token 'Bearer'", () => {
    const line = '    headers: { Authorization: `Bearer ${token}` },';
    const hits = detectTemplateLiterals(line);
    expect(hits).toHaveLength(0);
  });

  it("does not detect a single HTTP token 'Basic'", () => {
    const line = "    const auth = `Basic ${encoded}`;";
    const hits = detectTemplateLiterals(line);
    expect(hits).toHaveLength(0);
  });

  it("does not detect a SQL fragment with single-quoted identifiers", () => {
    const line =
      "    sql`date_trunc('day', ${col} at time zone 'UTC')`,";
    const hits = detectTemplateLiterals(line);
    expect(hits).toHaveLength(0);
  });

  it("does not detect a PostgreSQL cast (::) pattern", () => {
    const line = "    `date_trunc('day', ${col})::date::text`";
    const hits = detectTemplateLiterals(line);
    expect(hits).toHaveLength(0);
  });

  it("does not detect a cache-key template (contains ::)", () => {
    const line = "    const key = `categories::${lang}`;";
    const hits = detectTemplateLiterals(line);
    expect(hits).toHaveLength(0);
  });

  it("does not detect a key=value technical string", () => {
    const line = "    const param = `outcome=${result.code}`;";
    const hits = detectTemplateLiterals(line);
    expect(hits).toHaveLength(0);
  });

  it("does not detect a two-word phrase (requires 3+ word-tokens)", () => {
    const line = "    const label = `Free Delivery`;";
    const hits = detectTemplateLiterals(line);
    expect(hits).toHaveLength(0);
  });

  it("does not detect a lowercase-starting template (internal/log strings)", () => {
    const line = "    `syncCustomerToWoo: customer not found`,";
    const hits = detectTemplateLiterals(line);
    expect(hits).toHaveLength(0);
  });

  it("does not detect a URL template literal", () => {
    const line = "    const url = `https://track.presentail.com/orders/${id}`;";
    const hits = detectTemplateLiterals(line);
    expect(hits).toHaveLength(0);
  });

  it("does not detect HTML-containing lines (server-rendered admin pages)", () => {
    const line = "    html += `<div class='panel'>Order summary</div>`;";
    const hits = detectTemplateLiterals(line);
    expect(hits).toHaveLength(0);
  });
});

// ── i18n-ignore suppression ───────────────────────────────────────────────────

describe("i18n-ignore annotation", () => {
  it("trailing // i18n-ignore is detected as a suppression comment", () => {
    const line =
      "    body: 'Your order has been delivered.', // i18n-ignore";
    expect(/\/\/\s*i18n-ignore\b/.test(line)).toBe(true);
  });

  it("block-comment form /* i18n-ignore */ is also detected", () => {
    const line =
      "    body: 'Your order has been delivered.', /* i18n-ignore */";
    expect(/\/\*\s*i18n-ignore\b/.test(line)).toBe(true);
  });

  it("a comment that merely says 'ignore' is NOT treated as suppression", () => {
    const line = "    body: 'Delivered!', // ignore this for now";
    expect(/\/\/\s*i18n-ignore\b/.test(line)).toBe(false);
  });
});
