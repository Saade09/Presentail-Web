import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OSProduct, OSRealDeliveryPhotoRecord } from "@workspace/presentail-os";
import {
  isPublishableRealDeliveryPhoto,
  getRealDeliveryFeed,
  resolveSignedDeliveryRef,
  buildSignedDeliveryRef,
  clearRealDeliveryCachesForTests,
  cityIdToDisplayName,
} from "./realDeliveries";

// ── Module mocks ──────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  fetchOsRealDeliveryPhotos: vi.fn(),
  getOsProducts: vi.fn(),
}));

vi.mock("@workspace/presentail-os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/presentail-os")>();
  return { ...actual, fetchOsRealDeliveryPhotos: mocks.fetchOsRealDeliveryPhotos };
});

vi.mock("./osProductsCache", () => ({
  getOsProducts: mocks.getOsProducts,
}));

vi.mock("./wooStore", () => ({
  resolveStoreFromRequest: () => ({ storeKey: "lebanon" }),
}));

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makePhoto(overrides: Partial<OSRealDeliveryPhotoRecord> = {}): OSRealDeliveryPhotoRecord {
  return {
    photo_id: "photo-abc",
    asset_id: "123",
    asset_url:
      "https://os.presentail.com/api/storage/public-objects/real-deliveries/photo.webp",
    captured_at: "2026-08-31T10:00:00.000Z",
    product: { id: 1, name: "Plum Florals", image_url: "https://example.com/img.jpg" },
    location: { country: "LB", city: "Beirut" },
    eligibility: { approved: true, completed: true, product_active: true, in_stock: true },
    ...overrides,
  } as OSRealDeliveryPhotoRecord;
}

const approvedPhoto = makePhoto();

/** Three unique eligible photos all linked to product osNumericId=1. */
function threePhotos(): OSRealDeliveryPhotoRecord[] {
  return [1, 2, 3].map((n) =>
    makePhoto({
      photo_id: `photo-${n}`,
      asset_url: `https://os.presentail.com/api/storage/public-objects/real-deliveries/p${n}.webp`,
      captured_at: `2026-09-0${n}T10:00:00.000Z`,
    }),
  );
}

function makeProduct(overrides: Partial<OSProduct> = {}): OSProduct {
  return {
    id: "plum-florals",
    name: "Plum Florals",
    wcId: 0,
    osNumericId: 1,
    inStock: true,
    categories: [{ id: "flowers", slug: "flowers", name: "Flowers" }],
    ...overrides,
  } as unknown as OSProduct;
}

// ── Guard-level tests ─────────────────────────────────────────────────────────

describe("isPublishableRealDeliveryPhoto — guard", () => {
  it("accepts an eligible photo with all four eligibility flags true", () => {
    expect(isPublishableRealDeliveryPhoto(approvedPhoto)).toBe(true);
  });

  it.each([
    ["not approved", { eligibility: { approved: false, completed: true, product_active: true, in_stock: true } }],
    ["not completed", { eligibility: { approved: true, completed: false, product_active: true, in_stock: true } }],
    ["product inactive", { eligibility: { approved: true, completed: true, product_active: false, in_stock: true } }],
    ["out of stock", { eligibility: { approved: true, completed: true, product_active: true, in_stock: false } }],
    ["missing eligibility", { eligibility: undefined }],
    ["empty asset_url", { asset_url: "" }],
    ["non-OS asset_url", { asset_url: "https://evil.example.com/image.jpg" }],
    ["missing photo_id", { photo_id: "" }],
  ])("rejects: %s", (_label, override) => {
    expect(
      isPublishableRealDeliveryPhoto(
        { ...approvedPhoto, ...override } as OSRealDeliveryPhotoRecord,
      ),
    ).toBe(false);
  });
});

// ── City name derivation ──────────────────────────────────────────────────────

describe("cityIdToDisplayName", () => {
  it.each([
    ["lb-beirut", "Beirut"],
    ["ae-dubai", "Dubai"],
    ["lb-tripoli", "Tripoli"],
    ["ae-abu-dhabi", "Abu Dhabi"],
    ["cy-nicosia", "Nicosia"],
    ["lb-jounieh", "Jounieh"],
  ])("%s → %s", (input, expected) => {
    expect(cityIdToDisplayName(input)).toBe(expected);
  });
});

// ── AES-GCM token tests ───────────────────────────────────────────────────────

describe("buildSignedDeliveryRef / resolveSignedDeliveryRef", () => {
  const osUrl =
    "https://os.presentail.com/api/storage/public-objects/real-deliveries/test.webp";

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars-long!!";
  });

  it("round-trips correctly", () => {
    const ref = buildSignedDeliveryRef(osUrl);
    expect(ref).not.toBeNull();
    expect(resolveSignedDeliveryRef(ref!)).toBe(osUrl);
  });

  it("returns null for a non-OS URL", () => {
    expect(buildSignedDeliveryRef("https://evil.example.com/image.jpg")).toBeNull();
  });

  it("returns null when SESSION_SECRET is too short", () => {
    process.env.SESSION_SECRET = "short";
    expect(buildSignedDeliveryRef(osUrl)).toBeNull();
  });

  it("returns null for a tampered token", () => {
    const ref = buildSignedDeliveryRef(osUrl)!;
    const tampered = ref.slice(0, -4) + "XXXX";
    expect(resolveSignedDeliveryRef(tampered)).toBeNull();
  });

  it("the token is opaque — decoding it does not reveal the OS URL", () => {
    const ref = buildSignedDeliveryRef(osUrl)!;
    // base64url-decoding yields AES-GCM ciphertext, not plaintext
    const raw = Buffer.from(ref, "base64url").toString("utf8");
    expect(raw).not.toContain("os.presentail.com");
    expect(raw).not.toContain("/api/storage/");
  });
});

// ── Feed-level tests ──────────────────────────────────────────────────────────

describe("getRealDeliveryFeed — feed logic", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars-long!!";
    clearRealDeliveryCachesForTests();
    vi.clearAllMocks();
    mocks.getOsProducts.mockReturnValue([makeProduct()]);
  });

  it("returns empty items when fewer than 3 eligible photos exist", async () => {
    mocks.fetchOsRealDeliveryPhotos.mockResolvedValue({ photos: [makePhoto()] });

    const result = await getRealDeliveryFeed({ countryCode: "LB", cityId: "lb-beirut" });

    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(0);
    expect(result.viewMoreUrl).toBeNull();
  });

  it("returns items and viewMoreUrl when 3 or more eligible photos exist", async () => {
    mocks.fetchOsRealDeliveryPhotos.mockResolvedValue({
      photos: threePhotos(),
      view_more_url: "https://presentail.com/flowers/real-deliveries",
    });

    const result = await getRealDeliveryFeed({ countryCode: "LB", cityId: "lb-beirut" });

    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(3);
    expect(result.viewMoreUrl).toBe("/flowers/real-deliveries");
  });

  it("returns empty when the catalog is cold (no products)", async () => {
    mocks.getOsProducts.mockReturnValue([]);

    const result = await getRealDeliveryFeed({ countryCode: "LB", cityId: "lb-beirut" });

    expect(result.items).toHaveLength(0);
    expect(mocks.fetchOsRealDeliveryPhotos).not.toHaveBeenCalled();
  });

  it("returns empty when the OS endpoint throws", async () => {
    mocks.fetchOsRealDeliveryPhotos.mockRejectedValue(new Error("Network timeout"));

    const result = await getRealDeliveryFeed({ countryCode: "LB", cityId: "lb-beirut" });

    expect(result.items).toHaveLength(0);
    expect(result.viewMoreUrl).toBeNull();
  });

  it("skips photos whose product is not found in the local catalog", async () => {
    // All three photos reference product.id=99 which doesn't exist in cache
    const photos = threePhotos().map((p) => ({
      ...p,
      product: { id: 99, name: "Unknown", image_url: "" },
    }));
    mocks.fetchOsRealDeliveryPhotos.mockResolvedValue({ photos });

    const result = await getRealDeliveryFeed({ countryCode: "LB", cityId: "lb-beirut" });

    expect(result.items).toHaveLength(0);
  });

  it("deduplicates photos with the same photo_id", async () => {
    const photos = [
      makePhoto({ photo_id: "dup", asset_url: "https://os.presentail.com/api/storage/public-objects/real-deliveries/a.webp" }),
      makePhoto({ photo_id: "dup", asset_url: "https://os.presentail.com/api/storage/public-objects/real-deliveries/a.webp" }),
      makePhoto({ photo_id: "b", asset_url: "https://os.presentail.com/api/storage/public-objects/real-deliveries/b.webp" }),
      makePhoto({ photo_id: "c", asset_url: "https://os.presentail.com/api/storage/public-objects/real-deliveries/c.webp" }),
    ];
    mocks.fetchOsRealDeliveryPhotos.mockResolvedValue({ photos });

    const result = await getRealDeliveryFeed({ countryCode: "LB", cityId: "lb-beirut" });

    expect(result.items).toHaveLength(3);
  });

  it("passes derived city name (not city ID) to OS API", async () => {
    mocks.fetchOsRealDeliveryPhotos.mockResolvedValue({ photos: threePhotos() });

    await getRealDeliveryFeed({ countryCode: "LB", cityId: "lb-beirut" });

    expect(mocks.fetchOsRealDeliveryPhotos).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: expect.any(String) }),
      { country: "LB", city: "Beirut" },
    );
  });

  it("does not expose asset_url, photo_id, asset_id, or order identifiers in response items", async () => {
    mocks.fetchOsRealDeliveryPhotos.mockResolvedValue({ photos: threePhotos() });

    const result = await getRealDeliveryFeed({ countryCode: "LB", cityId: "lb-beirut" });

    for (const item of result.items) {
      const keys = Object.keys(item);
      expect(keys).not.toContain("asset_url");
      expect(keys).not.toContain("photo_id");
      expect(keys).not.toContain("asset_id");
      expect(keys).not.toContain("order_id");
      // imageRef must be an opaque encrypted token, not a raw URL
      expect(item.imageRef).not.toContain("os.presentail.com");
      // imageUrl must route through the bounded proxy
      expect(item.imageUrl).toMatch(/^\/api\/img\/proxy\?deliveryRef=/);
      expect(item.imageUrl).not.toContain("os.presentail.com");
    }
  });

  it("imageRef decodes to ciphertext — OS storage path not recoverable without key", async () => {
    mocks.fetchOsRealDeliveryPhotos.mockResolvedValue({ photos: threePhotos() });

    const result = await getRealDeliveryFeed({ countryCode: "LB", cityId: "lb-beirut" });

    for (const item of result.items) {
      // Must round-trip through the proxy
      const resolved = resolveSignedDeliveryRef(item.imageRef);
      expect(resolved).toMatch(/^https:\/\/os\.presentail\.com\/api\/storage\/public-objects\//);
      // base64url-decoding yields ciphertext, not the plaintext path
      const raw = Buffer.from(item.imageRef, "base64url").toString("utf8");
      expect(raw).not.toContain("os.presentail.com");
      expect(raw).not.toContain("/api/storage/");
    }
  });

  it("excludes ineligible photos (e.g. not approved)", async () => {
    const bad = makePhoto({
      photo_id: "bad",
      asset_url: "https://os.presentail.com/api/storage/public-objects/real-deliveries/bad.webp",
      eligibility: { approved: false, completed: true, product_active: true, in_stock: true },
    });
    mocks.fetchOsRealDeliveryPhotos.mockResolvedValue({
      photos: [bad, ...threePhotos()],
    });

    const result = await getRealDeliveryFeed({ countryCode: "LB", cityId: "lb-beirut" });

    expect(result.items).toHaveLength(3);
  });

  it("rejects a view_more_url pointing to an external host", async () => {
    mocks.fetchOsRealDeliveryPhotos.mockResolvedValue({
      photos: threePhotos(),
      view_more_url: "https://evil.example.com/redirect",
    });

    const result = await getRealDeliveryFeed({ countryCode: "LB", cityId: "lb-beirut" });

    expect(result.viewMoreUrl).toBeNull();
    expect(result.items).toHaveLength(3);
  });

  it("accepts a same-domain view_more_url and strips the origin", async () => {
    mocks.fetchOsRealDeliveryPhotos.mockResolvedValue({
      photos: threePhotos(),
      view_more_url: "https://presentail.com/en-lb/beirut/flowers/real-deliveries",
    });

    const result = await getRealDeliveryFeed({ countryCode: "LB", cityId: "lb-beirut" });

    expect(result.viewMoreUrl).toBe("/en-lb/beirut/flowers/real-deliveries");
  });

  it("returns empty when countryCode or cityId is missing", async () => {
    const r1 = await getRealDeliveryFeed({ countryCode: "", cityId: "lb-beirut" });
    const r2 = await getRealDeliveryFeed({ countryCode: "LB", cityId: "" });
    expect(r1.items).toHaveLength(0);
    expect(r2.items).toHaveLength(0);
    expect(mocks.fetchOsRealDeliveryPhotos).not.toHaveBeenCalled();
  });

  it("uses the OS-supplied city name in item.cityName", async () => {
    mocks.fetchOsRealDeliveryPhotos.mockResolvedValue({ photos: threePhotos() });

    const result = await getRealDeliveryFeed({ countryCode: "LB", cityId: "lb-beirut" });

    for (const item of result.items) {
      expect(item.cityName).toBe("Beirut");
    }
  });

  it("uses product slug from local catalog as productId", async () => {
    mocks.fetchOsRealDeliveryPhotos.mockResolvedValue({ photos: threePhotos() });

    const result = await getRealDeliveryFeed({ countryCode: "LB", cityId: "lb-beirut" });

    for (const item of result.items) {
      expect(item.productId).toBe("plum-florals");
    }
  });
});
