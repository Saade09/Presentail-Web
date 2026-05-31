import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyResult,
  runOnce,
  __resetForTest,
} from "../src/lib/seoAuditMonitor";

// ── Mocks ───────────────────────────────────────────────────────────────────

const sendAlertMock = vi.fn();

vi.mock("../src/lib/alerts", () => ({
  sendAlert: (...args: any[]) => sendAlertMock(...args),
}));

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

type PageResult = Parameters<typeof classifyResult>[0];

const base: PageResult = {
  label: "Homepage (LB)",
  url: "https://new.presentail.com/en-lb/beirut",
  ok: true,
  fetchFailed: false,
  ogImage: "https://new.presentail.com/img/product.jpg",
  ogImageReachable: true,
  ogImageSizeOk: true,
  fallbackUsed: false,
};

// ── classifyResult ───────────────────────────────────────────────────────────

describe("classifyResult", () => {
  it("returns 'error' when the page HTML could not be fetched", () => {
    const r: PageResult = {
      ...base,
      ok: false,
      fetchFailed: true,
      ogImage: null,
      ogImageReachable: null,
      ogImageSizeOk: null,
    };
    expect(classifyResult(r)).toBe("error");
  });

  it("returns 'error' when og:image is missing even if the fetch succeeded", () => {
    const r: PageResult = {
      ...base,
      ogImage: null,
      ogImageReachable: null,
      ogImageSizeOk: null,
      fallbackUsed: false,
    };
    expect(classifyResult(r)).toBe("error");
  });

  it("returns 'error' when the og:image URL is not reachable (4xx/5xx/network)", () => {
    const r: PageResult = { ...base, ogImageReachable: false, ogImageSizeOk: null };
    expect(classifyResult(r)).toBe("error");
  });

  it("returns 'warn' when og:image dimensions are wrong but image is reachable", () => {
    const r: PageResult = { ...base, ogImageSizeOk: false, fallbackUsed: false };
    expect(classifyResult(r)).toBe("warn");
  });

  it("returns 'warn' when the fallback site-wide image is used (even if reachable and size ok)", () => {
    const r: PageResult = {
      ...base,
      ogImage: "https://new.presentail.com/opengraph.jpg",
      ogImageReachable: true,
      ogImageSizeOk: true,
      fallbackUsed: true,
    };
    expect(classifyResult(r)).toBe("warn");
  });

  it("returns 'warn' when fallback is used and size is wrong (worst warn combo)", () => {
    const r: PageResult = {
      ...base,
      ogImage: "https://new.presentail.com/opengraph.jpg",
      ogImageReachable: true,
      ogImageSizeOk: false,
      fallbackUsed: true,
    };
    expect(classifyResult(r)).toBe("warn");
  });

  it("returns 'ok' for a fully healthy page", () => {
    expect(classifyResult(base)).toBe("ok");
  });

  it("returns 'ok' when size info is absent (null) but image is reachable and not fallback", () => {
    const r: PageResult = { ...base, ogImageSizeOk: null, fallbackUsed: false };
    expect(classifyResult(r)).toBe("ok");
  });

  it("prioritises 'error' over 'warn' when both fetchFailed and fallbackUsed are true", () => {
    const r: PageResult = {
      ...base,
      fetchFailed: true,
      ogImage: null,
      ogImageReachable: null,
      ogImageSizeOk: null,
      fallbackUsed: true,
    };
    expect(classifyResult(r)).toBe("error");
  });
});

// ── runOnce ──────────────────────────────────────────────────────────────────

// Minimal HTML snippet that contains a non-fallback og:image tag so every
// page audit resolves to a clean "ok". The image HEAD check also passes
// because our fetch stub returns ok:true for HEAD requests.
const HEALTHY_HTML = `
<html><head>
<meta property="og:image" content="https://new.presentail.com/img/product-specific.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="628" />
</head><body>hello</body></html>
`.trim();

// Builds a minimal Response-like object accepted by the fetch mock.
function makeResponse(ok: boolean, body = ""): Response {
  return {
    ok,
    text: () => Promise.resolve(body),
    // HEAD requests only need `ok`
  } as unknown as Response;
}

describe("runOnce — deduplication guard", () => {
  beforeEach(() => {
    sendAlertMock.mockReset();
    __resetForTest();
    // Default: every page fetch succeeds with healthy HTML; HEAD checks pass.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") return Promise.resolve(makeResponse(true));
        return Promise.resolve(makeResponse(true, HEALTHY_HTML));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fires a Slack alert when at least one page has a failing og:image", async () => {
    // Override: first call is a page-fetch that returns null (non-200) so
    // the first key-page is classified as "error".
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") return Promise.resolve(makeResponse(true));
        // Return a 404 for the very first GET so the first page fails.
        callCount++;
        if (callCount === 1) return Promise.resolve(makeResponse(false));
        return Promise.resolve(makeResponse(true, HEALTHY_HTML));
      }),
    );

    await runOnce();

    expect(sendAlertMock).toHaveBeenCalledOnce();
    const alert = sendAlertMock.mock.calls[0][0];
    expect(alert.source).toBe("seoAuditMonitor");
    expect(alert.severity).toBe("warn");
    expect(alert.title).toMatch(/SEO health digest/);
    expect(alert.title).toMatch(/failing/);
  });

  it("fires a Slack alert body listing all pages when warnings are present", async () => {
    // Make all pages serve the fallback og image so they all classify as "warn".
    const FALLBACK_HTML = `
<html><head>
<meta property="og:image" content="https://new.presentail.com/opengraph.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="628" />
</head><body>hello</body></html>
    `.trim();

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") return Promise.resolve(makeResponse(true));
        return Promise.resolve(makeResponse(true, FALLBACK_HTML));
      }),
    );

    await runOnce();

    expect(sendAlertMock).toHaveBeenCalledOnce();
    const alert = sendAlertMock.mock.calls[0][0];
    expect(alert.body).toMatch(/🟡/);
    expect(alert.body).toMatch(/using fallback site-wide image/);
    // Locale groups appear as section headers.
    expect(alert.body).toMatch(/Lebanon \(en-lb\/beirut\)/);
    expect(alert.body).toMatch(/UAE \(en-ae\/dubai\)/);
    // Key page types appear as bold items within each locale group.
    expect(alert.body).toMatch(/\*Homepage\*/);
    expect(alert.body).toMatch(/\*Product\*/);
  });

  it("does not fire a Slack alert when all pages are healthy", async () => {
    await runOnce();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it("does not fire a second alert when called twice on the same UTC day", async () => {
    // First call: one page fails so an alert fires and lastEvaluatedDay is set.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") return Promise.resolve(makeResponse(true));
        return Promise.resolve(makeResponse(false)); // all pages fail → alert
      }),
    );

    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledOnce();

    // Second call on the same "today" — the deduplication guard must block it.
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledOnce(); // still only once
  });

  it("runs again on a new UTC day after the guard was set on the previous day", async () => {
    // Pin the clock to a known moment so we can advance it precisely.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T10:00:00Z"));

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") return Promise.resolve(makeResponse(true));
        return Promise.resolve(makeResponse(false)); // all pages fail → alert
      }),
    );

    // First run: prevDay = 2026-05-29, sets lastEvaluatedDay to "2026-05-29".
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledOnce();

    // Advance 25 hours: now = 2026-05-31T11:00:00Z, prevDay = 2026-05-30.
    // Guard is "2026-05-29" so it no longer matches → audit runs again.
    vi.setSystemTime(new Date("2026-05-31T11:00:00Z"));

    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
