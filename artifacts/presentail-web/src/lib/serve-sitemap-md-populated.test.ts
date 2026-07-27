/**
 * Integration test for the catalog-populated /sitemap.md path served by
 * serve.mjs.
 *
 * The sibling serve-sitemap-md.test.ts spawns serve.mjs with an unreachable
 * INTERNAL_API_BASE_URL, so it only exercises the graceful-fallback skeleton
 * (static sections). This file covers the other half: a small stub HTTP
 * server implements /api/woo/products, /api/woo/brands, and
 * /api/catalog/metadata, and INTERNAL_API_BASE_URL points at it. The test
 * then asserts that the populated sitemap.md contains the ## Products,
 * ## Brands, ## Occasions, and ## Categories sections with the stubbed
 * entities' .md mirror links — so a regression in the catalog fetch (URL,
 * response-shape unwrapping) or in buildSitemapMd's entity mapping
 * (slug/name/id filtering, link construction) is caught by CI instead of
 * silently leaving sitemap.md in permanent fallback mode.
 *
 * Same spawn pattern as serve-sitemap-md.test.ts / serve-llms-txt.test.ts:
 * serve.mjs runs as a real child process so the actual serving code path is
 * exercised, not a hand-rolled mock.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVE_MJS = path.resolve(__dirname, "../../serve.mjs");

// ---------------------------------------------------------------------------
// Stub catalog fixtures
// ---------------------------------------------------------------------------

const STUB_PRODUCTS = [
  { slug: "red-roses-bouquet", name: "Red Roses Bouquet", popularity: 10 },
  { slug: "chocolate-gift-box", name: "Chocolate Gift Box", popularity: 5 },
  // Discontinued products must be excluded from the sitemap.
  { slug: "retired-item", name: "Retired Item", status: "discontinued" },
];

const STUB_BRANDS = [
  { slug: "maison-des-fleurs", name: "Maison des Fleurs" },
  // Entries without a slug must be filtered out.
  { name: "No Slug Brand" },
];

const STUB_OCCASIONS = [
  { id: "birthday", name: "Birthday" },
  { id: "anniversary", name: "Anniversary" },
];

const STUB_CATEGORIES = [{ id: "flowers", name: "Flowers" }];

// ---------------------------------------------------------------------------
// Stub catalog API server
// ---------------------------------------------------------------------------

function startStubApi(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      let payload: unknown = null;
      if (url.pathname === "/api/woo/products") {
        payload = { products: STUB_PRODUCTS };
      } else if (url.pathname === "/api/woo/brands") {
        payload = { brands: STUB_BRANDS };
      } else if (url.pathname === "/api/catalog/metadata") {
        payload = { occasions: STUB_OCCASIONS, categories: STUB_CATEGORIES };
      }
      if (payload === null) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({ server, port: addr.port });
    });
    server.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// serve.mjs helpers (same pattern as serve-sitemap-md.test.ts)
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
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: urlPath },
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

let stubServer: http.Server;
let serverPort: number;
let serverProc: ChildProcess;

beforeAll(async () => {
  const stub = await startStubApi();
  stubServer = stub.server;
  serverPort = await getFreePort();
  serverProc = spawn("node", [SERVE_MJS], {
    env: {
      ...process.env,
      PORT: String(serverPort),
      BASE_PATH: "",
      INTERNAL_API_BASE_URL: `http://127.0.0.1:${stub.port}`,
      ALERTS_SLACK_WEBHOOK_URL: "",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForReady(serverPort);
}, 20_000);

afterAll(() => {
  serverProc?.kill("SIGTERM");
  stubServer?.close();
});

// ---------------------------------------------------------------------------
// /sitemap.md — catalog-populated body
// ---------------------------------------------------------------------------

describe("serve.mjs — /sitemap.md with a reachable catalog API", () => {
  it("serves 200 with the standard cache policy", async () => {
    const { status, headers } = await get(serverPort, "/sitemap.md");
    expect(status).toBe(200);
    expect(headers["cache-control"]).toBe(
      "public, max-age=3600, must-revalidate",
    );
  });

  it("contains the ## Products section with the stubbed products' .md links", async () => {
    const { body } = await get(serverPort, "/sitemap.md");
    expect(body).toContain("## Products");
    expect(body).toMatch(
      /\[Red Roses Bouquet\]\([^)]*\/en-lb\/beirut\/product\/red-roses-bouquet\.md\)/,
    );
    expect(body).toMatch(
      /\[Chocolate Gift Box\]\([^)]*\/en-lb\/beirut\/product\/chocolate-gift-box\.md\)/,
    );
  });

  it("excludes discontinued products", async () => {
    const { body } = await get(serverPort, "/sitemap.md");
    expect(body).not.toContain("retired-item");
    expect(body).not.toContain("Retired Item");
  });

  it("orders products by popularity (most popular first)", async () => {
    const { body } = await get(serverPort, "/sitemap.md");
    const roses = body.indexOf("red-roses-bouquet.md");
    const chocolate = body.indexOf("chocolate-gift-box.md");
    expect(roses).toBeGreaterThan(-1);
    expect(chocolate).toBeGreaterThan(-1);
    expect(roses).toBeLessThan(chocolate);
  });

  it("contains the ## Brands section with the stubbed brand's .md link (and filters slug-less entries)", async () => {
    const { body } = await get(serverPort, "/sitemap.md");
    expect(body).toContain("## Brands");
    expect(body).toMatch(
      /\[Maison des Fleurs\]\([^)]*\/en-lb\/beirut\/brand\/maison-des-fleurs\.md\)/,
    );
    expect(body).not.toContain("No Slug Brand");
  });

  it("contains the ## Occasions section with the stubbed occasions' .md links", async () => {
    const { body } = await get(serverPort, "/sitemap.md");
    expect(body).toContain("## Occasions");
    expect(body).toMatch(
      /\[Birthday\]\([^)]*\/en-lb\/beirut\/occasion\/birthday\.md\)/,
    );
    expect(body).toMatch(
      /\[Anniversary\]\([^)]*\/en-lb\/beirut\/occasion\/anniversary\.md\)/,
    );
  });

  it("contains the ## Categories section with the stubbed category's .md link", async () => {
    const { body } = await get(serverPort, "/sitemap.md");
    expect(body).toContain("## Categories");
    expect(body).toMatch(
      /\[Flowers\]\([^)]*\/en-lb\/beirut\/category\/flowers\.md\)/,
    );
  });

  it("still contains the static structural sections alongside the catalog sections", async () => {
    const { body } = await get(serverPort, "/sitemap.md");
    expect(body).toContain("# Presentail — Markdown Mirror Index");
    expect(body).toContain("## City Homepages");
    expect(body).toContain("## Shop Pages");
    expect(body).toContain("## Best-Sellers Pages");
    expect(body).toContain("## Other Machine-Readable Indexes");
  });
});
