import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyHmacSignature, parseDeliveryConfigPayload, isTimestampExpired } from "./osWebhook";

// ---------------------------------------------------------------------------
// Replay protection: timestamp expiry check
// ---------------------------------------------------------------------------

describe("isTimestampExpired", () => {
  it("returns false for a timestamp less than 5 minutes old", () => {
    const ts = String(Date.now() - 4 * 60 * 1000); // 4 min ago
    expect(isTimestampExpired(ts)).toBe(false);
  });

  it("returns true for a timestamp older than 5 minutes", () => {
    const ts = String(Date.now() - 6 * 60 * 1000); // 6 min ago
    expect(isTimestampExpired(ts)).toBe(true);
  });

  it("returns true for a timestamp far in the past", () => {
    expect(isTimestampExpired("1000000")).toBe(true);
  });

  it("returns true for an empty string", () => {
    expect(isTimestampExpired("")).toBe(true);
  });

  it("returns true for a non-numeric string", () => {
    expect(isTimestampExpired("not-a-number")).toBe(true);
  });

  it("returns false for a timestamp just within the 5-minute window", () => {
    const ts = String(Date.now() - 4 * 60 * 1000 - 30_000); // 4m30s ago
    expect(isTimestampExpired(ts)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HMAC signature verification
// ---------------------------------------------------------------------------

function makeSignature(secret: string, deliveryId: string, timestamp: string, body: string): string {
  const signingString = `${deliveryId}.${timestamp}.${body}`;
  const hex = createHmac("sha256", secret).update(signingString, "utf8").digest("hex");
  return `sha256=${hex}`;
}

describe("verifyHmacSignature", () => {
  const SECRET = "test-secret-key";
  const DELIVERY_ID = "evt_abc123";
  const TIMESTAMP = String(Date.now());
  const BODY = '{"event":"product.updated","data":{}}';
  const RAW_BODY = Buffer.from(BODY, "utf8");
  const VALID_SIG = makeSignature(SECRET, DELIVERY_ID, TIMESTAMP, BODY);

  it("returns true for a valid signature", () => {
    expect(verifyHmacSignature(SECRET, DELIVERY_ID, TIMESTAMP, RAW_BODY, VALID_SIG)).toBe(true);
  });

  it("accepts the signature without sha256= prefix", () => {
    const hexOnly = VALID_SIG.slice(7);
    expect(verifyHmacSignature(SECRET, DELIVERY_ID, TIMESTAMP, RAW_BODY, hexOnly)).toBe(true);
  });

  it("returns false for a wrong secret", () => {
    expect(verifyHmacSignature("wrong-secret", DELIVERY_ID, TIMESTAMP, RAW_BODY, VALID_SIG)).toBe(false);
  });

  it("returns false when the body is tampered", () => {
    const tamperedBody = Buffer.from('{"event":"order.deleted","data":{}}', "utf8");
    expect(verifyHmacSignature(SECRET, DELIVERY_ID, TIMESTAMP, tamperedBody, VALID_SIG)).toBe(false);
  });

  it("returns false when the delivery id is wrong", () => {
    const wrongSig = makeSignature(SECRET, "different-id", TIMESTAMP, BODY);
    expect(verifyHmacSignature(SECRET, DELIVERY_ID, TIMESTAMP, RAW_BODY, wrongSig)).toBe(false);
  });

  it("returns false for an empty signature", () => {
    expect(verifyHmacSignature(SECRET, DELIVERY_ID, TIMESTAMP, RAW_BODY, "")).toBe(false);
    expect(verifyHmacSignature(SECRET, DELIVERY_ID, TIMESTAMP, RAW_BODY, "sha256=")).toBe(false);
  });

  it("returns false for a non-hex signature", () => {
    expect(verifyHmacSignature(SECRET, DELIVERY_ID, TIMESTAMP, RAW_BODY, "sha256=zzz")).toBe(false);
  });

  it("returns false when hex lengths differ (truncated signature)", () => {
    const truncated = VALID_SIG.slice(0, -4);
    expect(verifyHmacSignature(SECRET, DELIVERY_ID, TIMESTAMP, RAW_BODY, truncated)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Delivery-config webhook parser
// ---------------------------------------------------------------------------

describe("parseDeliveryConfigPayload", () => {
  it("converts snake_case country fields to camelCase", () => {
    const result = parseDeliveryConfigPayload({
      countries: [
        {
          code: "lb",
          name: "Lebanon",
          currency: "USD",
          is_active: true,
          free_delivery_threshold: 50,
          free_delivery_enabled: true,
          cities: [],
        },
      ],
    });

    expect(result.countries).toHaveLength(1);
    const country = result.countries[0];
    expect(country?.code).toBe("lb");
    expect(country?.name).toBe("Lebanon");
    expect(country?.currency).toBe("USD");
    expect(country?.isActive).toBe(true);
    expect(country?.freeDeliveryThreshold).toBe(50);
    expect(country?.freeDeliveryEnabled).toBe(true);
  });

  it("converts snake_case city fields to camelCase", () => {
    const result = parseDeliveryConfigPayload({
      countries: [
        {
          code: "lb",
          name: "Lebanon",
          currency: "USD",
          cities: [
            {
              id: 1,
              slug: "beirut",
              name: "Beirut",
              is_active: true,
              delivery_fee: 5,
              express_delivery_fee: 20,
              free_delivery_threshold: 50,
              free_delivery_enabled: true,
              express_delivery_cutoff_time: "14:00:00",
              express_delivery_label: "Express (same-day)",
              express_available: true,
              delivery_slots: [
                { label: "Morning", start_time: "09:00:00", end_time: "14:00:00", cutoff_hour: 12 },
              ],
            },
          ],
        },
      ],
    });

    const city = result.countries[0]?.cities[0];
    expect(city?.id).toBe(1);
    expect(city?.slug).toBe("beirut");
    expect(city?.name).toBe("Beirut");
    expect(city?.isActive).toBe(true);
    expect(city?.deliveryFee).toBe(5);
    expect(city?.expressFeeTotal).toBe(20);
    expect(city?.freeDeliveryThreshold).toBe(50);
    expect(city?.freeDeliveryEnabled).toBe(true);
    expect(city?.sameDayCutoffHour).toBe(14);
    expect(city?.expressDeliveryLabel).toBe("Express (same-day)");
    expect(city?.expressAvailable).toBe(true);
  });

  it("derives expressSurcharge from expressFeeTotal - deliveryFee when express_surcharge is absent", () => {
    const result = parseDeliveryConfigPayload({
      countries: [
        {
          code: "lb",
          name: "Lebanon",
          currency: "USD",
          cities: [
            {
              id: 1,
              slug: "beirut",
              name: "Beirut",
              delivery_fee: 5,
              express_delivery_fee: 20,
            },
          ],
        },
      ],
    });
    const city = result.countries[0]?.cities[0];
    expect(city?.expressSurcharge).toBe(15);
  });

  it("prefers explicit express_surcharge over derived value", () => {
    const result = parseDeliveryConfigPayload({
      countries: [
        {
          code: "ae",
          name: "UAE",
          currency: "AED",
          cities: [
            {
              id: 2,
              slug: "dubai",
              name: "Dubai",
              delivery_fee: 18,
              express_delivery_fee: 36,
              express_surcharge: 18,
            },
          ],
        },
      ],
    });
    const city = result.countries[0]?.cities[0];
    expect(city?.expressSurcharge).toBe(18);
  });

  it("parses slot time strings to startHour/endHour integers", () => {
    const result = parseDeliveryConfigPayload({
      countries: [
        {
          code: "lb",
          name: "Lebanon",
          currency: "USD",
          cities: [
            {
              id: 1,
              slug: "beirut",
              name: "Beirut",
              delivery_slots: [
                { label: "Morning", start_time: "09:00:00", end_time: "14:00:00", cutoff_hour: 8 },
                { label: "Afternoon", start_time: "14:00:00", end_time: "20:00:00", cutoff_hour: 13 },
              ],
            },
          ],
        },
      ],
    });
    const slots = result.countries[0]?.cities[0]?.timeSlots ?? [];
    expect(slots).toHaveLength(2);
    expect(slots[0]?.label).toBe("Morning");
    expect(slots[0]?.startHour).toBe(9);
    expect(slots[0]?.endHour).toBe(14);
    expect(slots[0]?.cutoffHour).toBe(8);
    expect(slots[1]?.label).toBe("Afternoon");
    expect(slots[1]?.startHour).toBe(14);
    expect(slots[1]?.endHour).toBe(20);
  });

  it("deduplicates slots with the same label", () => {
    const result = parseDeliveryConfigPayload({
      countries: [
        {
          code: "lb",
          name: "Lebanon",
          currency: "USD",
          cities: [
            {
              id: 1,
              slug: "beirut",
              name: "Beirut",
              delivery_slots: [
                { label: "Morning", start_time: "09:00:00", end_time: "14:00:00", cutoff_hour: 8 },
                { label: "Morning", start_time: "09:00:00", end_time: "14:00:00", cutoff_hour: 8 },
              ],
            },
          ],
        },
      ],
    });
    const slots = result.countries[0]?.cities[0]?.timeSlots ?? [];
    expect(slots).toHaveLength(1);
  });

  it("handles an empty countries array", () => {
    const result = parseDeliveryConfigPayload({ countries: [] });
    expect(result.countries).toHaveLength(0);
  });

  it("handles missing data gracefully (no countries key)", () => {
    const result = parseDeliveryConfigPayload({} as any);
    expect(result.countries).toHaveLength(0);
  });

  it("returns undefined expressAvailable when both express_available and express_delivery_fee are absent", () => {
    // This is the key case for Bug 1: a partial webhook that updates only
    // time slots or free_delivery_threshold must NOT set expressAvailable=false.
    // It should return undefined so the cache layer can preserve the prior value.
    const result = parseDeliveryConfigPayload({
      countries: [
        {
          code: "lb",
          name: "Lebanon",
          currency: "USD",
          cities: [
            {
              id: 1,
              slug: "beirut",
              name: "Beirut",
              // express_available omitted — partial payload (slot-only update)
              // express_delivery_fee omitted
              free_delivery_threshold: 75,
              delivery_slots: [
                { label: "Morning", start_time: "09:00:00", end_time: "14:00:00", cutoff_hour: 8 },
              ],
            },
          ],
        },
      ],
    });
    const city = result.countries[0]?.cities[0];
    expect(city?.expressAvailable).toBeUndefined();
  });

  it("returns expressAvailable=true when express_delivery_fee is present but express_available is absent", () => {
    const result = parseDeliveryConfigPayload({
      countries: [
        {
          code: "lb",
          name: "Lebanon",
          currency: "USD",
          cities: [
            {
              id: 1,
              slug: "beirut",
              name: "Beirut",
              delivery_fee: 5,
              express_delivery_fee: 20,
              // express_available omitted — inferred from express_delivery_fee presence
            },
          ],
        },
      ],
    });
    const city = result.countries[0]?.cities[0];
    expect(city?.expressAvailable).toBe(true);
  });

  it("respects explicit express_available=false even when express_delivery_fee is present", () => {
    const result = parseDeliveryConfigPayload({
      countries: [
        {
          code: "lb",
          name: "Lebanon",
          currency: "USD",
          cities: [
            {
              id: 1,
              slug: "beirut",
              name: "Beirut",
              delivery_fee: 5,
              express_delivery_fee: 20,
              express_available: false,
            },
          ],
        },
      ],
    });
    const city = result.countries[0]?.cities[0];
    expect(city?.expressAvailable).toBe(false);
  });
});
