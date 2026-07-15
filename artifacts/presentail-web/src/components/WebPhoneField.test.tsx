// @vitest-environment jsdom
/**
 * Unit tests for <WebPhoneField /> — IL country blocklist
 *
 * The component derives its country list by calling getCountries() from
 * react-phone-number-input and filtering out every entry in
 * PHONE_COUNTRY_BLOCKLIST before passing the result to <PhoneInput>.
 *
 * These tests verify that the rendered country <select> never exposes a
 * blocked country code so that a future dependency upgrade or refactor cannot
 * silently re-introduce "IL" (or any other blocked entry) to users.
 *
 * Mocking strategy
 * ----------------
 * The default export of react-phone-number-input (<PhoneInput>) is replaced
 * with a lightweight stub that renders a plain <select> whose <option> values
 * mirror the `countries` prop.  getCountries() and isValidPhoneNumber() are
 * kept as the real implementations so the filtering logic under test is
 * exercised end-to-end.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";

vi.mock("react-phone-number-input", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-phone-number-input")>();
  return {
    ...actual,
    default: ({ countries, value, onChange }: {
      countries?: string[];
      value?: string;
      onChange?: (v: string | undefined) => void;
    }) => (
      <div>
        <select
          data-testid="country-select"
          value=""
          onChange={() => {}}
          aria-label="Phone country"
        >
          {(countries ?? []).map((c: string) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          data-testid="phone-input"
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value || undefined)}
        />
      </div>
    ),
  };
});

import { WebPhoneField } from "./WebPhoneField";
import { PHONE_COUNTRY_BLOCKLIST } from "@workspace/catalog-data";

describe("WebPhoneField — IL country blocklist", () => {
  it("does not include 'IL' in the rendered country <select> options", () => {
    renderWithProviders(<WebPhoneField value="" onChange={() => {}} />);

    const select = screen.getByTestId("country-select") as HTMLSelectElement;
    const renderedCodes = Array.from(select.options).map((o) => o.value);

    expect(renderedCodes).not.toContain("IL");
  });

  it("excludes every entry from PHONE_COUNTRY_BLOCKLIST in the rendered options", () => {
    renderWithProviders(<WebPhoneField value="" onChange={() => {}} />);

    const select = screen.getByTestId("country-select") as HTMLSelectElement;
    const renderedCodes = Array.from(select.options).map((o) => o.value);

    for (const blocked of PHONE_COUNTRY_BLOCKLIST) {
      expect(
        renderedCodes,
        `"${blocked}" is in PHONE_COUNTRY_BLOCKLIST and must not appear in the country <select>`,
      ).not.toContain(blocked);
    }
  });

  it("still renders non-blocked countries (sanity check)", () => {
    renderWithProviders(<WebPhoneField value="" onChange={() => {}} />);

    const select = screen.getByTestId("country-select") as HTMLSelectElement;
    const renderedCodes = Array.from(select.options).map((o) => o.value);

    expect(renderedCodes).toContain("LB");
    expect(renderedCodes).toContain("AE");
    expect(renderedCodes).toContain("US");
  });
});
