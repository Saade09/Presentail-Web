// Unit tests for uploadGoogleAdsConversion
// (artifacts/api-server/src/lib/googleAdsConversions.ts)
//
// Coverage:
//   - Skip: env vars not configured
//   - Skip: no click ID in attribution (organic/direct)
//   - Success: calls Google Ads API with correct URL, headers, and body on a gclid order
//   - HTTP error: logs warn, records ads_conversion_ping_failed, sends Slack alert
//   - Partial failure response (200 + partialFailureError): logs warn, records event, sends alert
//   - OAuth2 token cache: second call reuses cached token without re-fetching
//   - Never throws: always resolves

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mocks so they are in place before any module is imported
// ---------------------------------------------------------------------------

const { insertValuesMock, dbMock } = vi.hoisted(() => {
  const insertValuesMock = vi.fn().mockResolvedValue(undefined);
  const insertChain = { values: insertValuesMock };
  const dbMock = { insert: vi.fn().mockReturnValue(insertChain) };
  return { insertValuesMock, dbMock };
});

vi.mock("@workspace/db", () => ({
  db: dbMock,
  analyticsEventsTable: {},
}));

const { sendAlertMock } = vi.hoisted(() => {
  const sendAlertMock = vi.fn().mockResolvedValue(undefined);
  return { sendAlertMock };
});

vi.mock("./alerts", () => ({ sendAlert: sendAlertMock }));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Subject under test — imported after vi.mock calls
// ---------------------------------------------------------------------------

import { uploadGoogleAdsConversion, __resetTokenCacheForTest } from "./googleAdsConversions";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APP_ORDER_ID = "LB-2026-00001";
const GCLID = "test-gclid-abc123";
const CONVERSION_TIME_MS = new Date("2026-06-01T10:00:00Z").getTime();

const FULL_ENV: Record<string, string> = {
  GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
  GOOGLE_ADS_DEVELOPER_TOKEN: "dev-token-xyz",
  GOOGLE_ADS_CONVERSION_ACTION_ID: "9876543",
  GOOGLE_ADS_CLIENT_ID: "oauth-client-id",
  GOOGLE_ADS_CLIENT_SECRET: "oauth-client-secret",
  GOOGLE_ADS_REFRESH_TOKEN: "oauth-refresh-token",
};

/** Token endpoint response fixture. */
const TOKEN_RESPONSE = { access_token: "ya29.test-access-token", expires_in: 3600 };

/** Successful Google Ads API response (empty body — no partialFailureError). */
const ADS_SUCCESS_RESPONSE = JSON.stringify({ results: [{}] });

/** Helper — clear all Google Ads env vars. */
function clearAdsEnv() {
  for (const key of Object.keys(FULL_ENV)) {
    delete process.env[key];
  }
}

/** Helper — set a full working env. */
function setAdsEnv(overrides: Record<string, string> = {}) {
  Object.assign(process.env, FULL_ENV, overrides);
}

/** Minimal attribution with a gclid. */
function gclidAttribution(): { first_touch: Record<string, string> } {
  return { first_touch: { gclid: GCLID, utm_source: "google" } };
}

/** Make a fetch mock that handles token + conversion upload calls. */
function makeFetchMock(adsStatus: number, adsBody: string) {
  return vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => TOKEN_RESPONSE,
      text: async () => JSON.stringify(TOKEN_RESPONSE),
    })
    .mockResolvedValueOnce({
      ok: adsStatus >= 200 && adsStatus < 300,
      status: adsStatus,
      text: async () => adsBody,
    });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  clearAdsEnv();
  __resetTokenCacheForTest();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  clearAdsEnv();
  __resetTokenCacheForTest();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Skip: env vars absent
// ---------------------------------------------------------------------------

describe("uploadGoogleAdsConversion — skip: env vars absent", () => {
  it("no-ops when all env vars are missing", async () => {
    await expect(
      uploadGoogleAdsConversion({
        appOrderId: APP_ORDER_ID,
        attribution: gclidAttribution(),
        conversionTimeMs: CONVERSION_TIME_MS,
        totalUsdCents: 10000,
      }),
    ).resolves.toBeUndefined();

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it("no-ops when only some env vars are present (partial config)", async () => {
    process.env.GOOGLE_ADS_CUSTOMER_ID = "123-456-7890";
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
    // Missing: CONVERSION_ACTION_ID, CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN

    await expect(
      uploadGoogleAdsConversion({
        appOrderId: APP_ORDER_ID,
        attribution: gclidAttribution(),
        conversionTimeMs: CONVERSION_TIME_MS,
        totalUsdCents: null,
      }),
    ).resolves.toBeUndefined();

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Skip: no click ID in attribution
// ---------------------------------------------------------------------------

describe("uploadGoogleAdsConversion — skip: no click ID", () => {
  beforeEach(() => setAdsEnv());

  it("no-ops when attribution.first_touch has no gclid/gbraid/wbraid", async () => {
    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: { first_touch: { utm_source: "facebook", utm_medium: "cpc" } },
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: 5000,
    });

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it("no-ops when attribution.first_touch is absent", async () => {
    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: {},
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: null,
    });

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("no-ops when gclid is an empty string", async () => {
    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: { first_touch: { gclid: "" } },
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: null,
    });

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Success: correct API call
// ---------------------------------------------------------------------------

describe("uploadGoogleAdsConversion — success path", () => {
  beforeEach(() => setAdsEnv());

  it("fetches an OAuth2 token and posts to the correct Google Ads URL", async () => {
    vi.stubGlobal("fetch", makeFetchMock(200, ADS_SUCCESS_RESPONSE));

    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: gclidAttribution(),
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: 15000,
    });

    const fetchCalls = vi.mocked(fetch).mock.calls;
    expect(fetchCalls).toHaveLength(2);

    // First call: OAuth2 token endpoint
    const [tokenUrl] = fetchCalls[0] as [string, RequestInit];
    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");

    // Second call: Google Ads Conversions API
    const [adsUrl, adsInit] = fetchCalls[1] as [string, RequestInit];
    expect(adsUrl).toBe(
      "https://googleads.googleapis.com/v18/customers/1234567890/googleAds:uploadClickConversions",
    );
    expect(adsInit.method).toBe("POST");

    // Headers
    const headers = adsInit.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer ya29.test-access-token");
    expect(headers["developer-token"]).toBe("dev-token-xyz");
    expect(headers["Content-Type"]).toBe("application/json");

    // Body
    const body = JSON.parse(adsInit.body as string) as Record<string, unknown>;
    expect(body.partialFailure).toBe(true);
    const conversions = body.conversions as Record<string, unknown>[];
    expect(conversions).toHaveLength(1);
    const conv = conversions[0];
    expect(conv?.gclid).toBe(GCLID);
    expect(conv?.orderId).toBe(APP_ORDER_ID);
    expect(conv?.conversionAction).toContain("conversionActions/9876543");
    expect(conv?.conversionValue).toBe(150); // 15000 cents → $150
    expect(conv?.currencyCode).toBe("USD");
  });

  it("normalises dash-separated customer ID to digits only in the URL", async () => {
    setAdsEnv({ GOOGLE_ADS_CUSTOMER_ID: "111-222-3333" });
    vi.stubGlobal("fetch", makeFetchMock(200, ADS_SUCCESS_RESPONSE));

    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: gclidAttribution(),
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: null,
    });

    const [adsUrl] = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
    expect(adsUrl).toContain("/customers/1112223333/");
  });

  it("builds conversionAction resource name from a bare numeric ID", async () => {
    setAdsEnv({ GOOGLE_ADS_CONVERSION_ACTION_ID: "55555" });
    vi.stubGlobal("fetch", makeFetchMock(200, ADS_SUCCESS_RESPONSE));

    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: gclidAttribution(),
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: null,
    });

    const [, adsInit] = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(adsInit.body as string) as Record<string, unknown>;
    const conv = (body.conversions as Record<string, unknown>[])[0];
    expect(conv?.conversionAction).toBe("customers/1234567890/conversionActions/55555");
  });

  it("uses an existing resource name without modification when it contains a slash", async () => {
    const resourceName = "customers/9999/conversionActions/1234";
    setAdsEnv({ GOOGLE_ADS_CONVERSION_ACTION_ID: resourceName });
    vi.stubGlobal("fetch", makeFetchMock(200, ADS_SUCCESS_RESPONSE));

    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: gclidAttribution(),
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: null,
    });

    const [, adsInit] = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(adsInit.body as string) as Record<string, unknown>;
    const conv = (body.conversions as Record<string, unknown>[])[0];
    expect(conv?.conversionAction).toBe(resourceName);
  });

  it("omits conversionValue and currencyCode when totalUsdCents is null", async () => {
    vi.stubGlobal("fetch", makeFetchMock(200, ADS_SUCCESS_RESPONSE));

    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: gclidAttribution(),
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: null,
    });

    const [, adsInit] = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(adsInit.body as string) as Record<string, unknown>;
    const conv = (body.conversions as Record<string, unknown>[])[0];
    expect(conv?.conversionValue).toBeUndefined();
    expect(conv?.currencyCode).toBeUndefined();
  });

  it("includes gbraid in the payload when present", async () => {
    vi.stubGlobal("fetch", makeFetchMock(200, ADS_SUCCESS_RESPONSE));

    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: { first_touch: { gbraid: "gbraid-xyz" } },
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: null,
    });

    const [, adsInit] = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(adsInit.body as string) as Record<string, unknown>;
    const conv = (body.conversions as Record<string, unknown>[])[0];
    expect(conv?.gbraid).toBe("gbraid-xyz");
    expect(conv?.gclid).toBeUndefined();
  });

  it("does not record a failure event or send an alert on success", async () => {
    vi.stubGlobal("fetch", makeFetchMock(200, ADS_SUCCESS_RESPONSE));

    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: gclidAttribution(),
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: 5000,
    });

    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// OAuth2 token caching
// ---------------------------------------------------------------------------

describe("uploadGoogleAdsConversion — OAuth2 token caching", () => {
  beforeEach(() => {
    setAdsEnv();
    __resetTokenCacheForTest();
  });

  it("re-uses the cached access token on a second call (only one token fetch)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => TOKEN_RESPONSE, text: async () => JSON.stringify(TOKEN_RESPONSE) })
      .mockResolvedValue({ ok: true, status: 200, text: async () => ADS_SUCCESS_RESPONSE });

    vi.stubGlobal("fetch", fetchMock);

    await uploadGoogleAdsConversion({
      appOrderId: "ORDER-1",
      attribution: gclidAttribution(),
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: null,
    });

    await uploadGoogleAdsConversion({
      appOrderId: "ORDER-2",
      attribution: gclidAttribution(),
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: null,
    });

    // 1 token fetch + 2 ads uploads = 3 total calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [firstUrl] = fetchMock.mock.calls[0] as [string];
    expect(firstUrl).toBe("https://oauth2.googleapis.com/token");
    // The second token URL (if called) would also be the token endpoint — but it should NOT be called.
    const [secondUrl] = fetchMock.mock.calls[1] as [string];
    expect(secondUrl).toContain("googleads.googleapis.com");
  });
});

// ---------------------------------------------------------------------------
// HTTP error response
// ---------------------------------------------------------------------------

describe("uploadGoogleAdsConversion — HTTP error", () => {
  beforeEach(() => setAdsEnv());

  it("logs warn, records ads_conversion_ping_failed event, and sends Slack alert on HTTP 400", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => TOKEN_RESPONSE, text: async () => JSON.stringify(TOKEN_RESPONSE) })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => '{"error":"INVALID_ARGUMENT"}',
        }),
    );

    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: gclidAttribution(),
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: null,
    });

    expect(vi.mocked(logger.warn)).toHaveBeenCalledOnce();
    expect(vi.mocked(logger.warn).mock.calls[0][1]).toContain("upload failed");
    expect(dbMock.insert).toHaveBeenCalledOnce();
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ads_conversion_ping_failed" }),
    );
    expect(sendAlertMock).toHaveBeenCalledOnce();
    const alertArg = sendAlertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(alertArg.title).toContain("failed");
    expect(alertArg.severity).toBe("warn");
  });

  it("records failure and alerts on HTTP 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => TOKEN_RESPONSE, text: async () => JSON.stringify(TOKEN_RESPONSE) })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => "Internal Server Error",
        }),
    );

    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: gclidAttribution(),
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: null,
    });

    expect(vi.mocked(logger.warn)).toHaveBeenCalledOnce();
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ads_conversion_ping_failed" }),
    );
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  it("never throws — always resolves even on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("Network unreachable")),
    );

    await expect(
      uploadGoogleAdsConversion({
        appOrderId: APP_ORDER_ID,
        attribution: gclidAttribution(),
        conversionTimeMs: CONVERSION_TIME_MS,
        totalUsdCents: null,
      }),
    ).resolves.toBeUndefined();

    expect(vi.mocked(logger.warn)).toHaveBeenCalledOnce();
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Partial failure response (200 OK + partialFailureError)
// ---------------------------------------------------------------------------

describe("uploadGoogleAdsConversion — partial failure response", () => {
  beforeEach(() => setAdsEnv());

  it("logs warn, records failure event, and sends Slack alert when partialFailureError is present", async () => {
    const partialBody = JSON.stringify({
      partialFailureError: {
        code: 3,
        message: "Invalid conversion click ID",
        details: [],
      },
    });

    vi.stubGlobal("fetch", makeFetchMock(200, partialBody));

    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: gclidAttribution(),
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: 8000,
    });

    expect(vi.mocked(logger.warn)).toHaveBeenCalledOnce();
    expect(vi.mocked(logger.warn).mock.calls[0][1]).toContain("partial failure");
    expect(dbMock.insert).toHaveBeenCalledOnce();
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ads_conversion_ping_failed" }),
    );
    expect(sendAlertMock).toHaveBeenCalledOnce();
    const alertArg = sendAlertMock.mock.calls[0][0] as Record<string, unknown>;
    expect((alertArg.title as string).toLowerCase()).toContain("partial");
    expect(alertArg.severity).toBe("warn");
  });

  it("does not record failure when partialFailureError is absent in a 200 response", async () => {
    vi.stubGlobal("fetch", makeFetchMock(200, JSON.stringify({ results: [{ someField: "ok" }] })));

    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: gclidAttribution(),
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: null,
    });

    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it("treats an empty 200 body as success (no failure event)", async () => {
    vi.stubGlobal("fetch", makeFetchMock(200, ""));

    await uploadGoogleAdsConversion({
      appOrderId: APP_ORDER_ID,
      attribution: gclidAttribution(),
      conversionTimeMs: CONVERSION_TIME_MS,
      totalUsdCents: null,
    });

    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });
});
