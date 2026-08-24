// @vitest-environment jsdom

// Component tests for DeliveryDetailsField (checkout landmark recognition).
//
// Coverage:
//  - Typing ≥2 chars triggers a debounced search and shows the dropdown with
//    verified suggestions + the always-present "Continue as typed" row.
//  - The field NEVER auto-converts — onSelectPlace fires only on explicit
//    click or Enter on a highlighted suggestion.
//  - Keyboard: ArrowDown + Enter selects; Enter with no highlight does not.
//  - Empty results and API failure show no dropdown (free text unaffected).
//  - Stale responses never overwrite newer ones (request sequencing).
//  - Verified-place card mode: card content, district notice, follow-up
//    field (OS question/placeholder with fallbacks), Change action.

import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";
import DeliveryDetailsField, {
  flattenPlaceAddress,
  type CheckoutPlace,
} from "./DeliveryDetailsField";

const { apiFetchMock, trackWebEventMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  trackWebEventMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch: apiFetchMock }));
vi.mock("@/lib/analytics", () => ({ trackWebEvent: trackWebEventMock }));

const PLACE: CheckoutPlace = {
  id: "p1",
  name: "AUBMC",
  officialName: "American University of Beirut Medical Center",
  area: "Hamra",
  districtName: "Beirut",
  districtCityId: "lb-beirut",
  districtCityName: "Beirut",
  countryCode: "LB",
  lat: 33.9,
  lng: 35.48,
  verified: true,
  followUpQuestion: "Where inside AUBMC?",
  followUpPlaceholder: "Building, department, floor",
};

function makeProps(overrides: Partial<React.ComponentProps<typeof DeliveryDetailsField>> = {}) {
  return {
    value: "",
    onChange: vi.fn(),
    countryCode: "LB",
    selectedPlace: null,
    internalDetail: "",
    onInternalDetailChange: vi.fn(),
    onSelectPlace: vi.fn(),
    onClearPlace: vi.fn(),
    districtNotice: null,
    addressError: false,
    detailError: false,
    invalidControlClass: "border-destructive",
    isMobile: false,
    ...overrides,
  };
}

/** Controlled-value wrapper so typing updates the textarea like in Checkout. */
function Harness(props: ReturnType<typeof makeProps>) {
  const [value, setValue] = useState(props.value);
  return (
    <DeliveryDetailsField
      {...props}
      value={value}
      onChange={(v: string) => {
        setValue(v);
        props.onChange(v);
      }}
    />
  );
}

beforeEach(() => {
  apiFetchMock.mockReset();
  trackWebEventMock.mockReset();
});

describe("DeliveryDetailsField — free-text mode", () => {
  it("shows suggestions + continue-as-typed after typing, without auto-converting", async () => {
    apiFetchMock.mockResolvedValue({ ok: true, places: [PLACE] });
    const props = makeProps();
    renderWithProviders(<Harness {...props} />);

    await userEvent.type(screen.getByTestId("input-recipient-address"), "AUB");

    await waitFor(() => {
      expect(screen.getByTestId("dropdown-place-suggestions")).toBeTruthy();
    });
    expect(screen.getByTestId("option-place-p1").textContent).toContain("AUBMC");
    expect(screen.getByTestId("option-place-p1").textContent).toContain(
      "American University of Beirut Medical Center",
    );
    expect(screen.getByTestId("option-continue-as-typed")).toBeTruthy();
    // Never auto-convert on results — explicit action only.
    expect(props.onSelectPlace).not.toHaveBeenCalled();
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/address-book/places/search?q=AUB&country=LB"),
    );
  });

  it("selects a place only on explicit click, passing the typed query", async () => {
    apiFetchMock.mockResolvedValue({ ok: true, places: [PLACE] });
    const props = makeProps();
    renderWithProviders(<Harness {...props} />);

    await userEvent.type(screen.getByTestId("input-recipient-address"), "AUB");
    await waitFor(() => expect(screen.getByTestId("option-place-p1")).toBeTruthy());

    await userEvent.click(screen.getByTestId("option-place-p1"));
    expect(props.onSelectPlace).toHaveBeenCalledWith(PLACE, "AUB");
    expect(trackWebEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "landmark_suggestion_selected" }),
    );
  });

  it("Enter without a highlighted suggestion does not select; ArrowDown+Enter does", async () => {
    apiFetchMock.mockResolvedValue({ ok: true, places: [PLACE] });
    const props = makeProps();
    renderWithProviders(<Harness {...props} />);

    const textarea = screen.getByTestId("input-recipient-address");
    await userEvent.type(textarea, "AUB");
    await waitFor(() => expect(screen.getByTestId("option-place-p1")).toBeTruthy());

    // Enter with nothing highlighted → no selection (textarea newline default).
    await userEvent.keyboard("{Enter}");
    expect(props.onSelectPlace).not.toHaveBeenCalled();

    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(props.onSelectPlace).toHaveBeenCalledWith(PLACE, "AUB");
  });

  it("continue-as-typed closes the dropdown and fires its analytics event", async () => {
    apiFetchMock.mockResolvedValue({ ok: true, places: [PLACE] });
    const props = makeProps();
    renderWithProviders(<Harness {...props} />);

    await userEvent.type(screen.getByTestId("input-recipient-address"), "AUB");
    await waitFor(() => expect(screen.getByTestId("option-continue-as-typed")).toBeTruthy());

    await userEvent.click(screen.getByTestId("option-continue-as-typed"));
    expect(props.onSelectPlace).not.toHaveBeenCalled();
    expect(screen.queryByTestId("dropdown-place-suggestions")).toBeNull();
    expect(trackWebEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "landmark_continued_as_typed" }),
    );
  });

  it("shows no dropdown when the search returns no results", async () => {
    apiFetchMock.mockResolvedValue({ ok: true, places: [] });
    renderWithProviders(<Harness {...makeProps()} />);

    await userEvent.type(screen.getByTestId("input-recipient-address"), "Somewhere");
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByTestId("dropdown-place-suggestions")).toBeNull();
  });

  it("degrades silently to free text when the API fails", async () => {
    apiFetchMock.mockRejectedValue(new Error("network down"));
    const props = makeProps();
    renderWithProviders(<Harness {...props} />);

    const textarea = screen.getByTestId("input-recipient-address") as HTMLTextAreaElement;
    await userEvent.type(textarea, "AUB Hamra");
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByTestId("dropdown-place-suggestions")).toBeNull();
    // Free-text value untouched.
    expect(textarea.value).toBe("AUB Hamra");
  });

  it("drops stale responses (request sequencing)", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    const first = new Promise((r) => { resolveFirst = r; });
    const stalePlace = { ...PLACE, id: "stale", name: "Stale Hospital" };
    apiFetchMock
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce({ ok: true, places: [PLACE] });

    renderWithProviders(<Harness {...makeProps()} />);
    const textarea = screen.getByTestId("input-recipient-address");

    await userEvent.type(textarea, "AU");
    // Wait out the debounce so the first (slow) request actually fires.
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    await userEvent.type(textarea, "B");
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("option-place-p1")).toBeTruthy());

    // The stale first response arrives late — it must NOT replace the newer one.
    await act(async () => {
      resolveFirst({ ok: true, places: [stalePlace] });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByTestId("option-place-stale")).toBeNull();
    expect(screen.getByTestId("option-place-p1")).toBeTruthy();
  });
});

describe("DeliveryDetailsField — verified-place card mode", () => {
  it("renders the card with name, official name, area/district, badge, and Change", async () => {
    const props = makeProps({ selectedPlace: PLACE });
    renderWithProviders(<DeliveryDetailsField {...props} />);

    expect(screen.getByTestId("card-selected-place")).toBeTruthy();
    expect(screen.getByTestId("text-selected-place-name").textContent).toBe("AUBMC");
    expect(screen.getByTestId("text-selected-place-official").textContent).toBe(
      "American University of Beirut Medical Center",
    );
    expect(screen.getByTestId("text-selected-place-location").textContent).toBe("Hamra, Beirut");
    // No search UI in card mode.
    expect(screen.queryByTestId("input-recipient-address")).toBeNull();

    await userEvent.click(screen.getByTestId("button-change-place"));
    expect(props.onClearPlace).toHaveBeenCalled();
  });

  it("shows the OS follow-up question and placeholder", () => {
    renderWithProviders(<DeliveryDetailsField {...makeProps({ selectedPlace: PLACE })} />);
    expect(screen.getByText("Where inside AUBMC?")).toBeTruthy();
    const input = screen.getByTestId("input-place-internal-detail") as HTMLInputElement;
    expect(input.placeholder).toBe("Building, department, floor");
  });

  it("falls back to localized follow-up copy when OS provides none", () => {
    const bare = { ...PLACE, followUpQuestion: null, followUpPlaceholder: null };
    renderWithProviders(<DeliveryDetailsField {...makeProps({ selectedPlace: bare })} />);
    // Default test locale t() returns the key itself.
    expect(screen.getByText("checkout.places.whereInside")).toBeTruthy();
    const input = screen.getByTestId("input-place-internal-detail") as HTMLInputElement;
    expect(input.placeholder).toBe("checkout.places.detailPh");
  });

  it("renders the district-updated notice only when provided", () => {
    const { rerender } = renderWithProviders(
      <DeliveryDetailsField {...makeProps({ selectedPlace: PLACE })} />,
    );
    expect(screen.queryByTestId("notice-place-district-updated")).toBeNull();

    rerender(
      <DeliveryDetailsField
        {...makeProps({
          selectedPlace: PLACE,
          districtNotice: { placeName: "AUBMC", districtName: "Beirut" },
        })}
      />,
    );
    expect(screen.getByTestId("notice-place-district-updated")).toBeTruthy();
  });

  it("shows the required-detail error when flagged", () => {
    renderWithProviders(
      <DeliveryDetailsField {...makeProps({ selectedPlace: PLACE, detailError: true })} />,
    );
    expect(screen.getByTestId("error-place-internal-detail")).toBeTruthy();
  });
});

describe("flattenPlaceAddress", () => {
  it("joins place name, official name, detail, and area/district", () => {
    expect(flattenPlaceAddress(PLACE, "Bldg 56, 3rd floor")).toBe(
      "AUBMC (American University of Beirut Medical Center) — Bldg 56, 3rd floor — Hamra, Beirut",
    );
  });

  it("omits empty parts and deduplicates area vs district", () => {
    const minimal: CheckoutPlace = {
      ...PLACE,
      officialName: null,
      area: "Beirut",
      districtCityName: "Beirut",
    };
    expect(flattenPlaceAddress(minimal, "")).toBe("AUBMC — Beirut");
  });
});
