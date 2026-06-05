import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Integration test for the Clerk-disabled boot path in src/app.ts.
//
// Contract under test:
//
//   * When CLERK_SECRET_KEY is missing or doesn't match `^sk_(test|live)_`,
//     the real `@clerk/express` clerkMiddleware MUST NOT be mounted —
//     mounting it without a valid key throws "Missing Clerk Secret Key"
//     synchronously per request and 500s every endpoint, including fully
//     public ones (cf. the outage that motivated this guard).
//
//   * In that disabled mode, the app installs a shim middleware that sets
//     `req.auth = () => ({ userId: null, sessionClaims: null })` so the
//     existing call sites (analytics.ts, lib/auth.ts, lib/requireUserType.ts)
//     keep working as if no Clerk session is present.
//
//   * When CLERK_SECRET_KEY looks like a real key (`sk_test_…` / `sk_live_…`),
//     the real middleware is mounted instead.
//
// We assert behaviour from the outside — by exercising getAuth(req)
// through a probe route added to the imported app — so the test stays
// independent of how the guard is implemented internally.

const ORIGINAL_CLERK_SECRET = process.env.CLERK_SECRET_KEY;

// Stub out the heavy bits of the app graph that aren't relevant here.
// We only care about the auth-mount decision, not about routes/db/etc.
// vi.mock factories are hoisted above ES imports, so they can't `await
// import("express")` directly — instead we return a no-op handler that
// Express accepts wherever a Router would have been mounted.
const noopHandler = (_req: any, _res: any, next: any) => next();
vi.mock("../src/routes", () => ({ default: noopHandler }));
vi.mock("../src/routes/clerkWebhook", () => ({ default: noopHandler }));
vi.mock("../src/routes/wooWebhook", () => ({ default: noopHandler }));
// Mock pino-http to avoid spawning pino-pretty worker threads per
// vi.resetModules() cycle. pinoHttp inspects pino logger internals
// (logger.values, logger.levels) that a plain object mock can't satisfy.
vi.mock("pino-http", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../src/middlewares/clerkProxyMiddleware", () => ({
  CLERK_PROXY_PATH: "/__clerk_proxy_test__",
  clerkProxyMiddleware: () => noopHandler,
}));

// Track whether the real `clerkMiddleware()` factory got called when the
// app booted. The factory itself returns a no-op middleware here so we
// don't have to satisfy the real Clerk runtime.
// The real clerkMiddleware attaches `req.auth` on every request. Our mock
// does the same with a sentinel value so the probe can distinguish "real
// middleware ran" from "shim ran" by inspecting `req.auth()`.
const clerkMiddlewareFactory = vi.fn(
  () => (req: any, _res: any, next: any) => {
    req.auth = () => ({
      userId: "real-clerk-user",
      sessionClaims: { real: true },
    });
    next();
  },
);
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => clerkMiddlewareFactory(),
  getAuth: (req: any) =>
    typeof req?.auth === "function" ? req.auth() : null,
  createClerkClient: () => ({}),
}));

async function buildAppWithSecret(secret: string | undefined) {
  if (secret === undefined) {
    delete process.env.CLERK_SECRET_KEY;
  } else {
    process.env.CLERK_SECRET_KEY = secret;
  }
  // Re-import the app fresh so the boot-time guard re-evaluates against
  // the current env. vi.resetModules in afterEach guarantees isolation.
  const { default: app } = await import("../src/app");
  // Probe route: surface the shape of req.auth to the test. We mount it
  // after the app's own routes so we still go through every middleware.
  app.get("/__clerk_probe__", (req: any, res) => {
    res.json({
      hasAuthFn: typeof req.auth === "function",
      auth: typeof req.auth === "function" ? req.auth() : null,
    });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_CLERK_SECRET === undefined) {
    delete process.env.CLERK_SECRET_KEY;
  } else {
    process.env.CLERK_SECRET_KEY = ORIGINAL_CLERK_SECRET;
  }
});

describe("Clerk middleware mount guard (src/app.ts)", () => {
  it("installs a signed-out shim and skips clerkMiddleware when CLERK_SECRET_KEY is missing", async () => {
    const app = await buildAppWithSecret(undefined);
    const res = await request(app).get("/__clerk_probe__");

    expect(res.status).toBe(200);
    expect(res.body.hasAuthFn).toBe(true);
    // Shape mirrors @clerk/express's signed-out AuthObject for the
    // fields we actually consume.
    expect(res.body.auth).toEqual({ userId: null, sessionClaims: null });
    // Critical: the real Clerk middleware factory must NOT have run —
    // that is exactly what would throw "Missing Clerk Secret Key" and
    // 500 every public endpoint.
    expect(clerkMiddlewareFactory).not.toHaveBeenCalled();
  });

  it("installs the shim when CLERK_SECRET_KEY is set but doesn't look like a Clerk key", async () => {
    const app = await buildAppWithSecret("garbage_value_not_a_real_secret");
    const res = await request(app).get("/__clerk_probe__");

    expect(res.status).toBe(200);
    expect(res.body.auth).toEqual({ userId: null, sessionClaims: null });
    expect(clerkMiddlewareFactory).not.toHaveBeenCalled();
  });

  it("mounts the real clerkMiddleware when CLERK_SECRET_KEY looks like sk_test_…", async () => {
    const app = await buildAppWithSecret("sk_test_fake_key_just_for_shape_check");
    const res = await request(app).get("/__clerk_probe__");

    expect(res.status).toBe(200);
    // The real middleware ran (mocked to a no-op) and getAuth() returns
    // whatever Clerk would normally yield — here, our mock's value.
    expect(clerkMiddlewareFactory).toHaveBeenCalledTimes(1);
    expect(res.body.auth).toEqual({
      userId: "real-clerk-user",
      sessionClaims: { real: true },
    });
  });

  it("mounts the real clerkMiddleware when CLERK_SECRET_KEY looks like sk_live_…", async () => {
    const app = await buildAppWithSecret("sk_live_fake_key_just_for_shape_check");
    await request(app).get("/__clerk_probe__");
    expect(clerkMiddlewareFactory).toHaveBeenCalledTimes(1);
  });
});
