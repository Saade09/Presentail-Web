import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response } from "express";

// ---------------------------------------------------------------------------
// Helpers to build minimal req/res mocks
// ---------------------------------------------------------------------------

function makeReq(headers: Record<string, string> = {}): Request {
  return {
    header(name: string): string | undefined {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

// ---------------------------------------------------------------------------
// Module under test (imported after helpers so env can be set beforehand)
// ---------------------------------------------------------------------------

import { checkAdminToken, requireAdminToken } from "./admin-auth";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const VALID_TOKEN = "super-secret-token-abc123";

describe("checkAdminToken", () => {
  beforeEach(() => {
    process.env.PUSH_ADMIN_TOKEN = VALID_TOKEN;
  });

  afterEach(() => {
    delete process.env.PUSH_ADMIN_TOKEN;
  });

  it("returns true when the correct token is in x-push-admin-token", () => {
    const req = makeReq({ "x-push-admin-token": VALID_TOKEN });
    const { res } = makeRes();
    expect(checkAdminToken(req, res)).toBe(true);
  });

  it("returns true when the correct token is in x-admin-token (fallback header)", () => {
    const req = makeReq({ "x-admin-token": VALID_TOKEN });
    const { res } = makeRes();
    expect(checkAdminToken(req, res)).toBe(true);
  });

  it("prefers x-push-admin-token over x-admin-token when both are present", () => {
    const req = makeReq({
      "x-push-admin-token": VALID_TOKEN,
      "x-admin-token": "wrong-token",
    });
    const { res } = makeRes();
    expect(checkAdminToken(req, res)).toBe(true);
  });

  it("returns true when the correct token is supplied via explicitSupplied override", () => {
    const req = makeReq({}); // no headers
    const { res } = makeRes();
    expect(checkAdminToken(req, res, VALID_TOKEN)).toBe(true);
  });

  it("returns false and sends 401 when token is missing from headers", () => {
    const req = makeReq({});
    const { res, status, json } = makeRes();
    expect(checkAdminToken(req, res)).toBe(false);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
    );
  });

  it("returns false and sends 401 when wrong token is supplied", () => {
    const req = makeReq({ "x-push-admin-token": "wrong-token" });
    const { res, status } = makeRes();
    expect(checkAdminToken(req, res)).toBe(false);
    expect(status).toHaveBeenCalledWith(401);
  });

  it("returns false and sends 401 for a token that is a prefix of the correct token", () => {
    const shorter = VALID_TOKEN.slice(0, VALID_TOKEN.length - 3);
    const req = makeReq({ "x-push-admin-token": shorter });
    const { res } = makeRes();
    expect(checkAdminToken(req, res)).toBe(false);
  });

  it("returns false and sends 401 for a token that extends the correct token", () => {
    const longer = VALID_TOKEN + "extra";
    const req = makeReq({ "x-push-admin-token": longer });
    const { res } = makeRes();
    expect(checkAdminToken(req, res)).toBe(false);
  });

  it("returns false and sends 401 when PUSH_ADMIN_TOKEN env var is not set", () => {
    delete process.env.PUSH_ADMIN_TOKEN;
    const req = makeReq({ "x-push-admin-token": VALID_TOKEN });
    const { res, status } = makeRes();
    expect(checkAdminToken(req, res)).toBe(false);
    expect(status).toHaveBeenCalledWith(401);
  });

  it("returns false and sends 401 when explicitSupplied is the wrong value", () => {
    const req = makeReq({}); // no headers
    const { res } = makeRes();
    expect(checkAdminToken(req, res, "wrong-explicit")).toBe(false);
  });

  it("returns false and sends 401 when explicitSupplied is undefined and no headers present", () => {
    const req = makeReq({});
    const { res } = makeRes();
    expect(checkAdminToken(req, res, undefined)).toBe(false);
  });
});

describe("requireAdminToken (middleware variant)", () => {
  const next = vi.fn();

  beforeEach(() => {
    process.env.PUSH_ADMIN_TOKEN = VALID_TOKEN;
    next.mockClear();
  });

  afterEach(() => {
    delete process.env.PUSH_ADMIN_TOKEN;
  });

  it("calls next() when token is valid", () => {
    const req = makeReq({ "x-push-admin-token": VALID_TOKEN });
    const { res } = makeRes();
    requireAdminToken(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("does NOT call next() when token is invalid", () => {
    const req = makeReq({ "x-push-admin-token": "bad-token" });
    const { res } = makeRes();
    requireAdminToken(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it("does NOT call next() when token is missing", () => {
    const req = makeReq({});
    const { res, status } = makeRes();
    requireAdminToken(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });
});
