import { describe, it, expect, beforeEach } from "vitest";
import type { Response } from "express";
import {
  addSseClient,
  removeSseClient,
  getSseClientCount,
  SSE_MAX_CONNECTIONS_PER_IP,
  __resetSseBroadcastForTests,
} from "./sseBroadcast";

// Minimal stub that satisfies the Response type for the registry.
function makeRes(): Response {
  return {} as unknown as Response;
}

beforeEach(() => {
  __resetSseBroadcastForTests();
});

describe("addSseClient", () => {
  it("accepts the first connection from an IP and returns true", () => {
    const res = makeRes();
    expect(addSseClient(res, "1.2.3.4")).toBe(true);
    expect(getSseClientCount()).toBe(1);
  });

  it("accepts connections up to the per-IP cap", () => {
    const ip = "10.0.0.1";
    for (let i = 0; i < SSE_MAX_CONNECTIONS_PER_IP; i++) {
      expect(addSseClient(makeRes(), ip)).toBe(true);
    }
    expect(getSseClientCount()).toBe(SSE_MAX_CONNECTIONS_PER_IP);
  });

  it("rejects the (cap+1)th connection from the same IP and returns false", () => {
    const ip = "10.0.0.2";
    for (let i = 0; i < SSE_MAX_CONNECTIONS_PER_IP; i++) {
      addSseClient(makeRes(), ip);
    }
    const rejected = makeRes();
    expect(addSseClient(rejected, ip)).toBe(false);
    // Rejected client must not be in the registry.
    expect(getSseClientCount()).toBe(SSE_MAX_CONNECTIONS_PER_IP);
  });

  it("gives distinct IPs independent caps", () => {
    const ipA = "192.168.1.1";
    const ipB = "192.168.1.2";
    // Fill up ipA's cap.
    for (let i = 0; i < SSE_MAX_CONNECTIONS_PER_IP; i++) {
      addSseClient(makeRes(), ipA);
    }
    // ipA is now full, but ipB should still be accepted.
    expect(addSseClient(makeRes(), ipB)).toBe(true);
    expect(getSseClientCount()).toBe(SSE_MAX_CONNECTIONS_PER_IP + 1);
  });
});

describe("removeSseClient", () => {
  it("decrements the IP counter so a subsequent connection is accepted", () => {
    const ip = "5.6.7.8";
    const responses: Response[] = [];
    for (let i = 0; i < SSE_MAX_CONNECTIONS_PER_IP; i++) {
      const res = makeRes();
      responses.push(res);
      addSseClient(res, ip);
    }
    // Cap is full — next add would be rejected.
    expect(addSseClient(makeRes(), ip)).toBe(false);

    // Remove one connection.
    removeSseClient(responses[0], ip);
    expect(getSseClientCount()).toBe(SSE_MAX_CONNECTIONS_PER_IP - 1);

    // Now there is room for one more connection.
    expect(addSseClient(makeRes(), ip)).toBe(true);
  });

  it("removes the IP entry entirely when the last connection closes", () => {
    const ip = "9.8.7.6";
    const res = makeRes();
    addSseClient(res, ip);
    removeSseClient(res, ip);
    expect(getSseClientCount()).toBe(0);
    // After removal a fresh connection should succeed.
    expect(addSseClient(makeRes(), ip)).toBe(true);
  });
});
