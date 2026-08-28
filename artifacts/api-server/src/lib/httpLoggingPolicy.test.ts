import { describe, expect, it } from "vitest";
import {
  getHttpLoggingConfig,
  resolveHttpLogLevel,
  stableRequestBucket,
} from "./httpLoggingPolicy";

const QUIET = {
  successSampleRate: 0,
  slowRequestMs: 1_000,
  debug: false,
};

describe("HTTP logging policy", () => {
  it("silences routine successful requests outside the sample", () => {
    expect(
      resolveHttpLogLevel(
        {
          requestId: "request-1",
          url: "/api/catalog",
          statusCode: 200,
          durationMs: 50,
        },
        QUIET,
      ),
    ).toBe("silent");
  });

  it("retains errors, slow requests, and sensitive routes", () => {
    expect(
      resolveHttpLogLevel(
        {
          requestId: "request-1",
          url: "/api/catalog",
          statusCode: 500,
          durationMs: 50,
        },
        QUIET,
      ),
    ).toBe("error");
    expect(
      resolveHttpLogLevel(
        {
          requestId: "request-2",
          url: "/api/catalog",
          statusCode: 200,
          durationMs: 1_001,
        },
        QUIET,
      ),
    ).toBe("info");
    expect(
      resolveHttpLogLevel(
        {
          requestId: "request-3",
          url: "/api/stripe/webhook",
          statusCode: 200,
          durationMs: 20,
        },
        QUIET,
      ),
    ).toBe("info");
  });

  it("uses stable request sampling and supports a debug override", () => {
    expect(stableRequestBucket("same")).toBe(stableRequestBucket("same"));
    expect(
      resolveHttpLogLevel(
        {
          requestId: "request-4",
          url: "/api/catalog",
          statusCode: 200,
          durationMs: 20,
        },
        { ...QUIET, debug: true },
      ),
    ).toBe("info");
  });

  it("uses bounded configurable defaults", () => {
    expect(
      getHttpLoggingConfig({
        REQUEST_SUCCESS_LOG_RATE: "4",
        SLOW_REQUEST_LOG_MS: "-1",
      }),
    ).toEqual({
      successSampleRate: 1,
      slowRequestMs: 1_000,
      debug: false,
    });
  });
});