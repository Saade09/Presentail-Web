/**
 * Tests for the no-unknown-t-member ESLint rule.
 *
 * Uses the `_createRuleForTest` factory to inject a synthetic valid-key Set,
 * avoiding all filesystem I/O and keeping tests fully self-contained.
 *
 * Covers:
 *  - Known key accessed via dot notation (t.key) → no warning
 *  - Unknown key accessed via dot notation → unknownKey warning
 *  - Known key accessed via bracket notation with string literal (t["key"]) → no warning
 *  - Unknown key accessed via bracket notation with string literal → unknownKey warning
 *  - Dynamic bracket access (t[variable]) → no warning (cannot be statically resolved)
 *  - t not bound from useT() → no warning
 *  - I/O failure (validKeys === null) → keysNotLoaded warning on Program
 *  - Multiple unknown keys in one file → one warning per unknown key
 */

import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import { _createRuleForTest } from "../no-unknown-t-member.js";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

// ── known key (dot notation) → no warning ─────────────────────────────────────

describe("no-unknown-t-member — known key (dot notation)", () => {
  it("produces no warning when a known key is accessed via t.key", () => {
    const rule = _createRuleForTest({
      validKeys: new Set(["greeting", "farewell"]),
    });

    tester.run("no-unknown-t-member", rule, {
      valid: [
        {
          code: `
            function Comp() {
              const t = useT();
              return t.greeting;
            }
          `,
        },
      ],
      invalid: [],
    });
  });

  it("produces no warning for multiple known keys", () => {
    const rule = _createRuleForTest({
      validKeys: new Set(["greeting", "farewell", "ctaLabel"]),
    });

    tester.run("no-unknown-t-member", rule, {
      valid: [
        {
          code: `
            function Comp() {
              const t = useT();
              return [t.greeting, t.farewell, t.ctaLabel];
            }
          `,
        },
      ],
      invalid: [],
    });
  });
});

// ── unknown key (dot notation) → unknownKey warning ──────────────────────────

describe("no-unknown-t-member — unknown key (dot notation)", () => {
  it("warns when an unknown key is accessed via t.key", () => {
    const rule = _createRuleForTest({
      validKeys: new Set(["greeting"]),
    });

    tester.run("no-unknown-t-member", rule, {
      valid: [],
      invalid: [
        {
          code: `
            function Comp() {
              const t = useT();
              return t.staleKey;
            }
          `,
          errors: [{ messageId: "unknownKey", data: { key: "staleKey" } }],
        },
      ],
    });
  });

  it("warns for every unknown key when multiple unknown keys appear", () => {
    const rule = _createRuleForTest({
      validKeys: new Set(["greeting"]),
    });

    tester.run("no-unknown-t-member", rule, {
      valid: [],
      invalid: [
        {
          code: `
            function Comp() {
              const t = useT();
              return [t.greeting, t.ghostOne, t.ghostTwo];
            }
          `,
          errors: [
            { messageId: "unknownKey", data: { key: "ghostOne" } },
            { messageId: "unknownKey", data: { key: "ghostTwo" } },
          ],
        },
      ],
    });
  });

  it("warns even when the valid-keys set is empty", () => {
    const rule = _createRuleForTest({ validKeys: new Set() });

    tester.run("no-unknown-t-member", rule, {
      valid: [],
      invalid: [
        {
          code: `
            function Comp() {
              const t = useT();
              return t.anyKey;
            }
          `,
          errors: [{ messageId: "unknownKey", data: { key: "anyKey" } }],
        },
      ],
    });
  });
});

// ── known key (bracket notation with string literal) → no warning ─────────────

describe("no-unknown-t-member — known key (bracket notation)", () => {
  it("produces no warning for t['knownKey'] with a double-quoted literal", () => {
    const rule = _createRuleForTest({
      validKeys: new Set(["greeting"]),
    });

    tester.run("no-unknown-t-member", rule, {
      valid: [
        {
          code: `
            function Comp() {
              const t = useT();
              return t["greeting"];
            }
          `,
        },
      ],
      invalid: [],
    });
  });

  it("produces no warning for t['knownKey'] with a single-quoted literal", () => {
    const rule = _createRuleForTest({
      validKeys: new Set(["greeting"]),
    });

    tester.run("no-unknown-t-member", rule, {
      valid: [
        {
          code: `
            function Comp() {
              const t = useT();
              return t['greeting'];
            }
          `,
        },
      ],
      invalid: [],
    });
  });
});

// ── unknown key (bracket notation with string literal) → unknownKey warning ───

describe("no-unknown-t-member — unknown key (bracket notation)", () => {
  it("warns when an unknown key is accessed via t['key']", () => {
    const rule = _createRuleForTest({
      validKeys: new Set(["greeting"]),
    });

    tester.run("no-unknown-t-member", rule, {
      valid: [],
      invalid: [
        {
          code: `
            function Comp() {
              const t = useT();
              return t["staleKey"];
            }
          `,
          errors: [{ messageId: "unknownKey", data: { key: "staleKey" } }],
        },
      ],
    });
  });
});

// ── dynamic bracket access → no warning ──────────────────────────────────────

describe("no-unknown-t-member — dynamic bracket access", () => {
  it("ignores t[variable] (runtime key — cannot be statically resolved)", () => {
    const rule = _createRuleForTest({ validKeys: new Set() });

    tester.run("no-unknown-t-member", rule, {
      valid: [
        {
          code: `
            function Comp({ nameKey }) {
              const t = useT();
              return t[nameKey];
            }
          `,
        },
        {
          code: `
            function Comp() {
              const t = useT();
              const key = getKey();
              return t[key];
            }
          `,
        },
      ],
      invalid: [],
    });
  });
});

// ── t not bound from useT() → no warning ─────────────────────────────────────

describe("no-unknown-t-member — t not from useT()", () => {
  it("ignores t.key when t was not declared from useT()", () => {
    const rule = _createRuleForTest({ validKeys: new Set() });

    tester.run("no-unknown-t-member", rule, {
      valid: [
        {
          code: `
            function Comp({ t }) {
              return t.someKey;
            }
          `,
        },
        {
          code: `
            import t from "some-lib";
            t.someKey;
          `,
        },
        {
          code: `
            const t = {};
            t.someKey;
          `,
        },
        {
          code: `
            function Comp() {
              const t = buildTranslations();
              return t.someKey;
            }
          `,
        },
      ],
      invalid: [],
    });
  });
});

// ── I/O failure → keysNotLoaded ──────────────────────────────────────────────

describe("no-unknown-t-member — keysNotLoaded (I/O failure)", () => {
  it("reports keysNotLoaded on Program when validKeys is null", () => {
    const rule = _createRuleForTest({ validKeys: null });

    tester.run("no-unknown-t-member", rule, {
      valid: [],
      invalid: [
        {
          code: `
            function Comp() {
              const t = useT();
              return t.greeting;
            }
          `,
          errors: [{ messageId: "keysNotLoaded" }],
        },
      ],
    });
  });

  it("keysNotLoaded fires even when there are no t member accesses", () => {
    const rule = _createRuleForTest({ validKeys: null });

    tester.run("no-unknown-t-member", rule, {
      valid: [],
      invalid: [
        {
          code: `export const x = 1;`,
          errors: [{ messageId: "keysNotLoaded" }],
        },
      ],
    });
  });
});
