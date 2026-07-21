import { describe, it, expect, vi, afterEach } from "vitest";
import { pingIndexNowForDiscontinuedProduct } from "./osWebhook";

// ---------------------------------------------------------------------------
// pingIndexNowForDiscontinuedProduct
// ---------------------------------------------------------------------------

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const INDEXNOW_HOST = "presentail.com";
const DEFAULT_KEY = "5b84c9d17f3e4a8a9b6c2d1e5f7a3b2c";

const EXPECTED_COUNTRIES = ["lb", "ae", "cy"] as const;
const EXPECTED_CANONICAL_CITIES: Record<string, string> = {
  lb: "beirut",
  ae: "dubai",
  cy: "nicosia",
};
const EXPECTED_LANGS = ["en", "ar", "fr"] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeFetch(status: number, body = ""): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as Response);
}

describe("pingIndexNowForDiscontinuedProduct", () => {
  it("POSTs to the IndexNow endpoint with the correct shape", async () => {
    const fetchMock = makeFetch(200);
    await pingIndexNowForDiscontinuedProduct("red-roses-bouquet", undefined, fetchMock);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(INDEXNOW_ENDPOINT);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json; charset=utf-8",
    );
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body.host).toBe(INDEXNOW_HOST);
    expect(body.key).toBe(DEFAULT_KEY);
    expect(body.keyLocation).toBe(`https://${INDEXNOW_HOST}/${DEFAULT_KEY}.txt`);
  });

  it("includes all lang × canonical-city product URLs", async () => {
    const fetchMock = makeFetch(200);
    const slug = "red-roses-bouquet";
    await pingIndexNowForDiscontinuedProduct(slug, undefined, fetchMock);

    const body = JSON.parse(
      ((fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    const urlList: string[] = body.urlList;

    const expectedCount = EXPECTED_COUNTRIES.length * EXPECTED_LANGS.length;
    expect(urlList).toHaveLength(expectedCount);

    for (const country of EXPECTED_COUNTRIES) {
      const city = EXPECTED_CANONICAL_CITIES[country];
      for (const lang of EXPECTED_LANGS) {
        expect(urlList).toContain(
          `https://${INDEXNOW_HOST}/${lang}-${country}/${city}/product/${slug}`,
        );
      }
    }
  });

  it("percent-encodes slugs with special characters", async () => {
    const fetchMock = makeFetch(200);
    const slug = "roses & lilies";
    await pingIndexNowForDiscontinuedProduct(slug, undefined, fetchMock);

    const body = JSON.parse(
      ((fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    const urlList: string[] = body.urlList;
    const encoded = encodeURIComponent(slug);
    for (const url of urlList) {
      expect(url).toContain(`/product/${encoded}`);
    }
  });

  it("uses INDEXNOW_KEY env var when set", async () => {
    vi.stubEnv("INDEXNOW_KEY", "my-custom-key-abc123");
    const fetchMock = makeFetch(200);
    await pingIndexNowForDiscontinuedProduct("some-product", undefined, fetchMock);

    const body = JSON.parse(
      ((fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.key).toBe("my-custom-key-abc123");
    expect(body.keyLocation).toBe(`https://${INDEXNOW_HOST}/my-custom-key-abc123.txt`);
  });

  it("falls back to default key when INDEXNOW_KEY is not set", async () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    const fetchMock = makeFetch(200);
    await pingIndexNowForDiscontinuedProduct("some-product", undefined, fetchMock);

    const body = JSON.parse(
      ((fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.key).toBe(DEFAULT_KEY);
  });

  it("logs info on a 200 response", async () => {
    const fetchMock = makeFetch(200);
    const infoSpy = vi.fn();
    await pingIndexNowForDiscontinuedProduct("roses", { info: infoSpy }, fetchMock);
    expect(infoSpy).toHaveBeenCalledOnce();
    const [context, msg] = infoSpy.mock.calls[0] as [Record<string, unknown>, string];
    expect(context.slug).toBe("roses");
    expect(typeof context.urlCount).toBe("number");
    expect(msg).toContain("discontinued");
  });

  it("logs info on a 202 response", async () => {
    const fetchMock = makeFetch(202);
    const infoSpy = vi.fn();
    await pingIndexNowForDiscontinuedProduct("roses", { info: infoSpy }, fetchMock);
    expect(infoSpy).toHaveBeenCalledOnce();
  });

  it("logs warn on a non-2xx response and does not throw", async () => {
    const fetchMock = makeFetch(422, "Unprocessable Entity");
    const warnSpy = vi.fn();
    await expect(
      pingIndexNowForDiscontinuedProduct("roses", { warn: warnSpy }, fetchMock),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledOnce();
    const [context] = warnSpy.mock.calls[0] as [Record<string, unknown>];
    expect(context.slug).toBe("roses");
    expect(context.status).toBe(422);
  });

  it("logs warn on a network error and does not throw", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const warnSpy = vi.fn();
    await expect(
      pingIndexNowForDiscontinuedProduct("roses", { warn: warnSpy }, fetchMock),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledOnce();
    const [context] = warnSpy.mock.calls[0] as [Record<string, unknown>];
    expect(context.slug).toBe("roses");
    expect(context.err).toBe("ECONNREFUSED");
  });

  it("does not throw when no logger is provided", async () => {
    const fetchMock = makeFetch(200);
    await expect(
      pingIndexNowForDiscontinuedProduct("roses", undefined, fetchMock),
    ).resolves.toBeUndefined();
  });
});
