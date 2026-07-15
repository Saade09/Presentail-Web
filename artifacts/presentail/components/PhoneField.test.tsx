/**
 * Unit tests for <PhoneField /> — IL country blocklist
 *
 * PhoneField passes a `countryPickerProps.countryCodes` array to
 * react-native-phone-number-input's <PhoneInput> after filtering out every
 * code listed in PHONE_COUNTRY_BLOCKLIST.  These tests pin that behaviour so a
 * future refactor or dependency change cannot silently re-expose a blocked
 * country to users.
 *
 * Mocking strategy
 * ----------------
 * react-native-phone-number-input is replaced with a spy component that
 * records the `countryPickerProps` it receives.  Native hooks (useColors,
 * useT) and libphonenumber-js are stubbed to keep the test free of native
 * modules and network dependencies.  react-native itself is already mocked
 * globally by tests/setup.ts.
 */

import React, { act } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as ReactTestRenderer from "react-test-renderer";

import { PHONE_COUNTRY_BLOCKLIST } from "@workspace/catalog-data";

// ---------------------------------------------------------------------------
// Capture countryPickerProps passed to <PhoneInput>
// ---------------------------------------------------------------------------

type CapturedPickerProps = { countryCodes?: string[] };
let capturedCountryPickerProps: CapturedPickerProps | undefined;

vi.mock("react-native-phone-number-input", () => ({
  default: (props: { countryPickerProps?: CapturedPickerProps }) => {
    capturedCountryPickerProps = props.countryPickerProps;
    return null;
  },
}));

// ---------------------------------------------------------------------------
// Stub native hooks required by PhoneField
// ---------------------------------------------------------------------------

vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    primary: "#0a5663",
    border: "#e0d6cc",
    mutedForeground: "#9e8977",
    gold: "#b8860b",
  }),
}));

vi.mock("@/hooks/useT", () => ({
  useT: () =>
    new Proxy({} as Record<string, string>, {
      get: (_t, prop) => String(prop),
    }),
}));

// ---------------------------------------------------------------------------
// Stub libphonenumber-js (used in getCountryPlaceholder / checkPhoneValid)
// ---------------------------------------------------------------------------

vi.mock("libphonenumber-js", () => ({
  AsYouType: class {
    input(text: string) { return text; }
  },
  getExampleNumber: () => null,
  isValidPhoneNumber: () => true,
}));

vi.mock("libphonenumber-js/examples.mobile.json", () => ({ default: {} }));

// ---------------------------------------------------------------------------
// Import the component under test AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

import { PhoneField } from "./PhoneField";
import type { CountryDialCode } from "@/data/countryCodes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPhoneField() {
  const defaultCountry: CountryDialCode = {
    code: "LB",
    name: "Lebanon",
    dial: "+961",
    flag: "🇱🇧",
  };

  act(() => {
    ReactTestRenderer.create(
      <PhoneField
        label="Phone"
        value=""
        onChangeText={() => {}}
        countryCode={defaultCountry.code}
        onChangeCountry={() => {}}
      />,
    );
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PhoneField — IL country blocklist", () => {
  beforeEach(() => {
    capturedCountryPickerProps = undefined;
  });

  it("countryPickerProps.countryCodes does not contain 'IL'", () => {
    renderPhoneField();

    const codes = capturedCountryPickerProps?.countryCodes ?? [];
    expect(codes).not.toContain("IL");
  });

  it("excludes every entry from PHONE_COUNTRY_BLOCKLIST in countryPickerProps.countryCodes", () => {
    renderPhoneField();

    const codes = capturedCountryPickerProps?.countryCodes ?? [];
    for (const blocked of PHONE_COUNTRY_BLOCKLIST) {
      expect(
        codes,
        `"${blocked}" is in PHONE_COUNTRY_BLOCKLIST and must not appear in countryPickerProps.countryCodes`,
      ).not.toContain(blocked);
    }
  });

  it("countryPickerProps.countryCodes is defined and non-empty", () => {
    renderPhoneField();

    const codes = capturedCountryPickerProps?.countryCodes;
    expect(codes).toBeDefined();
    expect(codes!.length).toBeGreaterThan(0);
  });

  it("countryPickerProps.countryCodes still includes common non-blocked countries", () => {
    renderPhoneField();

    const codes = capturedCountryPickerProps?.countryCodes ?? [];
    expect(codes).toContain("LB");
    expect(codes).toContain("AE");
    expect(codes).toContain("US");
  });
});
