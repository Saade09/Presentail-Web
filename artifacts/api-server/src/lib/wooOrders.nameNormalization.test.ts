/**
 * Unit tests for sender/recipient name normalization in WooOrderSchema.
 *
 * Verifies that `toTitleCase` is applied to `billing.firstName`,
 * `billing.lastName`, `recipient.firstName`, and `recipient.lastName` so that
 * names are always title-cased before reaching OS, WooCommerce, or the
 * SMS/push notifiers — regardless of how the shopper typed them.
 */

import { describe, expect, it } from "vitest";
import { toTitleCase, WooOrderSchema } from "./wooOrders";

// ---------------------------------------------------------------------------
// toTitleCase unit tests
// ---------------------------------------------------------------------------

describe("toTitleCase", () => {
  it("lowercases input → title case", () => {
    expect(toTitleCase("john")).toBe("John");
    expect(toTitleCase("john doe")).toBe("John Doe");
  });

  it("ALL-CAPS input → title case", () => {
    expect(toTitleCase("JOHN")).toBe("John");
    expect(toTitleCase("JOHN DOE")).toBe("John Doe");
  });

  it("mixed-case input → title case", () => {
    expect(toTitleCase("jOHN")).toBe("John");
    expect(toTitleCase("jOHN dOe")).toBe("John Doe");
  });

  it("already-correct input is returned unchanged", () => {
    expect(toTitleCase("John")).toBe("John");
    expect(toTitleCase("John Doe")).toBe("John Doe");
  });

  it("empty string is returned as-is", () => {
    expect(toTitleCase("")).toBe("");
  });

  it("extra spaces between words are preserved", () => {
    expect(toTitleCase("mary  jane")).toBe("Mary  Jane");
  });
});

// ---------------------------------------------------------------------------
// Minimal valid base payload (only fields required by WooOrderSchema)
// ---------------------------------------------------------------------------

function makeRawPayload(
  billingFirst: string,
  billingLast: string,
  recipientFirst: string,
  recipientLast: string,
) {
  return {
    orderId: "order-001",
    items: [{ name: "Roses", quantity: 1, price: 25, wcId: 42 }],
    billing: {
      firstName: billingFirst,
      lastName: billingLast,
      email: "test@example.com",
      phone: "+96170000000",
    },
    recipient: {
      firstName: recipientFirst,
      lastName: recipientLast,
      phone: "+96170000001",
    },
    district: "Beirut",
    districtFee: 0,
    expressFee: 0,
    deliveryDetails: "",
    deliveryDate: "",
    deliverySlot: "",
    paymentMethod: "card" as const,
  };
}

// ---------------------------------------------------------------------------
// WooOrderSchema name-normalization tests
// ---------------------------------------------------------------------------

describe("WooOrderSchema — name normalization", () => {
  it("title-cases all-lowercase billing and recipient names", () => {
    const result = WooOrderSchema.parse(makeRawPayload("john", "doe", "mary", "jane"));
    expect(result.billing.firstName).toBe("John");
    expect(result.billing.lastName).toBe("Doe");
    expect(result.recipient.firstName).toBe("Mary");
    expect(result.recipient.lastName).toBe("Jane");
  });

  it("title-cases ALL-CAPS billing and recipient names", () => {
    const result = WooOrderSchema.parse(makeRawPayload("JOHN", "DOE", "MARY", "JANE"));
    expect(result.billing.firstName).toBe("John");
    expect(result.billing.lastName).toBe("Doe");
    expect(result.recipient.firstName).toBe("Mary");
    expect(result.recipient.lastName).toBe("Jane");
  });

  it("title-cases mixed-case billing and recipient names", () => {
    const result = WooOrderSchema.parse(makeRawPayload("jOHN", "dOe", "mARY", "jAnE"));
    expect(result.billing.firstName).toBe("John");
    expect(result.billing.lastName).toBe("Doe");
    expect(result.recipient.firstName).toBe("Mary");
    expect(result.recipient.lastName).toBe("Jane");
  });

  it("leaves already-correct names unchanged", () => {
    const result = WooOrderSchema.parse(makeRawPayload("John", "Doe", "Mary", "Jane"));
    expect(result.billing.firstName).toBe("John");
    expect(result.billing.lastName).toBe("Doe");
    expect(result.recipient.firstName).toBe("Mary");
    expect(result.recipient.lastName).toBe("Jane");
  });

  it("handles omitted lastName (defaults to empty string, transforms cleanly)", () => {
    const raw = makeRawPayload("alice", "", "bob", "");
    const result = WooOrderSchema.parse(raw);
    expect(result.billing.firstName).toBe("Alice");
    expect(result.billing.lastName).toBe("");
    expect(result.recipient.firstName).toBe("Bob");
    expect(result.recipient.lastName).toBe("");
  });

  it("handles multi-word first names (e.g. compound given names)", () => {
    const result = WooOrderSchema.parse(makeRawPayload("jean paul", "smith", "anne marie", "jones"));
    expect(result.billing.firstName).toBe("Jean Paul");
    expect(result.billing.lastName).toBe("Smith");
    expect(result.recipient.firstName).toBe("Anne Marie");
    expect(result.recipient.lastName).toBe("Jones");
  });
});
