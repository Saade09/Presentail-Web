// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markCampaignIdentity } from "@/lib/campaign";
import { trackEvent, trackWebEvent } from "@/lib/analytics";
import {
  fireAdsPurchaseConversion,
  fireGA4PurchaseEvent,
  fireGtagEvent,
} from "@/lib/gtag";

const CAMPAIGN_KEY = "campaign-beirut-late-night";

describe("Beirut late-night campaign funnel enrichment", () => {
  const fetchMock = vi.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >(() => Promise.resolve(new Response(null, { status: 200 })));

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: vi.fn(() => false),
    });
    markCampaignIdentity(CAMPAIGN_KEY);
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("adds the campaign identity to the existing add-to-cart web event", () => {
    trackWebEvent({
      type: "add_to_cart",
      items: [{ productId: "rose-1", name: "Rose", price: 50, quantity: 1 }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]!;
    const payload = JSON.parse((request[1] as RequestInit).body as string);
    expect(payload.properties.campaignIdentity).toBe(CAMPAIGN_KEY);
    expect(payload.type).toBe("add_to_cart");
  });

  it("adds the campaign identity to the single existing checkout-start event", () => {
    trackEvent({ name: "checkout_started", surface: "checkout" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]!;
    const payload = JSON.parse((request[1] as RequestInit).body as string);
    expect(payload).toEqual(
      expect.objectContaining({
        name: "checkout_started",
        campaignIdentity: CAMPAIGN_KEY,
      }),
    );
  });

  it("enriches begin-checkout, GA4 purchase, and Ads conversion without duplicates", () => {
    const gtag = vi.fn();
    window.gtag = gtag;

    fireGtagEvent("begin_checkout", { value: 50, currency: "USD" });
    fireGA4PurchaseEvent({
      transactionId: "order-1",
      value: 50,
      currency: "USD",
      items: [{ item_id: "rose-1", item_name: "Rose", price: 50, quantity: 1 }],
    });
    fireAdsPurchaseConversion({
      transactionId: "order-1",
      value: 50,
      currency: "USD",
    });

    expect(gtag).toHaveBeenCalledTimes(3);
    for (const call of gtag.mock.calls) {
      expect(call[2]).toEqual(
        expect.objectContaining({ campaign_key: CAMPAIGN_KEY }),
      );
    }
    expect(gtag.mock.calls.map((call) => call[1])).toEqual([
      "begin_checkout",
      "purchase",
      "conversion",
    ]);
  });
});