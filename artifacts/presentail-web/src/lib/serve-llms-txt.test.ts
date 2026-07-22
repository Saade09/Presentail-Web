/**
 * Integration tests for the /llms.txt response served by serve.mjs.
 *
 * Verifies two things:
 *
 *   1. Cache-Control — the header value is "public, max-age=3600,
 *      must-revalidate" (1-hour TTL with mandatory revalidation). llms.txt
 *      carries no content hash in its filename so it cannot use immutable
 *      caching; the 1-hour TTL ensures AI crawlers pick up changes promptly
 *      after a deploy while still reducing origin load. A regression that
 *      accidentally flips llms.txt to an immutable or no-cache header would
 *      go undetected without this test.
 *
 *   2. Content — the response body contains at least the top-level
 *      `# Presentail` heading (so a blank or truncated file is caught before
 *      AI crawlers index it) and the `/en-lb/beirut/shop` section link (the
 *      "Shop" entry from LLMS_PAGES, which is the primary products URL exposed
 *      to LLM agents). A missing heading or a missing products link means the
 *      generator silently regressed.
 *
 * The test spawns serve.mjs as a real child process (same dist folder used by
 * the other serve.mjs integration tests) so it exercises the actual serving
 * code path, not a hand-rolled mock.
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
// Cache-Control header
// ---------------------------------------------------------------------------

describe("serve.mjs — /llms.txt cache-control header", () => {
  it('serves llms.txt with "public, max-age=3600, must-revalidate" (1-hour short-lived TTL)', async () => {
    const { status, headers } = await get(serverPort, "/llms.txt");
    expect(status).toBe(200);
    expect(headers["cache-control"]).toBe("public, max-age=3600, must-revalidate");
  });

  it("does NOT serve llms.txt with an immutable or long-lived cache header", async () => {
    const { headers } = await get(serverPort, "/llms.txt");
    const cc = headers["cache-control"] ?? "";
    expect(cc).not.toContain("immutable");
    expect(cc).not.toMatch(/max-age=3153600/);
  });
});

// ---------------------------------------------------------------------------
// Response content — top-level heading
// ---------------------------------------------------------------------------

describe("serve.mjs — /llms.txt heading", () => {
  it('contains the top-level "# Presentail" heading', async () => {
    const { body } = await get(serverPort, "/llms.txt");
    expect(body).toContain("# Presentail");
  });

  it("does not serve a blank body", async () => {
    const { body } = await get(serverPort, "/llms.txt");
    expect(body.trim().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Response content — pages index links
// ---------------------------------------------------------------------------

describe("serve.mjs — /llms.txt pages index links", () => {
  it('contains the "## Pages" section header', async () => {
    const { body } = await get(serverPort, "/llms.txt");
    expect(body).toContain("## Pages");
  });

  it("contains the Shop (products) section link", async () => {
    const { body } = await get(serverPort, "/llms.txt");
    expect(body).toContain("/en-lb/beirut/shop");
  });

  it("contains the Brands section link", async () => {
    const { body } = await get(serverPort, "/llms.txt");
    expect(body).toContain("/en-lb/beirut/brands");
  });

  it("contains the Occasions section link", async () => {
    const { body } = await get(serverPort, "/llms.txt");
    expect(body).toContain("/en-lb/beirut/occasions");
  });
});
