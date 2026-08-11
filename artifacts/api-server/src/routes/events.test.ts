/**
 * Tests for GET /api/events (SSE endpoint) DoS mitigations.
 *
 * Three layers are validated:
 *   1. sseClientIpKey — correctly extracts the rightmost-public XFF entry so
 *      spoofed leftmost entries cannot manufacture independent rate-limit or
 *      connection-cap buckets.
 *   2. Concurrent-connection cap — the (cap+1)th connection from the same key
 *      is rejected with HTTP 429 (tested by pre-filling the registry and then
 *      making one live HTTP request).
 *   3. Spoofed leftmost XFF — requests sharing the same rightmost-public IP
 *      share one cap bucket regardless of injected leftmost entries.
 *
 * Per-IP cap independence (ipA full → ipB still accepted) is covered by the
 * sseBroadcast unit tests; it is omitted here to avoid holding live SSE streams
 * open, which would prevent the test from completing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Request } from "express";
import {
  addSseClient,
  __resetSseBroadcastForTests,
  SSE_MAX_CONNECTIONS_PER_IP,
} from "../lib/sseBroadcast";
import { sseClientIpKey } from "../lib/auth-rate-limit";

// ── Replace the rate-limiter middleware with a pass-through so tests are not
//    sensitive to the 30/min window ────────────────────────────────────────────
vi.mock("../lib/auth-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth-rate-limit")>();
  return {
    ...actual,
    sseConnectIpLimiter: (_req: any, _res: any, next: any) => next(),
  };
});

import eventsRouter from "./events";

// ── Minimal Express app ───────────────────────────────────────────────────────

function makeApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use("/api", eventsRouter);
  return app;
}

// ── Helper: build a minimal Request-like object for sseClientIpKey ─────────────

function fakeReq(xff: string, ip = "127.0.0.1"): Request {
  return {
    headers: { "x-forwarded-for": xff },
    ip,
  } as unknown as Request;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. sseClientIpKey — XFF extraction and spoof-resistance
// ─────────────────────────────────────────────────────────────────────────────

describe("sseClientIpKey — rightmost-public IP extraction", () => {
  it("returns the rightmost publicly-routable XFF entry", () => {
    // XFF: <spoofed-by-client>, <real-client-ip appended by CDN>
    const key = sseClientIpKey(fakeReq("198.51.100.1, 203.0.113.42"));
    expect(key).toContain("203.0.113.42");
  });

  it("skips private/internal rightmost entries and picks the nearest public one", () => {
    // Rightmost is private Replit internal hop; second-from-right is real.
    const key = sseClientIpKey(fakeReq("203.0.113.7, 10.0.0.5"));
    expect(key).toContain("203.0.113.7");
  });

  it("spoofed leftmost IPs with the same rightmost IP produce the same key", () => {
    const realIp = "203.0.113.99";
    const keyA = sseClientIpKey(fakeReq(`198.51.100.10, ${realIp}`));
    const keyB = sseClientIpKey(fakeReq(`198.51.100.20, ${realIp}`));
    // Different spoofed leftmost entries, same rightmost — must share one
    // rate-limit / connection-cap bucket.
    expect(keyA).toBe(keyB);
  });

  it("two different rightmost IPs produce distinct keys", () => {
    const keyA = sseClientIpKey(fakeReq("203.0.113.1"));
    const keyB = sseClientIpKey(fakeReq("203.0.113.2"));
    expect(keyA).not.toBe(keyB);
  });

  it("falls back to req.ip when all XFF entries are private", () => {
    const key = sseClientIpKey(fakeReq("10.0.0.1, 172.16.0.5", "5.6.7.8"));
    expect(key).toContain("5.6.7.8");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Route — concurrent-connection cap enforced with HTTP 429
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/events — concurrent connection cap (route level)", () => {
  beforeEach(() => {
    __resetSseBroadcastForTests();
  });

  it("returns 429 with JSON body when the per-IP cap is exceeded", async () => {
    const app = makeApp();
    const realIp = "203.0.113.10";
    const ipKey = sseClientIpKey(fakeReq(realIp));

    // Pre-fill the cap directly — avoids holding open (cap) live SSE streams.
    for (let i = 0; i < SSE_MAX_CONNECTIONS_PER_IP; i++) {
      const ok = addSseClient({} as any, ipKey);
      expect(ok).toBe(true);
    }

    const res = await request(app)
      .get("/api/events")
      .set("X-Forwarded-For", realIp);

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ ok: false, code: "too_many_connections" });
  });

  it("spoofed leftmost XFF cannot obtain a separate cap bucket", async () => {
    const app = makeApp();
    const realIp = "203.0.113.13";
    const ipKey = sseClientIpKey(fakeReq(realIp));

    // Fill the cap under the canonical key.
    for (let i = 0; i < SSE_MAX_CONNECTIONS_PER_IP; i++) {
      addSseClient({} as any, ipKey);
    }

    // Request with a spoofed leftmost IP but the same rightmost real IP —
    // must be rejected because sseClientIpKey uses the rightmost-public entry.
    const res = await request(app)
      .get("/api/events")
      .set("X-Forwarded-For", `198.51.100.5, ${realIp}`);

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ ok: false, code: "too_many_connections" });
  });
});
