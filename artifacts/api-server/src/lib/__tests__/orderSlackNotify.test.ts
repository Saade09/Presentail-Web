import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const proxyMock = vi.fn();

vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class {
    proxy = proxyMock;
  },
}));

import { getLocalIso } from "@workspace/delivery";
import {
  uaeOrderChannelForDistrict,
  slackChannelName,
  formatUaeOrderMessage,
  buildUaeOrderBlocks,
  sendUaeOrderSlackNotification,
  type UaeOrderNotification,
} from "../orderSlackNotify";

function slackOk() {
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
}

function baseNotification(overrides: Partial<UaeOrderNotification> = {}): UaeOrderNotification {
  return {
    orderId: "ORD-123",
    osOrderId: 456,
    customerName: "Elie Abi Akar",
    customerPhone: "+96170518275",
    recipientName: "Jp Rahal",
    recipientPhone: "+96171049949",
    address: "Ground Floor, Block E of Wasl 51 complex on Al Wasl Road in Jumeirah 1",
    district: "Dubai",
    deliveryDate: "2026-08-15",
    deliverySlot: "2 PM - 6 PM",
    cardMessage: "HAPPY BIRTHDAY CHARCHOURAAA",
    cardTo: "JP",
    cardFrom: "E.",
    totalUsd: 84.5,
    chargedCurrency: "AED",
    items: [
      { name: "Red Roses Bouquet", quantity: 1, imageUrl: "https://cdn.example.com/roses.jpg" },
      { name: "Chocolate Box", quantity: 2, imageUrl: "https://cdn.example.com/choco.jpg" },
    ],
    ...overrides,
  };
}

describe("uaeOrderChannelForDistrict", () => {
  it("routes Abu Dhabi to the abudhabi channel", () => {
    expect(uaeOrderChannelForDistrict("Abu Dhabi")).toBe("abudhabi");
  });

  it("routes Dubai and all other UAE districts to the dubai channel", () => {
    for (const d of ["Dubai", "Sharjah", "Ajman", "Fujairah", "Ras Al Khaimah", "Umm Al Quwain"]) {
      expect(uaeOrderChannelForDistrict(d)).toBe("dubai");
    }
  });

  it("returns null for non-UAE districts", () => {
    expect(uaeOrderChannelForDistrict("Beirut")).toBeNull();
    expect(uaeOrderChannelForDistrict("Nicosia")).toBeNull();
    expect(uaeOrderChannelForDistrict("Atlantis")).toBeNull();
  });
});

describe("slackChannelName", () => {
  afterEach(() => {
    delete process.env.SLACK_DUBAI_ORDER_CHANNEL;
    delete process.env.SLACK_ABUDHABI_ORDER_CHANNEL;
  });

  it("defaults to #dubai-order / #abudhabi-orders", () => {
    expect(slackChannelName("dubai")).toBe("#dubai-order");
    expect(slackChannelName("abudhabi")).toBe("#abudhabi-orders");
  });

  it("honours env overrides", () => {
    process.env.SLACK_DUBAI_ORDER_CHANNEL = "C0123DUBAI";
    process.env.SLACK_ABUDHABI_ORDER_CHANNEL = "#ad-orders";
    expect(slackChannelName("dubai")).toBe("C0123DUBAI");
    expect(slackChannelName("abudhabi")).toBe("#ad-orders");
  });
});

describe("formatUaeOrderMessage", () => {
  it("follows the ops form layout", () => {
    const msg = formatUaeOrderMessage(baseNotification());
    expect(msg).toContain("Below Order for Aug 15, 2026 between 2 PM and 6 PM Dubai Time");
    expect(msg).toContain("Customer: Elie Abi Akar - +96170518275");
    expect(msg).toContain("Receiver: Jp Rahal");
    expect(msg).toContain("Phone number: +96171049949");
    expect(msg).toContain(
      "Address: Ground Floor, Block E of Wasl 51 complex on Al Wasl Road in Jumeirah 1, Dubai, AE",
    );
    expect(msg).toContain("Delivery date: Aug 15, 2026 · 2 PM - 6 PM");
    expect(msg).toContain("Items: 1× Red Roses Bouquet, 2× Chocolate Box");
    expect(msg).toContain("Total: $84.50 USD (charged in AED)");
    expect(msg).toContain("Card message:\n\nTo: JP\nHAPPY BIRTHDAY CHARCHOURAAA\nFrom: E.");
    expect(msg.trim().endsWith("<!channel> please send picture here to check before delivery")).toBe(true);
  });

  it("says 'today' when the delivery date is today in the UAE", () => {
    const msg = formatUaeOrderMessage(baseNotification({ deliveryDate: getLocalIso("AE") }));
    expect(msg).toContain("Below Order for today between 2 PM and 6 PM Dubai Time");
  });

  it("omits optional lines when data is missing", () => {
    const msg = formatUaeOrderMessage(
      baseNotification({
        deliveryDate: undefined,
        deliverySlot: undefined,
        cardMessage: undefined,
        cardTo: undefined,
        cardFrom: undefined,
        totalUsd: null,
        chargedCurrency: null,
        address: undefined,
      }),
    );
    expect(msg).toContain("Below Order for today Dubai Time");
    expect(msg).toContain("Address: Dubai, AE");
    expect(msg).not.toContain("Delivery date:");
    expect(msg).not.toContain("Card message:");
    expect(msg).not.toContain("Total:");
  });

  it("does not repeat the charged-currency suffix for USD", () => {
    const msg = formatUaeOrderMessage(baseNotification({ chargedCurrency: "USD" }));
    expect(msg).toContain("Total: $84.50 USD");
    expect(msg).not.toContain("charged in");
  });
});

describe("buildUaeOrderBlocks", () => {
  it("includes the message section plus one image block per unique product image", () => {
    const blocks = buildUaeOrderBlocks(baseNotification());
    expect(blocks[0].type).toBe("section");
    const images = blocks.filter((b) => b.type === "image") as any[];
    expect(images.map((b) => b.image_url)).toEqual([
      "https://cdn.example.com/roses.jpg",
      "https://cdn.example.com/choco.jpg",
    ]);
    expect(images[0].alt_text).toBe("Red Roses Bouquet");
  });

  it("skips items without images and dedupes repeated images", () => {
    const blocks = buildUaeOrderBlocks(
      baseNotification({
        items: [
          { name: "A", quantity: 1, imageUrl: "https://cdn.example.com/x.jpg" },
          { name: "B", quantity: 1, imageUrl: "https://cdn.example.com/x.jpg" },
          { name: "C", quantity: 1, imageUrl: null },
        ],
      }),
    );
    expect(blocks.filter((b) => b.type === "image")).toHaveLength(1);
  });
});

describe("sendUaeOrderSlackNotification", () => {
  beforeEach(() => {
    proxyMock.mockReset();
    proxyMock.mockResolvedValue(slackOk());
  });

  it("posts Abu Dhabi orders to #abudhabi-orders", async () => {
    const ok = await sendUaeOrderSlackNotification(baseNotification({ district: "Abu Dhabi" }));
    expect(ok).toBe(true);
    const [connector, path, opts] = proxyMock.mock.calls[0];
    expect(connector).toBe("slack");
    expect(path).toBe("/chat.postMessage");
    expect(opts.body.channel).toBe("#abudhabi-orders");
  });

  it("posts other UAE districts to #dubai-order", async () => {
    for (const district of ["Dubai", "Sharjah"]) {
      proxyMock.mockClear();
      const ok = await sendUaeOrderSlackNotification(baseNotification({ district }));
      expect(ok).toBe(true);
      expect(proxyMock.mock.calls[0][2].body.channel).toBe("#dubai-order");
    }
  });

  it("sends nothing for non-UAE orders", async () => {
    const ok = await sendUaeOrderSlackNotification(baseNotification({ district: "Beirut" }));
    expect(ok).toBe(false);
    expect(proxyMock).not.toHaveBeenCalled();
  });

  it("sends fallback text plus blocks with product images", async () => {
    const n = baseNotification();
    await sendUaeOrderSlackNotification(n);
    const body = proxyMock.mock.calls[0][2].body;
    expect(body.text).toBe(formatUaeOrderMessage(n));
    expect(body.blocks).toEqual(buildUaeOrderBlocks(n));
  });

  it("never throws when the proxy rejects — logs and returns false", async () => {
    proxyMock.mockRejectedValue(new Error("network down"));
    const warn = vi.fn();
    const ok = await sendUaeOrderSlackNotification(baseNotification(), { warn });
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("returns false on an HTTP error response without throwing", async () => {
    proxyMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const warn = vi.fn();
    const ok = await sendUaeOrderSlackNotification(baseNotification(), { warn });
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("returns false when Slack responds ok:false (e.g. channel_not_found)", async () => {
    proxyMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error: "channel_not_found" }),
    });
    const warn = vi.fn();
    const ok = await sendUaeOrderSlackNotification(baseNotification(), { warn });
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
