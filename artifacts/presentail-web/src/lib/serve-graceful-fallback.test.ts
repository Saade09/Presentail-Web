/**
 * Regression test: serve.mjs must start cleanly when sidecar-cache.mjs is
 * missing (e.g. compress-assets.mjs never ran on this deploy).
 *
 * The test uses a Node.js ESM customization-hook (--import) to make the
 * dynamic `import("./sidecar-cache.mjs")` inside serve.mjs throw
 * ERR_MODULE_NOT_FOUND without touching the real file on disk.  This keeps
 * the test hermetic and free of filesystem side-effects.
 *
 * What is verified:
 *  1. The server reaches the listening state — it did not exit/crash.
 *  2. A WARN log confirms the graceful fallback path was taken.
 *  3. The "Sidecar cache: 0 .br + 0 .gz" stdout log confirms collectSidecars
 *     was replaced by the no-op `() => {}` so SIDECAR_PATHS stays empty.
 *  4. The server still responds to HTTP requests (functional degraded mode).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVE_MJS = path.resolve(__dirname, "../../serve.mjs");
const HOOK_MJS = path.resolve(
  __dirname,
  "test-fixtures/sidecar-missing-hook.mjs",
);

// ---------------------------------------------------------------------------
// Helpers (same pattern used by serve-sidecar.test.ts)
// ---------------------------------------------------------------------------

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
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: urlPath },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Process setup — spawn serve.mjs with the sidecar-missing hook injected
// ---------------------------------------------------------------------------

let serverPort: number;
let serverProc: ChildProcess;
let capturedStdout = "";
let capturedStderr = "";

beforeAll(async () => {
  serverPort = await getFreePort();

  // --import registers the ESM hook before serve.mjs runs, causing the
  // dynamic import("./sidecar-cache.mjs") to throw ERR_MODULE_NOT_FOUND.
  serverProc = spawn(
    "node",
    [`--import=${pathToFileURL(HOOK_MJS).href}`, SERVE_MJS],
    {
      env: {
        ...process.env,
        PORT: String(serverPort),
        BASE_PATH: "",
        // Prevent any real network calls during startup (SEO inject fetches
        // product data lazily on request, not at import time).
        INTERNAL_API_BASE_URL: "http://127.0.0.1:0",
        // Ensure Slack alerts are suppressed (no webhook configured in tests).
        ALERTS_SLACK_WEBHOOK_URL: "",
        // Keep NODE_ENV unset (not "production") so the Slack branch is skipped.
        NODE_ENV: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  serverProc.stdout?.on("data", (chunk: Buffer) => {
    capturedStdout += chunk.toString();
  });
  serverProc.stderr?.on("data", (chunk: Buffer) => {
    capturedStderr += chunk.toString();
  });

  await waitForReady(serverPort);
}, 20_000);

afterAll(() => {
  serverProc?.kill("SIGTERM");
});

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

describe("serve.mjs — graceful fallback when sidecar-cache.mjs is missing", () => {
  it("reaches the listening state without exiting", () => {
    // If the server was not ready, waitForReady() would have rejected and
    // beforeAll would have failed — reaching here proves the server is up.
    expect(serverProc.exitCode).toBeNull();
    expect(serverPort).toBeGreaterThan(0);
  });

  it("emits a WARN log confirming the fallback was activated", () => {
    // serve.mjs line: console.warn(`WARN: sidecar-cache.mjs failed to load at startup: ...`)
    expect(capturedStderr).toMatch(
      /WARN: sidecar-cache\.mjs failed to load at startup/,
    );
  });

  it("logs SIDECAR_PATHS as empty (collectSidecars is the no-op)", () => {
    // serve.mjs line: console.log(`Sidecar cache: ${brCount} .br + ${gzCount} .gz paths loaded`)
    // When collectSidecars is the no-op () => {}, it never populates
    // SIDECAR_PATHS, so the count must be 0 for both extensions.
    expect(capturedStdout).toMatch(/Sidecar cache: 0 \.br \+ 0 \.gz paths loaded/);
  });

  it("still serves static files (degraded mode is functional)", async () => {
    const { status } = await get(serverPort, "/favicon-16x16.png");
    expect(status).toBe(200);
  });

  it("still returns the SPA shell for unknown routes", async () => {
    const { status, body } = await get(serverPort, "/some/spa/route");
    // The SPA shell (index.html) is returned for unmatched paths.
    expect(status).toBe(200);
    // Match case-insensitively — Vite emits <!DOCTYPE html> (uppercase).
    expect(body.toLowerCase()).toContain("<!doctype html>");
  });
});
