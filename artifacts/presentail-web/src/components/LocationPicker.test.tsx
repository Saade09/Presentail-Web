// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the component is imported so Vitest
// can hoist them before any other import in this file.
// ---------------------------------------------------------------------------

const mockSetLocation = vi.fn();
const mockOnComplete = vi.fn();

vi.mock("@/contexts/LocationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/LocationContext")>();
  return {
    ...actual,
    useLocationSelection: vi.fn(() => ({
      countries: MOCK_COUNTRIES,
      isLoadingCountries: false,
      setLocation: mockSetLocation,
      countryCode: null,
      cityId: null,
      country: null,
      city: null,
      isPickerOpen: false,
      pickerForceCountryStep: false,
      openPicker: vi.fn(),
      closePicker: vi.fn(),
      clearLocation: vi.fn(),
    })),
  };
});

vi.mock("@/components/CountryFlag", () => ({
  CountryFlag: ({ code }: { code: string }) => <span data-testid={`flag-${code}`} />,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_COUNTRIES = [
  {
    id: "lb",
    name: "Lebanon",
    code: "LB",
    flag: "🇱🇧",
    currency: "USD",
    isActive: true,
    cities: [
      {
        id: "lb-beirut",
        name: "Beirut",
        isActive: true,
        expressAvailable: true,
        expressDeliveryLabel: "",
        sameDayCutoffHour: 22,
        timeSlots: [],
      },
      {
        id: "lb-metn",
        name: "Metn",
        isActive: true,
        expressAvailable: false,
        expressDeliveryLabel: "",
        sameDayCutoffHour: 22,
        timeSlots: [],
      },
      {
        id: "lb-bent-jbeil",
        name: "Bent Jbeil",
        isActive: false,
        expressAvailable: false,
        expressDeliveryLabel: "",
        sameDayCutoffHour: 22,
        timeSlots: [],
      },
      {
        id: "lb-hermel",
        name: "Hermel",
        isActive: false,
        expressAvailable: false,
        expressDeliveryLabel: "",
        sameDayCutoffHour: 22,
        timeSlots: [],
      },
    ],
  },
  {
    id: "ae",
    name: "United Arab Emirates",
    code: "AE",
    flag: "🇦🇪",
    currency: "AED",
    isActive: true,
    cities: [
      {
        id: "ae-dubai",
        name: "Dubai",
        isActive: true,
        expressAvailable: true,
        expressDeliveryLabel: "",
        sameDayCutoffHour: 22,
        timeSlots: [],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Import component under test AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import { LocationPicker } from "./LocationPicker";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockSetLocation.mockClear();
  mockOnComplete.mockClear();
});

describe("LocationPicker — country step", () => {
  it("renders all active picker countries", () => {
    renderWithProviders(<LocationPicker />);
    expect(screen.getByTestId("button-country-lb")).toBeTruthy();
    expect(screen.getByTestId("button-country-ae")).toBeTruthy();
  });

  it("advances to the city step when a country is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LocationPicker />);
    await user.click(screen.getByTestId("button-country-lb"));
    expect(screen.getByTestId("button-city-lb-beirut")).toBeTruthy();
  });
});

describe("LocationPicker — city step (inactive city handling)", () => {
  it("renders all cities (active and inactive) once a country is selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LocationPicker />);
    await user.click(screen.getByTestId("button-country-lb"));

    expect(screen.getByTestId("button-city-lb-beirut")).toBeTruthy();
    expect(screen.getByTestId("button-city-lb-metn")).toBeTruthy();
    expect(screen.getByTestId("button-city-lb-bent-jbeil")).toBeTruthy();
    expect(screen.getByTestId("button-city-lb-hermel")).toBeTruthy();
  });

  it("active cities are enabled and clickable", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LocationPicker onComplete={mockOnComplete} />);
    await user.click(screen.getByTestId("button-country-lb"));

    const beirutBtn = screen.getByTestId("button-city-lb-beirut") as HTMLButtonElement;
    expect(beirutBtn.disabled).toBe(false);
    await user.click(beirutBtn);
    expect(mockSetLocation).toHaveBeenCalledWith("LB", "lb-beirut");
    expect(mockOnComplete).toHaveBeenCalledWith({ countryCode: "LB", cityId: "lb-beirut" });
  });

  it("inactive cities are disabled (cannot be clicked)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LocationPicker onComplete={mockOnComplete} />);
    await user.click(screen.getByTestId("button-country-lb"));

    const bentJbeilBtn = screen.getByTestId("button-city-lb-bent-jbeil") as HTMLButtonElement;
    expect(bentJbeilBtn.disabled).toBe(true);

    await user.click(bentJbeilBtn);
    expect(mockSetLocation).not.toHaveBeenCalled();
    expect(mockOnComplete).not.toHaveBeenCalled();
  });

  it("inactive cities display the unavailability label", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LocationPicker />,
      { locale: { t: (key: string) => key === "location.cityUnavailable" ? "Not available at the moment" : key } },
    );
    await user.click(screen.getByTestId("button-country-lb"));

    const hermelBtn = screen.getByTestId("button-city-lb-hermel");
    expect(hermelBtn.textContent).toContain("Not available at the moment");

    const beirutBtn = screen.getByTestId("button-city-lb-beirut");
    expect(beirutBtn.textContent).not.toContain("Not available at the moment");
  });

  it("all inactive cities are disabled while active ones are enabled", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LocationPicker />);
    await user.click(screen.getByTestId("button-country-lb"));

    for (const id of ["lb-bent-jbeil", "lb-hermel"]) {
      const btn = screen.getByTestId(`button-city-${id}`) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    }
    for (const id of ["lb-beirut", "lb-metn"]) {
      const btn = screen.getByTestId(`button-city-${id}`) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    }
  });
});

describe("LocationPicker — pre-selected country (initialCountryCode)", () => {
  it("skips the country step and shows cities directly when initialCountryCode is set", () => {
    renderWithProviders(<LocationPicker initialCountryCode="LB" />);
    expect(screen.getByTestId("button-city-lb-beirut")).toBeTruthy();
    const bentJbeilBtn = screen.getByTestId("button-city-lb-bent-jbeil") as HTMLButtonElement;
    expect(bentJbeilBtn.disabled).toBe(true);
  });
});
