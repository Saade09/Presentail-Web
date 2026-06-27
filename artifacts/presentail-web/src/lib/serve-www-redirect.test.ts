/**
 * Integration tests for the canonical-domain (www → apex) 301 redirect in
 * serve.mjs:
 *
 *   1. Host: www.presentail.com            → 301 https://presentail.com/<path>
 *   2. X-Forwarded-Host: www.presentail.com → 301 (proxy header takes priority)
 *   3. Path + query string are preserved on the redirect target
 *   4. Host with an explicit :port suffix still matches (port is ignored)
 *   5. Host is matched case-insensitively
 *   6. Any other host (e.g. presentail.com, 127.0.0.1) is unaffected
 *
 * The test spawns serve.mjs as a real child process using the same dist folder
 * that the other serve.mjs integration tests rely on.  Node.js's `http.request`
 * does not follow redirects, so the raw 301 + Location header is directly
 * observable in every response.
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

/**
 * Make a single HTTP GET without following redirects, allowing custom request
 * headers (so the Host / X-Forwarded-Host can be set per request).
 */
function get(
  port: number,
  urlPath: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; location: string | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: urlPath, headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers["location"] as string | undefined,
            body,
          }),
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

describe("serve.mjs — www → apex canonical redirect", () => {
  it("301-redirects a www Host to the apex domain, preserving the path", async () => {
    const { status, location } = await get(serverPort, "/en-lb/beirut/shop", {
      host: "www.presentail.com",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/en-lb/beirut/shop");
  });

  it("preserves the query string on the redirect target", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/shop?category=roses&sort=price",
      { host: "www.presentail.com" },
    );
    expect(status).toBe(301);
    expect(location).toBe(
      "https://presentail.com/en-lb/beirut/shop?category=roses&sort=price",
    );
  });

  it("honours X-Forwarded-Host (set by the upstream proxy)", async () => {
    const { status, location } = await get(serverPort, "/", {
      host: "127.0.0.1",
      "x-forwarded-host": "www.presentail.com",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/");
  });

  it("redirects when Host is www even though X-Forwarded-Host is non-www (OR semantics)", async () => {
    const { status, location } = await get(serverPort, "/account", {
      host: "www.presentail.com",
      "x-forwarded-host": "presentail.com",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/account");
  });

  it("redirects when X-Forwarded-Host is www even though Host is non-www (OR semantics)", async () => {
    const { status, location } = await get(serverPort, "/account", {
      host: "presentail.com",
      "x-forwarded-host": "www.presentail.com",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/account");
  });

  it("matches a www X-Forwarded-Host carrying a comma-separated proxy chain", async () => {
    const { status, location } = await get(serverPort, "/", {
      host: "127.0.0.1",
      "x-forwarded-host": "www.presentail.com, internal-proxy",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/");
  });

  it("matches a www Host that carries an explicit :port suffix", async () => {
    const { status, location } = await get(serverPort, "/account", {
      host: "www.presentail.com:443",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/account");
  });

  it("matches the www Host case-insensitively", async () => {
    const { status, location } = await get(serverPort, "/", {
      host: "WWW.Presentail.COM",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/");
  });

  it("does NOT redirect the apex domain (presentail.com)", async () => {
    const { status, location } = await get(serverPort, "/en-lb/beirut/shop", {
      host: "presentail.com",
    });
    expect(status).toBe(200);
    expect(location).toBeUndefined();
  });

  it("does NOT redirect an unrelated host", async () => {
    const { status, location } = await get(serverPort, "/en-lb/beirut/shop", {
      host: "127.0.0.1",
    });
    expect(status).toBe(200);
    expect(location).toBeUndefined();
  });
});

/**
 * A second server instance configured via the env overrides
 * (WEB_CANONICAL_REDIRECT_FROM_HOST / WEB_CANONICAL_REDIRECT_TARGET_ORIGIN)
 * to prove the canonical host + target are configurable without a code change.
 */
describe("serve.mjs — canonical redirect honours env overrides", () => {
  let port: number;
  let proc: ChildProcess;

  beforeAll(async () => {
    port = await getFreePort();
    proc = spawn("node", [SERVE_MJS], {
      env: {
        ...process.env,
        PORT: String(port),
        BASE_PATH: "",
        INTERNAL_API_BASE_URL: "http://127.0.0.1:0",
        ALERTS_SLACK_WEBHOOK_URL: "",
        NODE_ENV: "test",
        WEB_CANONICAL_REDIRECT_FROM_HOST: "www.presentail.ae",
        WEB_CANONICAL_REDIRECT_TARGET_ORIGIN: "https://presentail.ae",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForReady(port);
  }, 20_000);

  afterAll(() => {
    proc?.kill("SIGTERM");
  });

  it("redirects the configured source host to the configured target origin", async () => {
    const { status, location } = await get(port, "/en-ae/dubai/shop", {
      host: "www.presentail.ae",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.ae/en-ae/dubai/shop");
  });

  it("matches the configured source host case-insensitively", async () => {
    const { status, location } = await get(port, "/", {
      host: "WWW.Presentail.AE",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.ae/");
  });

  it("does NOT redirect the old hardcoded host once overridden", async () => {
    const { status, location } = await get(port, "/en-lb/beirut/shop", {
      host: "www.presentail.com",
    });
    expect(status).toBe(200);
    expect(location).toBeUndefined();
  });
});

/**
 * A third server instance with the source host explicitly set to empty string,
 * which must disable the redirect entirely.
 */
describe("serve.mjs — canonical redirect disabled when env override is empty", () => {
  let port: number;
  let proc: ChildProcess;

  beforeAll(async () => {
    port = await getFreePort();
    proc = spawn("node", [SERVE_MJS], {
      env: {
        ...process.env,
        PORT: String(port),
        BASE_PATH: "",
        INTERNAL_API_BASE_URL: "http://127.0.0.1:0",
        ALERTS_SLACK_WEBHOOK_URL: "",
        NODE_ENV: "test",
        WEB_CANONICAL_REDIRECT_FROM_HOST: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForReady(port);
  }, 20_000);

  afterAll(() => {
    proc?.kill("SIGTERM");
  });

  it("does NOT redirect the default www host when the source override is empty", async () => {
    const { status, location } = await get(port, "/en-lb/beirut/shop", {
      host: "www.presentail.com",
    });
    expect(status).toBe(200);
    expect(location).toBeUndefined();
  });
});
