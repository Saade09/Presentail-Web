/**
 * Unit tests for fetchOsOccasions() in lib/woo.ts.
 *
 * fetchOsOccasions fetches /api/catalog/metadata and returns the OS-filtered
 * occasion list. The server already excludes inactive occasions (e.g. colleague,
 * friend, children) from the response, so only slugs present in json.occasions
 * make it into the returned array.
 *
 * Local icon and image are merged from the static catalog where available;
 * OS-only occasions that have no local counterpart fall back to icon="star"
 * and image=null.
 *
 * Scenarios covered:
 *   - Active-only occasions are returned; inactive slugs absent from OS
 *     response are not included in the result.
 *   - Local icon and image are merged for occasions present in the static list.
 *   - OS-only occasions (no local entry) get icon="star" and image=null.
 *   - Static list is returned on a non-ok HTTP response.
 *   - Static list is returned when json.occasions is not an array.
 *   - Empty array is returned when json.occasions is an empty array.
 *   - Static list is returned when fetch throws a network error.
 *   - Description is forwarded when the OS includes it.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchOsOccasions } from "./woo";

// ---------------------------------------------------------------------------
// Static catalog stub
// ---------------------------------------------------------------------------

vi.mock("@/data/catalog", () => ({
  occasions: [
    { id: "birthday", name: "Birthday", icon: "cake", image: { uri: "birthday.jpg" } },
    { id: "anniversary", name: "Anniversary", icon: "heart", image: { uri: "anniversary.jpg" } },
    { id: "colleague", name: "Colleague", icon: "briefcase", image: null },
    { id: "friend", name: "Friend", icon: "users", image: null },
  ],
  categories: [],
}));

const STATIC_OCCASIONS_IDS = ["birthday", "anniversary", "colleague", "friend"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOk(body: unknown) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => body,
  } as Response);
}

function mockFetchNotOk() {
  vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchOsOccasions — active occasions returned; inactive absent", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("includes only the slugs present in the OS response", async () => {
    mockFetchOk({
      occasions: [
        { id: "birthday", name: "Birthday" },
        { id: "anniversary", name: "Anniversary" },
        // colleague and friend are absent — marked inactive in OS
      ],
    });

    const result = await fetchOsOccasions();
    const ids = result.map((o) => o.id);

    expect(ids).toContain("birthday");
    expect(ids).toContain("anniversary");
    expect(ids).not.toContain("colleague");
    expect(ids).not.toContain("friend");
    expect(result).toHaveLength(2);
  });

  it("returns every slug when all occasions are active in OS", async () => {
    mockFetchOk({
      occasions: [
        { id: "birthday", name: "Birthday" },
        { id: "anniversary", name: "Anniversary" },
        { id: "colleague", name: "Colleague" },
        { id: "friend", name: "Friend" },
      ],
    });

    const result = await fetchOsOccasions();
    expect(result).toHaveLength(4);
  });
});

describe("fetchOsOccasions — icon and image merging", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("uses the local icon and image for occasions present in the static list", async () => {
    mockFetchOk({ occasions: [{ id: "birthday", name: "Birthday" }] });

    const [birthday] = await fetchOsOccasions();

    expect(birthday.icon).toBe("cake");
    expect(birthday.image).toEqual({ uri: "birthday.jpg" });
  });

  it("falls back to 'star' icon and null image for OS-only occasions not in the static list", async () => {
    mockFetchOk({ occasions: [{ id: "valentines", name: "Valentine's Day" }] });

    const [valentines] = await fetchOsOccasions();

    expect(valentines.icon).toBe("star");
    expect(valentines.image).toBeNull();
  });

  it("uses the OS-provided icon as a secondary fallback when the occasion has no local entry and OS supplies an icon", async () => {
    mockFetchOk({ occasions: [{ id: "valentines", name: "Valentine's Day", icon: "heart-os" }] });

    const [valentines] = await fetchOsOccasions();

    expect(valentines.icon).toBe("heart-os");
  });

  it("forwards the OS description when supplied", async () => {
    mockFetchOk({
      occasions: [{ id: "birthday", name: "Birthday", description: "Celebrate!" }],
    });

    const [birthday] = await fetchOsOccasions();

    expect(birthday.description).toBe("Celebrate!");
  });

  it("omits description when the OS does not include it", async () => {
    mockFetchOk({ occasions: [{ id: "birthday", name: "Birthday" }] });

    const [birthday] = await fetchOsOccasions();

    expect(Object.prototype.hasOwnProperty.call(birthday, "description")).toBe(false);
  });
});

describe("fetchOsOccasions — fallback to static list on failure", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns the static list when the HTTP response is not ok", async () => {
    mockFetchNotOk();

    const result = await fetchOsOccasions();
    const ids = result.map((o) => o.id);

    expect(ids).toEqual(STATIC_OCCASIONS_IDS);
  });

  it("returns the static list when json.occasions is not an array", async () => {
    mockFetchOk({ occasions: null });

    const result = await fetchOsOccasions();
    const ids = result.map((o) => o.id);

    expect(ids).toEqual(STATIC_OCCASIONS_IDS);
  });

  it("returns the static list when fetch throws a network error", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

    const result = await fetchOsOccasions();
    const ids = result.map((o) => o.id);

    expect(ids).toEqual(STATIC_OCCASIONS_IDS);
  });
});

describe("fetchOsOccasions — empty OS response", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns an empty array when the OS responds with an empty occasions list", async () => {
    mockFetchOk({ occasions: [] });

    const result = await fetchOsOccasions();

    expect(result).toHaveLength(0);
  });
});
