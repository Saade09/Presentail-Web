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
  {
    id: "cy",
    name: "Cyprus",
    code: "CY",
    flag: "🇨🇾",
    currency: "EUR",
    isActive: true,
    cities: [
      {
        id: "cy-larnaca",
        name: "Larnaca",
        isActive: true,
        expressAvailable: false,
        expressDeliveryLabel: "",
        sameDayCutoffHour: 22,
        timeSlots: [],
      },
      {
        id: "cy-limassol",
        name: "Limassol",
        isActive: false,
        expressAvailable: false,
        expressDeliveryLabel: "",
        sameDayCutoffHour: 22,
        timeSlots: [],
      },
      {
        id: "cy-nicosia",
        name: "Nicosia",
        isActive: false,
        expressAvailable: false,
        expressDeliveryLabel: "",
        sameDayCutoffHour: 22,
        timeSlots: [],
      },
      {
        id: "cy-paphos",
        name: "Paphos",
        isActive: false,
        expressAvailable: false,
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
    expect(screen.getByTestId("button-country-cy")).toBeTruthy();
  });

  it("advances to the delivery area step when a country is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LocationPicker />);
    await user.click(screen.getByTestId("button-country-lb"));
    expect(screen.getByTestId("button-city-lb-beirut")).toBeTruthy();
  });
});

describe("LocationPicker — delivery area step (inactive area handling)", () => {
  it("renders all areas (active and inactive) once a country is selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LocationPicker />);
    await user.click(screen.getByTestId("button-country-lb"));

    expect(screen.getByTestId("button-city-lb-beirut")).toBeTruthy();
    expect(screen.getByTestId("button-city-lb-metn")).toBeTruthy();
    expect(screen.getByTestId("button-city-lb-bent-jbeil")).toBeTruthy();
    expect(screen.getByTestId("button-city-lb-hermel")).toBeTruthy();
  });

  it("active areas are enabled and clickable", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LocationPicker onComplete={mockOnComplete} />);
    await user.click(screen.getByTestId("button-country-lb"));

    const beirutBtn = screen.getByTestId("button-city-lb-beirut") as HTMLButtonElement;
    expect(beirutBtn.disabled).toBe(false);
    await user.click(beirutBtn);
    expect(mockSetLocation).toHaveBeenCalledWith("LB", "lb-beirut");
    expect(mockOnComplete).toHaveBeenCalledWith({ countryCode: "LB", cityId: "lb-beirut" });
  });

  it("inactive areas are disabled (cannot be clicked)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LocationPicker onComplete={mockOnComplete} />);
    await user.click(screen.getByTestId("button-country-lb"));

    const bentJbeilBtn = screen.getByTestId("button-city-lb-bent-jbeil") as HTMLButtonElement;
    expect(bentJbeilBtn.disabled).toBe(true);

    await user.click(bentJbeilBtn);
    expect(mockSetLocation).not.toHaveBeenCalled();
    expect(mockOnComplete).not.toHaveBeenCalled();
  });

  it("inactive areas have aria-disabled and are not in tab order", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LocationPicker />);
    await user.click(screen.getByTestId("button-country-lb"));

    const hermelBtn = screen.getByTestId("button-city-lb-hermel") as HTMLButtonElement;
    expect(hermelBtn.getAttribute("aria-disabled")).toBe("true");
    expect(hermelBtn.tabIndex).toBe(-1);
  });

  it("inactive areas do not show the old inline unavailability label", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LocationPicker />);
    await user.click(screen.getByTestId("button-country-lb"));

    const hermelBtn = screen.getByTestId("button-city-lb-hermel");
    expect(hermelBtn.textContent).not.toContain("Not available");
    expect(hermelBtn.textContent).not.toContain("unavailable");
  });

  it("all inactive areas are disabled while active ones are enabled", async () => {
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

describe("LocationPicker — two-section layout (mixed-availability country)", () => {
  it("shows 'Available now' and 'Coming soon' section headers for Cyprus", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LocationPicker />,
      {
        locale: {
          t: (key: string) => {
            if (key === "locationPicker.availableNow") return "Available now";
            if (key === "locationPicker.comingSoon") return "Coming soon";
            return key;
          },
        },
      },
    );
    await user.click(screen.getByTestId("button-country-cy"));

    expect(screen.getByTestId("section-available-now").textContent).toBe("Available now");
    expect(screen.getByTestId("section-coming-soon").textContent).toBe("Coming soon");
  });

  it("shows dynamic 'currently deliver to' description for mixed-availability country", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LocationPicker />,
      {
        locale: {
          t: (key: string, params?: Record<string, string>) => {
            if (key === "locationPicker.currentlyDeliverTo" && params?.areas) {
              return `We currently deliver to ${params.areas}. More areas are coming soon.`;
            }
            return key;
          },
          cityName: (_id: string, name: string) => name,
        },
      },
    );
    await user.click(screen.getByTestId("button-country-cy"));

    const desc = screen.getByTestId("area-description");
    expect(desc.textContent).toContain("Larnaca");
    expect(desc.textContent).toContain("More areas are coming soon");
  });

  it("does not show 'Available now'/'Coming soon' headers for all-active country", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LocationPicker />);
    await user.click(screen.getByTestId("button-country-ae"));

    expect(screen.queryByTestId("section-available-now")).toBeNull();
    expect(screen.queryByTestId("section-coming-soon")).toBeNull();
  });

  it("shows 'Delivery areas in {country}' label for all-active country", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LocationPicker />,
      {
        locale: {
          t: (key: string, params?: Record<string, string>) => {
            if (key === "locationPicker.deliveryAreasIn" && params?.country) {
              return `Delivery areas in ${params.country}`;
            }
            return key;
          },
          countryName: (_code: string, name: string) => name,
        },
      },
    );
    await user.click(screen.getByTestId("button-country-ae"));

    const label = screen.getByTestId("section-delivery-areas");
    expect(label.textContent).toContain("United Arab Emirates");
  });

  it("shows generic description for all-active country", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LocationPicker />,
      {
        locale: {
          t: (key: string) => {
            if (key === "locationPicker.chooseAreaDescription") {
              return "Choose a delivery area to see available gifts and delivery options.";
            }
            return key;
          },
        },
      },
    );
    await user.click(screen.getByTestId("button-country-ae"));

    const desc = screen.getByTestId("area-description");
    expect(desc.textContent).toContain("Choose a delivery area");
  });
});

describe("LocationPicker — dynamic step-2 heading", () => {
  it("shows dynamic country-name heading when a country is selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LocationPicker />,
      {
        locale: {
          t: (key: string, params?: Record<string, string>) => {
            if (key === "locationPicker.whereInCountry" && params?.country) {
              return `Where in ${params.country} should we deliver?`;
            }
            return key;
          },
          countryName: (_code: string, name: string) => name,
        },
      },
    );
    await user.click(screen.getByTestId("button-country-lb"));

    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Lebanon");
  });

  it("heading updates when a different country is selected after going back", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LocationPicker />,
      {
        locale: {
          t: (key: string, params?: Record<string, string>) => {
            if (key === "locationPicker.whereInCountry" && params?.country) {
              return `Where in ${params.country} should we deliver?`;
            }
            return key;
          },
          countryName: (_code: string, name: string) => name,
        },
      },
    );
    await user.click(screen.getByTestId("button-country-lb"));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Lebanon");

    await user.click(screen.getByTestId("button-picker-change"));
    await user.click(screen.getByTestId("button-country-cy"));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Cyprus");
  });
});

describe("LocationPicker — 'Delivering to' compact selector", () => {
  it("shows the 'Delivering to' row with a Change button after country is selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LocationPicker />,
      {
        locale: {
          t: (key: string) => {
            if (key === "locationPicker.deliveringTo") return "Delivering to";
            if (key === "locationPicker.change") return "Change";
            return key;
          },
        },
      },
    );
    await user.click(screen.getByTestId("button-country-lb"));

    expect(screen.getByTestId("delivering-to-row")).toBeTruthy();
    expect(screen.getByTestId("button-picker-change")).toBeTruthy();
    expect(screen.getByTestId("button-picker-change").textContent).toBe("Change");
  });

  it("clicking Change goes back to the country step", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LocationPicker />);
    await user.click(screen.getByTestId("button-country-lb"));

    expect(screen.queryByTestId("button-country-lb")).toBeNull();
    await user.click(screen.getByTestId("button-picker-change"));
    expect(screen.getByTestId("button-country-lb")).toBeTruthy();
  });
});

describe("LocationPicker — pre-selected country (initialCountryCode)", () => {
  it("skips the country step and shows delivery areas directly when initialCountryCode is set", () => {
    renderWithProviders(<LocationPicker initialCountryCode="LB" />);
    expect(screen.getByTestId("button-city-lb-beirut")).toBeTruthy();
    const bentJbeilBtn = screen.getByTestId("button-city-lb-bent-jbeil") as HTMLButtonElement;
    expect(bentJbeilBtn.disabled).toBe(true);
  });
});
