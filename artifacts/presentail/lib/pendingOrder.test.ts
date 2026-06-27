import { beforeEach, describe, expect, it, vi } from "vitest";

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  clearPendingOrder,
  loadPendingOrder,
  savePendingOrder,
  type PendingOrder,
} from "./pendingOrder";
import type { WooOrderPayload } from "./woo";

const PENDING_ORDER_KEY = "@presentail/pending_order_v1";

// Drive the mocked AsyncStorage with a real in-memory map so save → load → clear
// round-trips behave like the device.
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.mocked(AsyncStorage.setItem).mockImplementation(async (k: string, v: string) => {
    store.set(k, v);
  });
  vi.mocked(AsyncStorage.getItem).mockImplementation(async (k: string) =>
    store.has(k) ? store.get(k)! : null,
  );
  vi.mocked(AsyncStorage.removeItem).mockImplementation(async (k: string) => {
    store.delete(k);
  });
});

const samplePayload = {
  orderId: "LB-123",
  items: [{ name: "Roses", quantity: 1, price: 50, wcId: 7 }],
  billing: { firstName: "A", lastName: "B", email: "a@b.com", phone: "+961 1" },
  recipient: { firstName: "C", lastName: "D", phone: "+961 2" },
  district: "Beirut",
  districtFee: 5,
  expressFee: 0,
  deliveryDetails: "St 1",
  deliveryDate: "2026-06-30",
  deliverySlot: "Morning",
  paymentMethod: "card",
  paymentRef: "pi_123",
} as unknown as WooOrderPayload;

describe("pendingOrder", () => {
  it("round-trips a saved order with a createdAt timestamp", async () => {
    await savePendingOrder({
      payload: samplePayload,
      authToken: "tok",
      filter: { countryCode: "LB", cityId: "1" },
    });

    const loaded = await loadPendingOrder();
    expect(loaded).not.toBeNull();
    expect(loaded!.payload).toEqual(samplePayload);
    expect(loaded!.authToken).toBe("tok");
    expect(loaded!.filter).toEqual({ countryCode: "LB", cityId: "1" });
    expect(typeof loaded!.createdAt).toBe("number");
  });

  it("returns null when nothing is stashed", async () => {
    expect(await loadPendingOrder()).toBeNull();
  });

  it("clears a stashed order", async () => {
    await savePendingOrder({ payload: samplePayload });
    await clearPendingOrder();
    expect(await loadPendingOrder()).toBeNull();
  });

  it("returns null for a stash missing a payload", async () => {
    store.set(PENDING_ORDER_KEY, JSON.stringify({ createdAt: 1 } as Partial<PendingOrder>));
    expect(await loadPendingOrder()).toBeNull();
  });

  it("treats a stash older than the max age as missing and drops it", async () => {
    const eightHoursAgo = Date.now() - 8 * 60 * 60 * 1000;
    store.set(
      PENDING_ORDER_KEY,
      JSON.stringify({ payload: samplePayload, createdAt: eightHoursAgo }),
    );
    expect(await loadPendingOrder()).toBeNull();
    // Stale entry must be purged so it can never be replayed.
    expect(store.has(PENDING_ORDER_KEY)).toBe(false);
  });

  it("treats a stash with no timestamp as missing", async () => {
    store.set(PENDING_ORDER_KEY, JSON.stringify({ payload: samplePayload }));
    expect(await loadPendingOrder()).toBeNull();
  });

  it("returns null for unparseable JSON instead of throwing", async () => {
    store.set(PENDING_ORDER_KEY, "{not json");
    expect(await loadPendingOrder()).toBeNull();
  });

  it("swallows storage write errors so checkout never crashes", async () => {
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("quota"));
    await expect(savePendingOrder({ payload: samplePayload })).resolves.toBeUndefined();
  });
});
