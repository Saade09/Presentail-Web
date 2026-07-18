/**
 * Integration tests for the country-subdomain → apex 301 redirect in
 * serve.mjs:
 *
 *   lb.presentail.com/* → 301 https://presentail.com/*
 *   ae.presentail.com/* → 301 https://presentail.com/*
 *   cy.presentail.com/* → 301 https://presentail.com/*
 *
 * Covers:
 *   1. All three country subdomains fire 301 via the Host header
 *   2. All three fire via the X-Forwarded-Host header (proxy chain)
 *   3. Path + query string are preserved verbatim
 *   4. Port suffix on the Host header is ignored (normalised away)
 *   5. Matching is case-insensitive
 *   6. The apex domain (presentail.com) is never redirected
 *   7. Unrelated hosts are unaffected
 *
 * The test spawns serve.mjs as a real child process so it exercises the
 * actual request handler — no mocking of the redirect logic.
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

describe("serve.mjs — lb.presentail.com → apex redirect", () => {
  it("301-redirects lb.presentail.com to the apex, preserving the path", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/shop",
      { host: "lb.presentail.com" },
    );
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/en-lb/beirut/shop");
  });

  it("preserves the query string on the redirect target", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/shop?category=roses&sort=price",
      { host: "lb.presentail.com" },
    );
    expect(status).toBe(301);
    expect(location).toBe(
      "https://presentail.com/en-lb/beirut/shop?category=roses&sort=price",
    );
  });

  it("honours X-Forwarded-Host (set by the upstream proxy)", async () => {
    const { status, location } = await get(serverPort, "/en-lb/beirut/shop", {
      host: "127.0.0.1",
      "x-forwarded-host": "lb.presentail.com",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/en-lb/beirut/shop");
  });

  it("redirects when Host carries an explicit :port suffix", async () => {
    const { status, location } = await get(serverPort, "/en-lb/beirut/shop", {
      host: "lb.presentail.com:443",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/en-lb/beirut/shop");
  });

  it("matches the lb Host case-insensitively", async () => {
    const { status, location } = await get(serverPort, "/en-lb/beirut/shop", {
      host: "LB.Presentail.COM",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/en-lb/beirut/shop");
  });

  it("redirects the root path", async () => {
    const { status, location } = await get(serverPort, "/", {
      host: "lb.presentail.com",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/");
  });
});

describe("serve.mjs — ae.presentail.com → apex redirect", () => {
  it("301-redirects ae.presentail.com to the apex, preserving the path", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-ae/dubai/shop",
      { host: "ae.presentail.com" },
    );
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/en-ae/dubai/shop");
  });

  it("honours X-Forwarded-Host for ae", async () => {
    const { status, location } = await get(serverPort, "/en-ae/dubai/shop", {
      host: "127.0.0.1",
      "x-forwarded-host": "ae.presentail.com",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/en-ae/dubai/shop");
  });

  it("preserves the query string for ae", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-ae/dubai/product/roses?ref=homepage",
      { host: "ae.presentail.com" },
    );
    expect(status).toBe(301);
    expect(location).toBe(
      "https://presentail.com/en-ae/dubai/product/roses?ref=homepage",
    );
  });
});

describe("serve.mjs — cy.presentail.com → apex redirect", () => {
  it("301-redirects cy.presentail.com to the apex, preserving the path", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-cy/nicosia/shop",
      { host: "cy.presentail.com" },
    );
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/en-cy/nicosia/shop");
  });

  it("honours X-Forwarded-Host for cy", async () => {
    const { status, location } = await get(serverPort, "/en-cy/nicosia/shop", {
      host: "127.0.0.1",
      "x-forwarded-host": "cy.presentail.com",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/en-cy/nicosia/shop");
  });
});

describe("serve.mjs — country-subdomain redirect safeguards", () => {
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

  it("does NOT redirect a host that contains a country-subdomain name as a substring (e.g. elb.presentail.com)", async () => {
    const { status, location } = await get(serverPort, "/en-lb/beirut/shop", {
      host: "elb.presentail.com",
    });
    expect(status).toBe(200);
    expect(location).toBeUndefined();
  });

  it("fires on X-Forwarded-Host even when Host itself is non-matching", async () => {
    const { status, location } = await get(serverPort, "/en-ae/dubai/shop", {
      host: "presentail.com",
      "x-forwarded-host": "ae.presentail.com",
    });
    expect(status).toBe(301);
    expect(location).toBe("https://presentail.com/en-ae/dubai/shop");
  });
});
