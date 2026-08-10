/**
 * Integration tests for the X-Robots-Tag header on Markdown mirror responses.
 *
 * The per-page .md mirrors (e.g. /en-lb/tripoli.md) and the /index.md homepage
 * mirror duplicate the canonical HTML pages' content. Without a noindex
 * directive they can compete with the HTML pages as separate search results.
 * serve.mjs therefore emits `X-Robots-Tag: noindex, follow` on every
 * successful .md mirror response, alongside the existing canonical Link
 * header. The canonical HTML pages themselves must remain indexable.
 *
 * The test spawns serve.mjs as a real child process (same pattern as
 * serve-sitemap-md.test.ts) so it exercises the actual serving code path.
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

describe("serve.mjs — .md mirror X-Robots-Tag", () => {
  it("per-page .md mirror carries noindex, follow AND the canonical Link header", async () => {
    const { status, headers } = await get(serverPort, "/en-lb/tripoli.md");
    expect(status).toBe(200);
    expect(headers["x-robots-tag"]).toBe("noindex, follow");
    expect(headers["link"]).toContain('/en-lb/tripoli>; rel="canonical"');
  });

  it("another city .md mirror carries the same header (structural fix, not Tripoli-only)", async () => {
    const { status, headers } = await get(serverPort, "/en-lb/beirut.md");
    expect(status).toBe(200);
    expect(headers["x-robots-tag"]).toBe("noindex, follow");
  });

  it("/index.md carries noindex, follow", async () => {
    const { status, headers } = await get(serverPort, "/index.md");
    expect(status).toBe(200);
    expect(headers["x-robots-tag"]).toBe("noindex, follow");
  });

  it("canonical HTML page /en-lb/tripoli has NO noindex header and body allows indexing", async () => {
    const { status, headers, body } = await get(serverPort, "/en-lb/tripoli");
    expect(status).toBe(200);
    expect(headers["x-robots-tag"] ?? "").not.toContain("noindex");
    expect(body).not.toContain('name="robots" content="noindex');
  });
});
