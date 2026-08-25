import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ReactTestRenderer from "react-test-renderer";

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));

vi.mock("@expo/vector-icons", () => ({ Feather: () => null }));
vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    primary: "#00414E",
    border: "#E8E1D2",
    muted: "#F1ECE2",
    mutedForeground: "#69727D",
    card: "#ffffff",
    secondary: "#FAF6EE",
    gold: "#C9A94B",
    destructive: "#b3261e",
  }),
}));
vi.mock("@/hooks/useT", () => ({
  useT: () => new Proxy({} as Record<string, string>, { get: (_target, key) => String(key) }),
}));
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ isRTL: false }),
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/addressBookPlaces", () => ({
  searchCheckoutPlaces: searchMock,
  placeSecondaryLine: (place: { officialName: string | null }) => place.officialName,
}));

import { CheckoutPlaceField } from "./CheckoutPlaceField";

const suggestedPlace = {
  id: "aubmc",
  name: "AUBMC",
  officialName: "American University of Beirut Medical Center",
  area: "Hamra",
  districtName: "Beirut",
  districtCityId: "beirut",
  districtCityName: "Beirut",
  countryCode: "LB",
  lat: null,
  lng: null,
  verified: true as const,
  followUpQuestion: null,
  followUpPlaceholder: null,
};

function field(value: string, countryCode = "LB") {
  return (
    <CheckoutPlaceField
      value={value}
      onChange={() => {}}
      countryCode={countryCode}
      selectedPlace={null}
      internalDetail=""
      onInternalDetailChange={() => {}}
      onSelectPlace={() => {}}
      onClearPlace={() => {}}
      districtNotice={null}
      addressError={false}
      detailError={false}
    />
  );
}

describe("CheckoutPlaceField stale search protection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not show an old query's places while the new query is still debouncing", async () => {
    let resolveFirst: ((places: typeof suggestedPlace[]) => void) | undefined;
    searchMock.mockImplementationOnce(
      () =>
        new Promise<typeof suggestedPlace[]>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    let tree: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = ReactTestRenderer.create(field("AU"));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(searchMock).toHaveBeenCalledWith("AU", "LB");

    await act(async () => {
      tree!.update(field("Beach"));
    });
    await act(async () => {
      resolveFirst?.([suggestedPlace]);
      await Promise.resolve();
    });

    expect(tree!.root.findAllByProps({ testID: "dropdown-place-suggestions" })).toHaveLength(0);
  });
});