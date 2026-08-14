// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";
import React from "react";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before component import (vi.mock is hoisted)
// ---------------------------------------------------------------------------

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: () => ({
    countryCode: "AE",
    cityId: "ae-dubai",
    city: null,
    country: null,
  }),
}));

vi.mock("@/components/FormattedPrice", () => ({
  FormattedPrice: ({ usdValue }: { usdValue: number }) => (
    <span data-testid="formatted-price">${usdValue}</span>
  ),
}));

vi.mock("@/components/product/FrequentlyBoughtTogether", () => ({
  FrequentlyBoughtTogether: () => <div data-testid="legacy-fbt" />,
}));

const trackWebEventMock = vi.fn();
vi.mock("@/lib/analytics", () => ({
  trackWebEvent: (...args: unknown[]) => trackWebEventMock(...args),
  getOrCreateSessionId: () => "test-session",
}));

const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { CompleteYourGift, type CygResponse, type CygSlot } from "./CompleteYourGift";
import type { Product } from "@/lib/queries";

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

const anchor: Product = {
  id: "crimson-rose-vase",
  wcId: 0,
  name: "Crimson Rose Vase",
  price: "100",
  priceValue: 100,
  image: { uri: "https://img/anchor.jpg" },
  images: [{ uri: "https://img/anchor.jpg" }],
  category: "bouquets",
  categories: ["bouquets"],
  occasions: [],
  inStock: true,
  discountPriceValue: null,
  discountPriceAed: null,
} as Product;

function makeSlot(overrides: Partial<CygSlot> = {}): CygSlot {
  return {
    category: "chocolate",
    slotIndex: 0,
    productSlug: "premium-chocolates",
    osNumericId: "11",
    wcId: null,
    name: "Premium Chocolates",
    imageUrl: "https://img/choc.jpg",
    imageAlt: "Premium Chocolates box",
    incrementalPrice: 45,
    regularPrice: null,
    currency: "AED",
    incrementalPriceUsd: 20,
    regularPriceUsd: null,
    inStock: true,
    requiresOptions: false,
    quantity: { min: 1, max: 10 },
    rulesVersion: "cyg-rules-v1",
    token: "tok-choc",
    ...overrides,
  };
}

const chocolateSlot = makeSlot();
const cakeSlot = makeSlot({
  category: "cake",
  slotIndex: 1,
  productSlug: "vanilla-cake",
  name: "Vanilla Cake",
  incrementalPriceUsd: 30,
  incrementalPrice: 110,
  requiresOptions: true,
  token: "tok-cake",
});

function makeResponse(overrides: Partial<CygResponse> = {}): CygResponse {
  return {
    enabled: true,
    experiment: { id: "complete-your-gift-v1", variant: "treatment", mode: "on" },
    rulesVersion: "cyg-rules-v1",
    slots: [chocolateSlot, cakeSlot],
    ...overrides,
  };
}

// t() that supports the {param} interpolation the component relies on.
const t = (key: string, params?: Record<string, unknown>) => {
  let out = key;
  for (const [k, v] of Object.entries(params ?? {})) {
    out += `|${k}=${String(v)}`;
  }
  return out;
};

function renderModule(cartOverrides: Record<string, unknown> = {}) {
  return renderWithProviders(
    <CompleteYourGift slug={anchor.id} anchor={anchor} onBundleAdded={onBundleAdded} />,
    { locale: { t: t as (key: string) => string }, cart: cartOverrides },
  );
}

const onBundleAdded = vi.fn();

const eventsOfType = (type: string) =>
  trackWebEventMock.mock.calls.filter((c) => (c[0] as { type: string }).type === type);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CompleteYourGift", () => {
  it("reserves layout space while loading (no legacy FBT flash)", async () => {
    apiFetchMock.mockReturnValue(new Promise(() => {}));
    renderModule();
    expect(screen.getByTestId("cyg-loading")).toBeTruthy();
    expect(screen.queryByTestId("legacy-fbt")).toBeNull();
  });

  it("falls back to the legacy FBT module when the flag is off", async () => {
    apiFetchMock.mockResolvedValue(makeResponse({ enabled: false, slots: [] }));
    renderModule();
    await waitFor(() => expect(screen.getByTestId("legacy-fbt")).toBeTruthy());
    expect(screen.queryByTestId("complete-your-gift")).toBeNull();
  });

  it("falls back to the legacy FBT module when the endpoint errors", async () => {
    apiFetchMock.mockRejectedValue(new Error("timeout"));
    renderModule();
    await waitFor(() => expect(screen.getByTestId("legacy-fbt")).toBeTruthy());
  });

  it("renders only returned slots and fires module view + impressions once", async () => {
    apiFetchMock.mockResolvedValue(makeResponse());
    renderModule();
    await waitFor(() => expect(screen.getByTestId("complete-your-gift")).toBeTruthy());

    expect(screen.getByTestId("cyg-slot-chocolate")).toBeTruthy();
    expect(screen.getByTestId("cyg-slot-cake")).toBeTruthy();
    expect(screen.queryByTestId("cyg-slot-balloon")).toBeNull();
    expect(screen.queryByTestId("cyg-slot-stuffed-animal")).toBeNull();

    await waitFor(() => expect(eventsOfType("upsell_module_view")).toHaveLength(1));
    const impressions = eventsOfType("upsell_item_impression");
    expect(impressions).toHaveLength(2);
    expect(impressions[0][0].properties.token).toBe("tok-choc");
    expect(impressions[0][0].properties.modelVersion).toBe("cyg-rules-v1");
    expect(impressions[0][0].properties.experimentVariant).toBe("treatment");
  });

  it("toggles a simple add-on optimistically and updates summary + CTA", async () => {
    apiFetchMock.mockResolvedValue(makeResponse());
    const user = userEvent.setup();
    renderModule();
    await waitFor(() => expect(screen.getByTestId("cyg-add-chocolate")).toBeTruthy());

    // Initial: 1 item, anchor price only, bouquet CTA label.
    let summary = screen.getByTestId("cyg-summary");
    expect(summary.textContent).toContain("product.cyg.item|count=1");
    expect(within(summary).getByTestId("formatted-price").textContent).toBe("$100");
    expect(screen.getByTestId("cyg-add-bundle").textContent).toBe("product.cyg.addToCart");

    // Select chocolate.
    const addBtn = screen.getByTestId("cyg-add-chocolate");
    await user.click(addBtn);
    expect(addBtn.getAttribute("aria-pressed")).toBe("true");
    expect(addBtn.textContent).toBe("product.cyg.added");
    expect(screen.getByTestId("cyg-selected-badge-chocolate")).toBeTruthy();
    summary = screen.getByTestId("cyg-summary");
    expect(summary.textContent).toContain("product.cyg.items|count=2");
    expect(within(summary).getByTestId("formatted-price").textContent).toBe("$120");
    expect(screen.getByTestId("cyg-add-bundle").textContent).toBe(
      "product.cyg.addItemsToCart|count=2",
    );
    expect(eventsOfType("upsell_add_click")).toHaveLength(1);

    // Quantity controls appear only after selection.
    await user.click(screen.getByTestId("cyg-qty-inc-chocolate"));
    expect(screen.getByTestId("cyg-qty-chocolate").textContent).toBe("2");
    summary = screen.getByTestId("cyg-summary");
    expect(within(summary).getByTestId("formatted-price").textContent).toBe("$140");
    expect(eventsOfType("upsell_quantity_change")).toHaveLength(1);

    // Pressing "✓ Added" removes the item.
    await user.click(addBtn);
    expect(addBtn.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("cyg-selected-badge-chocolate")).toBeNull();
    summary = screen.getByTestId("cyg-summary");
    expect(summary.textContent).toContain("product.cyg.item|count=1");
    expect(within(summary).getByTestId("formatted-price").textContent).toBe("$100");
    expect(eventsOfType("upsell_remove_click")).toHaveLength(1);
  });

  it("requires valid options before selecting a cake, and drafts survive reopen", async () => {
    apiFetchMock.mockResolvedValue(makeResponse());
    const user = userEvent.setup();
    renderModule();
    await waitFor(() => expect(screen.getByTestId("cyg-add-cake")).toBeTruthy());

    // + Add opens the dialog instead of selecting.
    await user.click(screen.getByTestId("cyg-add-cake"));
    expect(screen.getByTestId("cyg-options-dialog")).toBeTruthy();
    expect(screen.getByTestId("cyg-add-cake").getAttribute("aria-pressed")).toBe("false");
    expect(eventsOfType("upsell_option_open")).toHaveLength(1);

    // Confirm with empty note → validation error, still not selected.
    await user.click(screen.getByTestId("cyg-options-confirm"));
    expect(screen.getByTestId("cyg-options-error")).toBeTruthy();
    expect(screen.getByTestId("cyg-add-cake").getAttribute("aria-pressed")).toBe("false");

    // Type a draft, cancel, reopen → draft preserved.
    await user.type(screen.getByTestId("cyg-options-input"), "Happy Bday");
    await user.click(screen.getByTestId("cyg-options-cancel"));
    await waitFor(() => expect(screen.queryByTestId("cyg-options-dialog")).toBeNull());
    await user.click(screen.getByTestId("cyg-add-cake"));
    expect(
      (screen.getByTestId("cyg-options-input") as HTMLInputElement).value,
    ).toBe("Happy Bday");

    // Confirm → card selected, summary updates.
    await user.click(screen.getByTestId("cyg-options-confirm"));
    await waitFor(() => expect(screen.queryByTestId("cyg-options-dialog")).toBeNull());
    expect(screen.getByTestId("cyg-add-cake").getAttribute("aria-pressed")).toBe("true");
    expect(eventsOfType("upsell_option_selected")).toHaveLength(1);
    const summary = screen.getByTestId("cyg-summary");
    expect(within(summary).getByTestId("formatted-price").textContent).toBe("$130");
  });

  it("adds the bouquet plus selections in one CTA press with token carry-through", async () => {
    apiFetchMock.mockResolvedValue(makeResponse());
    const addItem = vi.fn();
    const user = userEvent.setup();
    renderModule({ addItem });
    await waitFor(() => expect(screen.getByTestId("cyg-add-chocolate")).toBeTruthy());

    await user.click(screen.getByTestId("cyg-add-chocolate"));
    await user.click(screen.getByTestId("cyg-add-bundle"));

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(2));
    expect(addItem.mock.calls[0][0].id).toBe(anchor.id);
    expect(addItem.mock.calls[1][0].id).toBe("premium-chocolates");
    expect(addItem.mock.calls[1][3]).toEqual({ upsellToken: "tok-choc" });
    expect(eventsOfType("upsell_bundle_add_attempt")).toHaveLength(1);
    expect(eventsOfType("upsell_bundle_add_success")).toHaveLength(1);
    expect(onBundleAdded).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it("explains unavailable items on submit, refreshes the selection, and does not mutate the cart", async () => {
    apiFetchMock
      .mockResolvedValueOnce(makeResponse())
      // Revalidation fetch: chocolate went out of stock.
      .mockResolvedValue(
        makeResponse({
          slots: [makeSlot({ inStock: false }), cakeSlot],
        }),
      );
    const addItem = vi.fn();
    const user = userEvent.setup();
    renderModule({ addItem });
    await waitFor(() => expect(screen.getByTestId("cyg-add-chocolate")).toBeTruthy());

    await user.click(screen.getByTestId("cyg-add-chocolate"));
    await user.click(screen.getByTestId("cyg-add-bundle"));

    await waitFor(() => expect(screen.getByTestId("cyg-notices")).toBeTruthy());
    expect(screen.getByTestId("cyg-notices").textContent).toContain(
      "product.cyg.unavailable|name=Premium Chocolates",
    );
    expect(addItem).not.toHaveBeenCalled();
    // Selection refreshed: chocolate deselected, summary back to bouquet only.
    expect(
      screen.getByTestId("cyg-add-chocolate").getAttribute("aria-pressed"),
    ).toBe("false");
    const failures = eventsOfType("upsell_bundle_add_failure");
    expect(failures).toHaveLength(1);
    expect(failures[0][0].properties.failureReason).toBe("revalidation_failed");
    expect(onBundleAdded).not.toHaveBeenCalled();
  });

  it("prevents double submits while a bundle add is running", async () => {
    let resolveRevalidation: ((r: CygResponse) => void) | null = null;
    apiFetchMock
      .mockResolvedValueOnce(makeResponse())
      .mockImplementation(
        () =>
          new Promise<CygResponse>((resolve) => {
            resolveRevalidation = resolve;
          }),
      );
    const addItem = vi.fn();
    const user = userEvent.setup();
    renderModule({ addItem });
    await waitFor(() => expect(screen.getByTestId("cyg-add-chocolate")).toBeTruthy());

    await user.click(screen.getByTestId("cyg-add-chocolate"));
    const cta = screen.getByTestId("cyg-add-bundle");
    await user.click(cta);
    // While the revalidation is in flight the CTA is disabled and a second
    // click is a no-op.
    expect((cta as HTMLButtonElement).disabled).toBe(true);
    await user.click(cta);
    resolveRevalidation!(makeResponse());

    await waitFor(() => expect(eventsOfType("upsell_bundle_add_success")).toHaveLength(1));
    expect(eventsOfType("upsell_bundle_add_attempt")).toHaveLength(1);
    expect(addItem).toHaveBeenCalledTimes(2); // anchor + 1 add-on, exactly once
  });
});
