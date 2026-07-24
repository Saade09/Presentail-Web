/**
 * Integration tests for the /sitemap.md and /agents.md responses served by
 * serve.mjs.
 *
 * Verifies two things for each route:
 *
 *   1. Cache-Control — the header value is "public, max-age=3600,
 *      must-revalidate" (1-hour TTL with mandatory revalidation), the same
 *      policy as /llms.txt and /llms-full.txt. Neither file carries a content
 *      hash in its filename so they cannot use immutable caching; the 1-hour
 *      TTL ensures AI crawlers pick up changes promptly after a deploy while
 *      still reducing origin load. A regression that flips either route to an
 *      immutable or no-cache header would go undetected without this test.
 *
 *   2. Content — the response bodies contain the expected section headings
 *      (so a blank or truncated body is caught before AI crawlers index it):
 *      /sitemap.md must contain the top-level title and static structural
 *      sections that render even when the catalog fetch fails (the test
 *      environment points INTERNAL_API_BASE_URL at an unreachable port, so
 *      only the graceful-fallback skeleton is asserted); /agents.md must
 *      contain its agent-guidance sections including "## Countries and cities
 *      served" and "## Machine-readable indexes".
 *
 * The test spawns serve.mjs as a real child process (same pattern as
 * serve-llms-txt.test.ts and serve-llms-full-txt.test.ts) so it exercises the
 * actual serving code path, not a hand-rolled mock.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVE_MJS = path.resolve(__dirname, "../../serve.mjs");

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as { port: number };
      srv.close(() => resolve(addr.port));
    });
    srv.on("error", reject);
  });
}

function waitForReady(port: number, maxMs = 12_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    function attempt() {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/favicon-16x16.png" },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on("error", () => {
        if (Date.now() >= deadline) {
          reject(
            new Error(
              `serve.mjs on :${port} did not become ready within ${maxMs}ms`,
            ),
          );
        } else {
          setTimeout(attempt, 150);
        }
      });
      req.end();
    }
    setTimeout(attempt, 150);
  });
}

function get(
  port: number,
  urlPath: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: urlPath, headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

let serverPort: number;
let serverProc: ChildProcess;

beforeAll(async () => {
  serverPort = await getFreePort();
  serverProc = spawn("node", [SERVE_MJS], {
    env: {
      ...process.env,
      PORT: String(serverPort),
      BASE_PATH: "",
      INTERNAL_API_BASE_URL: "http://127.0.0.1:0",
      ALERTS_SLACK_WEBHOOK_URL: "",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForReady(serverPort);
}, 20_000);

afterAll(() => {
  serverProc?.kill("SIGTERM");
});

// ---------------------------------------------------------------------------
// /sitemap.md — Cache-Control header
// ---------------------------------------------------------------------------

describe("serve.mjs — /sitemap.md cache-control header", () => {
  it('serves sitemap.md with 200 and "public, max-age=3600, must-revalidate"', async () => {
    const { status, headers } = await get(serverPort, "/sitemap.md");
    expect(status).toBe(200);
    expect(headers["cache-control"]).toBe(
      "public, max-age=3600, must-revalidate",
    );
  });

  it("does NOT serve sitemap.md with an immutable or long-lived cache header", async () => {
    const { headers } = await get(serverPort, "/sitemap.md");
    const cc = headers["cache-control"] ?? "";
    expect(cc).not.toContain("immutable");
    expect(cc).not.toMatch(/max-age=3153600/);
  });
});

// ---------------------------------------------------------------------------
// /sitemap.md — body content
// ---------------------------------------------------------------------------

describe("serve.mjs — /sitemap.md body", () => {
  it("does not serve a blank body", async () => {
    const { body } = await get(serverPort, "/sitemap.md");
    expect(body.trim().length).toBeGreaterThan(0);
  });

  it("contains the top-level title heading", async () => {
    const { body } = await get(serverPort, "/sitemap.md");
    expect(body).toContain("# Presentail — Markdown Mirror Index");
  });

  it("contains the static structural section headings (graceful even with empty catalog)", async () => {
    const { body } = await get(serverPort, "/sitemap.md");
    expect(body).toContain("## City Homepages");
    expect(body).toContain("## Shop Pages");
    expect(body).toContain("## Best-Sellers Pages");
    expect(body).toContain("## Other Machine-Readable Indexes");
  });

  it("contains city homepage mirror links and machine-readable index links", async () => {
    const { body } = await get(serverPort, "/sitemap.md");
    expect(body).toContain("/en-lb/beirut.md");
    expect(body).toContain("/llms.txt");
    expect(body).toContain("/llms-full.txt");
    expect(body).toContain("/sitemap.xml");
    expect(body).toContain("/agents.md");
  });
});

// ---------------------------------------------------------------------------
// /agents.md — Cache-Control header
// ---------------------------------------------------------------------------

describe("serve.mjs — /agents.md cache-control header", () => {
  it('serves agents.md with 200 and "public, max-age=3600, must-revalidate"', async () => {
    const { status, headers } = await get(serverPort, "/agents.md");
    expect(status).toBe(200);
    expect(headers["cache-control"]).toBe(
      "public, max-age=3600, must-revalidate",
    );
  });

  it("does NOT serve agents.md with an immutable or long-lived cache header", async () => {
    const { headers } = await get(serverPort, "/agents.md");
    const cc = headers["cache-control"] ?? "";
    expect(cc).not.toContain("immutable");
    expect(cc).not.toMatch(/max-age=3153600/);
  });
});

// ---------------------------------------------------------------------------
// /agents.md — body content
// ---------------------------------------------------------------------------

describe("serve.mjs — /agents.md body", () => {
  it("does not serve a blank body", async () => {
    const { body } = await get(serverPort, "/agents.md");
    expect(body.trim().length).toBeGreaterThan(0);
  });

  it("contains the top-level agent-guidance heading", async () => {
    const { body } = await get(serverPort, "/agents.md");
    expect(body).toContain("# Presentail — Agent Guidance");
  });

  it("contains the expected section headings", async () => {
    const { body } = await get(serverPort, "/agents.md");
    expect(body).toContain("## Installation");
    expect(body).toContain("## Configuration");
    expect(body).toContain("## Usage");
    expect(body).toContain("## Countries and cities served");
    expect(body).toContain("## Machine-readable indexes");
  });

  it("links to the other machine-readable indexes", async () => {
    const { body } = await get(serverPort, "/agents.md");
    expect(body).toContain("https://presentail.com/llms.txt");
    expect(body).toContain("https://presentail.com/llms-full.txt");
    expect(body).toContain("https://presentail.com/sitemap.md");
    expect(body).toContain("https://presentail.com/sitemap.xml");
  });
});
