import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  readManualCurrency,
  writeManualCurrency,
  MANUAL_CURRENCY_KEY,
  MANUAL_CURRENCY_PERSISTENT_KEY,
} from "./displayCurrencyStorage";

const PERSISTENT_KEY = MANUAL_CURRENCY_PERSISTENT_KEY;
const SESSION_KEY = MANUAL_CURRENCY_KEY;

function makeStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get _store() { return store; },
  };
}

describe("readManualCurrency / writeManualCurrency — storage behaviour", () => {
  let ls: ReturnType<typeof makeStorage>;
  let ss: ReturnType<typeof makeStorage>;

  beforeEach(() => {
    ls = makeStorage();
    ss = makeStorage();
    vi.stubGlobal("window", { localStorage: ls, sessionStorage: ss });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // writeManualCurrency
  // ---------------------------------------------------------------------------

  describe("writeManualCurrency", () => {
    it("persistent=true writes to localStorage and removes from sessionStorage", () => {
      ss.setItem(SESSION_KEY, "EUR");

      writeManualCurrency({ code: "AED", persistent: true });

      expect(ls.getItem(PERSISTENT_KEY)).toBe("AED");
      expect(ss.getItem(SESSION_KEY)).toBeNull();
    });

    it("persistent=false writes to sessionStorage and removes from localStorage", () => {
      ls.setItem(PERSISTENT_KEY, "AED");

      writeManualCurrency({ code: "EUR", persistent: false });

      expect(ss.getItem(SESSION_KEY)).toBe("EUR");
      expect(ls.getItem(PERSISTENT_KEY)).toBeNull();
    });

    it("null clears both localStorage and sessionStorage", () => {
      ls.setItem(PERSISTENT_KEY, "AED");
      ss.setItem(SESSION_KEY, "EUR");

      writeManualCurrency(null);

      expect(ls.getItem(PERSISTENT_KEY)).toBeNull();
      expect(ss.getItem(SESSION_KEY)).toBeNull();
    });

    it("is a no-op and does not throw when window is undefined (SSR guard)", () => {
      vi.stubGlobal("window", undefined);
      expect(() =>
        writeManualCurrency({ code: "AED", persistent: true }),
      ).not.toThrow();
    });

    it("does not throw when localStorage.setItem throws (best-effort)", () => {
      vi.stubGlobal("window", {
        localStorage: {
          setItem: () => { throw new Error("QuotaExceededError"); },
          removeItem: () => {},
        },
        sessionStorage: ss,
      });
      expect(() =>
        writeManualCurrency({ code: "AED", persistent: true }),
      ).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // readManualCurrency
  // ---------------------------------------------------------------------------

  describe("readManualCurrency", () => {
    it("returns persistent state when localStorage has a supported code", () => {
      ls.setItem(PERSISTENT_KEY, "AED");

      expect(readManualCurrency()).toEqual({ code: "AED", persistent: true });
    });

    it("returns session state when only sessionStorage has a code", () => {
      ss.setItem(SESSION_KEY, "EUR");

      expect(readManualCurrency()).toEqual({ code: "EUR", persistent: false });
    });

    it("localStorage beats sessionStorage when both are set", () => {
      ls.setItem(PERSISTENT_KEY, "AED");
      ss.setItem(SESSION_KEY, "EUR");

      expect(readManualCurrency()).toEqual({ code: "AED", persistent: true });
    });

    it("returns null when neither storage has a value", () => {
      expect(readManualCurrency()).toBeNull();
    });

    it("ignores an unsupported code in localStorage and falls back to sessionStorage", () => {
      ls.setItem(PERSISTENT_KEY, "XYZ");
      ss.setItem(SESSION_KEY, "GBP");

      expect(readManualCurrency()).toEqual({ code: "GBP", persistent: false });
    });

    it("ignores an unsupported code in sessionStorage", () => {
      ss.setItem(SESSION_KEY, "BOGUS");

      expect(readManualCurrency()).toBeNull();
    });

    it("returns null when window is undefined (SSR guard)", () => {
      vi.stubGlobal("window", undefined);

      expect(readManualCurrency()).toBeNull();
    });

    it("does not throw when localStorage.getItem throws and falls back to sessionStorage", () => {
      vi.stubGlobal("window", {
        localStorage: {
          getItem: () => { throw new Error("SecurityError"); },
        },
        sessionStorage: ss,
      });
      ss.setItem(SESSION_KEY, "CAD");

      expect(() => readManualCurrency()).not.toThrow();
      expect(readManualCurrency()).toEqual({ code: "CAD", persistent: false });
    });
  });

  // ---------------------------------------------------------------------------
  // Round-trip: write then read
  // ---------------------------------------------------------------------------

  describe("round-trip (write → read)", () => {
    it("persistent write is returned by read", () => {
      writeManualCurrency({ code: "KWD", persistent: true });
      expect(readManualCurrency()).toEqual({ code: "KWD", persistent: true });
    });

    it("session write is returned by read", () => {
      writeManualCurrency({ code: "CAD", persistent: false });
      expect(readManualCurrency()).toEqual({ code: "CAD", persistent: false });
    });

    it("toggling persistence off moves the value from localStorage to sessionStorage", () => {
      writeManualCurrency({ code: "AUD", persistent: true });
      expect(ls.getItem(PERSISTENT_KEY)).toBe("AUD");
      expect(ss.getItem(SESSION_KEY)).toBeNull();

      writeManualCurrency({ code: "AUD", persistent: false });
      expect(ls.getItem(PERSISTENT_KEY)).toBeNull();
      expect(ss.getItem(SESSION_KEY)).toBe("AUD");
      expect(readManualCurrency()).toEqual({ code: "AUD", persistent: false });
    });

    it("toggling persistence on moves the value from sessionStorage to localStorage", () => {
      writeManualCurrency({ code: "CHF", persistent: false });
      expect(ss.getItem(SESSION_KEY)).toBe("CHF");
      expect(ls.getItem(PERSISTENT_KEY)).toBeNull();

      writeManualCurrency({ code: "CHF", persistent: true });
      expect(ls.getItem(PERSISTENT_KEY)).toBe("CHF");
      expect(ss.getItem(SESSION_KEY)).toBeNull();
      expect(readManualCurrency()).toEqual({ code: "CHF", persistent: true });
    });

    it("null write clears a previously persistent choice", () => {
      writeManualCurrency({ code: "QAR", persistent: true });
      writeManualCurrency(null);
      expect(readManualCurrency()).toBeNull();
    });

    it("null write clears a previously session-only choice", () => {
      writeManualCurrency({ code: "SAR", persistent: false });
      writeManualCurrency(null);
      expect(readManualCurrency()).toBeNull();
    });
  });
});
