/**
 * Unit tests for the GitHub Actions annotation output in
 * checkUnusedTranslationKeys.ts.
 *
 * The `annotateError` helper emits `::error file=…,title=…::…` workflow
 * commands when GITHUB_ACTIONS=true.  These tests verify that:
 *   - The output is well-formed for each of the three check types
 *     (unused key, missing locale translation, undefined key reference).
 *   - The fixed file path is embedded correctly.
 *   - Special characters in titles and messages are percent-encoded.
 *   - Nothing is written when GITHUB_ACTIONS is not "true".
 *
 * The tests import `annotateError` from the extracted helper module so the
 * env var is read at call time (not at module-load time), making it easy to
 * stub with a beforeEach/afterEach guard.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { annotateError, formatAnnotation, escapeValue, escapeProp } from "../lib/githubAnnotations.js";

const TRANSLATIONS_PATH = "artifacts/presentail/lib/translations.ts";

// ── helpers ───────────────────────────────────────────────────────────────────

function captureAnnotation(title: string, message: string): string {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
  annotateError(title, message);
  spy.mockRestore();
  return chunks.join("");
}

// ── escaping helpers ──────────────────────────────────────────────────────────

describe("escapeValue", () => {
  it("encodes % as %25", () => {
    expect(escapeValue("100%")).toBe("100%25");
  });

  it("encodes CR as %0D", () => {
    expect(escapeValue("a\rb")).toBe("a%0Db");
  });

  it("encodes LF as %0A", () => {
    expect(escapeValue("a\nb")).toBe("a%0Ab");
  });

  it("leaves colons and commas unmodified", () => {
    expect(escapeValue("a:b,c")).toBe("a:b,c");
  });

  it("leaves plain text unchanged", () => {
    expect(escapeValue("hello world")).toBe("hello world");
  });
});

describe("escapeProp", () => {
  it("encodes % CR LF : and ,", () => {
    expect(escapeProp("100%\r\na:b,c")).toBe("100%25%0D%0Aa%3Ab%2Cc");
  });

  it("leaves plain text unchanged", () => {
    expect(escapeProp("Unused translation key")).toBe("Unused translation key");
  });
});

// ── formatAnnotation ──────────────────────────────────────────────────────────

describe("formatAnnotation", () => {
  it("starts with ::error", () => {
    expect(formatAnnotation("T", "M")).toMatch(/^::error /);
  });

  it("embeds the translations file path", () => {
    const line = formatAnnotation("T", "M");
    expect(line).toContain(`file=${TRANSLATIONS_PATH}`);
  });

  it("includes the title after 'title='", () => {
    const line = formatAnnotation("My Title", "msg");
    expect(line).toContain("title=My Title");
  });

  it("includes the message after the closing ::", () => {
    const line = formatAnnotation("T", "My message");
    expect(line).toContain("::My message");
  });

  it("ends with a newline", () => {
    expect(formatAnnotation("T", "M")).toMatch(/\n$/);
  });
});

// ── annotateError — no-op outside GitHub Actions ──────────────────────────────

describe("annotateError — not in GitHub Actions", () => {
  beforeEach(() => {
    delete process.env["GITHUB_ACTIONS"];
  });

  afterEach(() => {
    delete process.env["GITHUB_ACTIONS"];
  });

  it("writes nothing when GITHUB_ACTIONS is unset", () => {
    const written = captureAnnotation("Title", "Message");
    expect(written).toBe("");
  });

  it("writes nothing when GITHUB_ACTIONS is 'false'", () => {
    process.env["GITHUB_ACTIONS"] = "false";
    const written = captureAnnotation("Title", "Message");
    expect(written).toBe("");
  });
});

// ── annotateError — three check types ────────────────────────────────────────

describe("annotateError — GitHub Actions output format", () => {
  beforeEach(() => {
    process.env["GITHUB_ACTIONS"] = "true";
  });

  afterEach(() => {
    delete process.env["GITHUB_ACTIONS"];
  });

  it("emits a well-formed ::error line", () => {
    const line = captureAnnotation("Some Title", "Some message");
    // Must start with ::error, contain file= and title=, and close with ::
    expect(line).toMatch(
      /^::error file=[^,]+,title=[^:]+::.+\n$/,
    );
  });

  it("check type: unused key — correct title and message format", () => {
    const key = "unusedKey";
    const title = "Unused translation key";
    const message = `Key "${key}" is defined in EN but not referenced anywhere in the mobile source — remove it from all three locale blocks.`;

    const line = captureAnnotation(title, message);

    expect(line).toContain(`file=${TRANSLATIONS_PATH}`);
    expect(line).toContain(`title=${title}`);
    expect(line).toContain(`::${message}`);
    expect(line).toMatch(/^::error /);
    expect(line).toMatch(/\n$/);
  });

  it("check type: missing locale — correct title and message format", () => {
    const key = "missingKey";
    const locale = "AR";
    const title = `Missing ${locale} translation`;
    const message = `Key "${key}" is present in EN but missing from the ${locale} locale block — add a ${locale} translation for it.`;

    const line = captureAnnotation(title, message);

    expect(line).toContain(`file=${TRANSLATIONS_PATH}`);
    expect(line).toContain(`title=Missing ${locale} translation`);
    expect(line).toContain(`::${message}`);
    expect(line).toMatch(/^::error /);
    expect(line).toMatch(/\n$/);
  });

  it("check type: undefined key — correct title and message format", () => {
    const key = "undefinedKey";
    const title = "Undefined translation key";
    const message = `Key "${key}" is referenced in source via t.${key} or t["${key}"] but does not exist in the EN locale block — add it to all three locale blocks or fix the reference.`;

    const line = captureAnnotation(title, message);

    expect(line).toContain(`file=${TRANSLATIONS_PATH}`);
    expect(line).toContain(`title=${title}`);
    expect(line).toContain(`::${message}`);
    expect(line).toMatch(/^::error /);
    expect(line).toMatch(/\n$/);
  });

  it("percent-encodes a newline in the message so the command is not split", () => {
    const line = captureAnnotation("T", "line one\nline two");
    expect(line).toContain("%0A");
    expect(line).not.toMatch(/^::error[^\n]*\n.+/);
  });

  it("percent-encodes a colon in the title so it cannot break property parsing", () => {
    const line = captureAnnotation("Error: bad key", "msg");
    expect(line).toContain("Error%3A bad key");
  });

  it("percent-encodes a comma in the title so it cannot break property parsing", () => {
    const line = captureAnnotation("AR, FR missing", "msg");
    expect(line).toContain("AR%2C FR missing");
  });

  it("each annotateError call emits exactly one line", () => {
    const line = captureAnnotation("Title", "Message");
    const lines = line.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
  });
});
