/**
 * Tests for the no-unknown-t-call ESLint rule.
 *
 * Uses the `_createRuleForTest` factory to inject a synthetic valid-key Set,
 * avoiding all filesystem I/O and keeping tests fully self-contained.
 *
 * Covers:
 *  - Known key passed to t() → no warning
 *  - Unknown key passed to t() → unknownKey warning
 *  - t() call where t was NOT bound from useLocale() → no warning
 *  - Non-t() call (e.g. log()) → no warning
 *  - Non-string / dynamic argument → no warning
 *  - I/O failure (validKeys === null) → keysNotLoaded warning on Program
 *  - Multiple unknown keys in one file → one warning per unknown key
 *  - t bound via member-expression pattern (const t = useLocale().t) → checked
 */

import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import { _createRuleForTest } from "../no-unknown-t-call.js";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

// ── known key → no warning ────────────────────────────────────────────────────

describe("no-unknown-t-call — known key", () => {
  it("produces no warning when the key exists in the valid-keys set", () => {
    const rule = _createRuleForTest({
      validKeys: new Set(["home.title", "nav.back"]),
    });

    tester.run("no-unknown-t-call", rule, {
      valid: [
        {
          code: `
            function Comp() {
              const { t } = useLocale();
              return t("home.title");
            }
          `,
        },
      ],
      invalid: [],
    });
  });

  it("produces no warning for multiple known keys in one component", () => {
    const rule = _createRuleForTest({
      validKeys: new Set(["home.title", "nav.back", "footer.copy"]),
    });

    tester.run("no-unknown-t-call", rule, {
      valid: [
        {
          code: `
            function Comp() {
              const { t } = useLocale();
              return [t("home.title"), t("nav.back"), t("footer.copy")];
            }
          `,
        },
      ],
      invalid: [],
    });
  });
});

// ── unknown key → unknownKey warning ─────────────────────────────────────────

describe("no-unknown-t-call — unknown key", () => {
  it("warns with unknownKey when the key is absent from the valid-keys set", () => {
    const rule = _createRuleForTest({
      validKeys: new Set(["home.title"]),
    });

    tester.run("no-unknown-t-call", rule, {
      valid: [],
      invalid: [
        {
          code: `
            function Comp() {
              const { t } = useLocale();
              return t("missing.key");
            }
          `,
          errors: [{ messageId: "unknownKey", data: { key: "missing.key" } }],
        },
      ],
    });
  });

  it("warns for every unknown key when multiple unknown keys appear", () => {
    const rule = _createRuleForTest({
      validKeys: new Set(["known.key"]),
    });

    tester.run("no-unknown-t-call", rule, {
      valid: [],
      invalid: [
        {
          code: `
            function Comp() {
              const { t } = useLocale();
              return [t("known.key"), t("ghost.one"), t("ghost.two")];
            }
          `,
          errors: [
            { messageId: "unknownKey", data: { key: "ghost.one" } },
            { messageId: "unknownKey", data: { key: "ghost.two" } },
          ],
        },
      ],
    });
  });

  it("warns even when the valid-keys set is empty", () => {
    const rule = _createRuleForTest({ validKeys: new Set() });

    tester.run("no-unknown-t-call", rule, {
      valid: [],
      invalid: [
        {
          code: `
            function Comp() {
              const { t } = useLocale();
              return t("any.key");
            }
          `,
          errors: [{ messageId: "unknownKey", data: { key: "any.key" } }],
        },
      ],
    });
  });
});

// ── t not from useLocale() → no warning ──────────────────────────────────────

describe("no-unknown-t-call — t not from useLocale()", () => {
  it("ignores a t() call when t was not declared from useLocale()", () => {
    const rule = _createRuleForTest({ validKeys: new Set() });

    tester.run("no-unknown-t-call", rule, {
      valid: [
        {
          code: `
            function Comp({ t }) {
              return t("unregistered.key");
            }
          `,
        },
        {
          code: `
            import t from "i18next";
            t("unregistered.key");
          `,
        },
        {
          code: `
            const t = (k) => k;
            t("unregistered.key");
          `,
        },
      ],
      invalid: [],
    });
  });
});

// ── non-t() call → no warning ─────────────────────────────────────────────────

describe("no-unknown-t-call — non-t() call", () => {
  it("ignores calls to functions other than t", () => {
    const rule = _createRuleForTest({ validKeys: new Set() });

    tester.run("no-unknown-t-call", rule, {
      valid: [
        {
          code: `
            function Comp() {
              const { t } = useLocale();
              console.log("home.title");
              translate("home.title");
              return null;
            }
          `,
        },
      ],
      invalid: [],
    });
  });
});

// ── non-string / dynamic argument → no warning ───────────────────────────────

describe("no-unknown-t-call — non-string argument", () => {
  it("ignores t() calls whose first argument is not a string literal", () => {
    const rule = _createRuleForTest({ validKeys: new Set() });

    tester.run("no-unknown-t-call", rule, {
      valid: [
        {
          code: `
            function Comp() {
              const { t } = useLocale();
              const key = "home.title";
              return t(key);
            }
          `,
        },
        {
          code: "function Comp() { const { t } = useLocale(); return t(`home.${section}`); }",
        },
        {
          code: `
            function Comp() {
              const { t } = useLocale();
              return t(42);
            }
          `,
        },
      ],
      invalid: [],
    });
  });
});

// ── I/O failure → keysNotLoaded ──────────────────────────────────────────────

describe("no-unknown-t-call — keysNotLoaded (I/O failure)", () => {
  it("reports keysNotLoaded on Program when validKeys is null", () => {
    const rule = _createRuleForTest({ validKeys: null });

    tester.run("no-unknown-t-call", rule, {
      valid: [],
      invalid: [
        {
          code: `
            function Comp() {
              const { t } = useLocale();
              return t("home.title");
            }
          `,
          errors: [{ messageId: "keysNotLoaded" }],
        },
      ],
    });
  });

  it("keysNotLoaded fires even when there are no t() calls", () => {
    const rule = _createRuleForTest({ validKeys: null });

    tester.run("no-unknown-t-call", rule, {
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

// ── member-expression binding pattern ────────────────────────────────────────

describe("no-unknown-t-call — t bound via useLocale().t", () => {
  it("detects unknown key when t is bound as const t = useLocale().t", () => {
    const rule = _createRuleForTest({ validKeys: new Set(["home.title"]) });

    tester.run("no-unknown-t-call", rule, {
      valid: [
        {
          code: `
            function Comp() {
              const t = useLocale().t;
              return t("home.title");
            }
          `,
        },
      ],
      invalid: [
        {
          code: `
            function Comp() {
              const t = useLocale().t;
              return t("missing.key");
            }
          `,
          errors: [{ messageId: "unknownKey", data: { key: "missing.key" } }],
        },
      ],
    });
  });
});
