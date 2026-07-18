/**
 * Structured-data entity stubs — unconditional BreadcrumbList and FAQ assertions
 *
 * The suites in structured-data.spec.ts (groups 3–6) conditionally skip the
 * BreadcrumbList assertion when the live OS API does not resolve the slug. That
 * means the buildBrandHead / buildCategoryHead / buildOccasionHead code paths
 * are never exercised in CI or in a dev environment without an OS API key.
 *
 * This file closes that gap by wiring up an in-process mock API server and a
 * dedicated serve.mjs instance that points at it. Because the mock always
 * returns a valid entity response, the BreadcrumbList JSON-LD is always emitted
 * and every assertion below runs unconditionally — no test.skip guards.
 *
 * Architecture:
 *   mockApiServer (worker-scoped fixture)
 *     └─ Node.js http.createServer listening on an OS-assigned port.
 *        Responds to /api/woo/brand, /api/woo/category, /api/woo/occasion,
 *        and their -products counterparts. Falls back to an empty-ok response
 *        for all other paths (banner fetches, catalog/metadata, etc.) so
 *        serve.mjs starts cleanly without a real API upstream.
 *
 *   stubbedServePort (worker-scoped fixture)
 *     └─ Spawns serve.mjs with PORT=<free port> and
 *        INTERNAL_API_BASE_URL=http://127.0.0.1:<mockPort>.
 *        Waits for the "presentail-web serving" log line before yielding.
 *        Killed and cleaned up after all tests in the worker complete.
 *
 *   stubbedRequest (worker-scoped fixture)
 *     └─ An APIRequestContext whose baseURL is the stubbed serve instance.
 *        Tests use this fixture instead of the default `request` fixture.
 *
 * Suites covered:
 *   1. Brand path   /en-lb/beirut/brand/stub-brand
 *   2. Category path /en-lb/beirut/category/stub-category
 *   3. Occasion path /en-lb/beirut/occasion/stub-occasion
 *
 * Each suite asserts unconditionally:
 *   - Organization JSON-LD is present
 *   - BreadcrumbList JSON-LD is present
 *   - BreadcrumbList is well-formed (ListItem array, numeric positions, non-empty names)
 *   - BreadcrumbList has ≥ 2 items
 *   - Last item name matches the stub entity name
 *   - FAQPage JSON-LD is present (brand/category/occasion pages emit it when
 *     productCount > 0, which our mock always satisfies)
 */

import { test as base, expect, type APIRequestContext } from "@playwright/test";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "node:http";
import type { AddressInfo } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Stub entity data
// ---------------------------------------------------------------------------

const STUB_BRAND = {
  name: "Stub Brand",
  description: "A stub brand for unconditional BreadcrumbList e2e testing.",
  image: null,
  slug: "stub-brand",
};

const STUB_CATEGORY = {
  name: "Stub Category",
  description: "A stub category for unconditional BreadcrumbList e2e testing.",
  image: null,
  slug: "stub-category",
};

const STUB_OCCASION = {
  name: "Stub Occasion",
  description: "A stub occasion for unconditional BreadcrumbList e2e testing.",
  image: null,
  slug: "stub-occasion",
};

const STUB_PRODUCT_ITEM = {
  name: "Stub Product",
  id: "stub-product",
  image: { uri: "" },
};

// ---------------------------------------------------------------------------
// Path to the web artifact root (where serve.mjs lives)
// ---------------------------------------------------------------------------

const WEB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Base serve port — offset by workerIndex so parallel workers don't collide.
const BASE_SERVE_PORT = 29970;

// ---------------------------------------------------------------------------
// Mock API server factory
// ---------------------------------------------------------------------------

/**
 * Build a lightweight Node.js HTTP server that returns stub entity data for
 * every endpoint seo-inject.mjs calls when rendering brand/category/occasion
 * pages. Any unrecognised path gets an empty-ok response so serve.mjs startup
 * fetches (banners, catalog metadata, etc.) complete cleanly.
 */
function makeMockApiServer(): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const rawPath = (req.url ?? "/").split("?")[0];

    let body: unknown;

    if (rawPath === "/api/woo/brand") {
      body = { ok: true, brand: STUB_BRAND };
    } else if (rawPath === "/api/woo/brand-products") {
      // productCount > 0 triggers FAQPage emission in buildBrandHead
      body = { ok: true, count: 5 };
    } else if (rawPath === "/api/woo/category") {
      body = { ok: true, category: STUB_CATEGORY };
    } else if (rawPath === "/api/woo/category-products") {
      body = {
        ok: true,
        count: 3,
        products: [STUB_PRODUCT_ITEM],
      };
    } else if (rawPath === "/api/woo/occasion") {
      body = { ok: true, occasion: STUB_OCCASION };
    } else if (rawPath === "/api/woo/occasion-products") {
      body = {
        ok: true,
        total: 3,
        groups: [{ count: 3, products: [STUB_PRODUCT_ITEM] }],
      };
    } else {
      // Catch-all for serve.mjs startup fetches:
      //   /api/homepage/banners, /api/catalog/metadata, etc.
      body = { ok: true, banners: [], products: [], count: 0 };
    }

    const json = JSON.stringify(body);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(json),
    });
    res.end(json);
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface StubFixtures {
  stubbedRequest: APIRequestContext;
}

const test = base.extend<StubFixtures>({
  // Worker-scoped: the mock API server + serve.mjs instance start once for all
  // tests in the worker and are torn down when the worker finishes.
  stubbedRequest: [
    async ({}, use, workerInfo) => {
      // 1. Start the in-process mock API server on an OS-assigned port.
      const mockServer = makeMockApiServer();
      await new Promise<void>((resolve) =>
        mockServer.listen(0, "127.0.0.1", resolve),
      );
      const mockPort = (mockServer.address() as AddressInfo).port;

      // 2. Spawn serve.mjs with PORT and INTERNAL_API_BASE_URL overrides.
      const servePort = BASE_SERVE_PORT + workerInfo.workerIndex;
      let serveProcess: ChildProcess | null = null;

      try {
        serveProcess = spawn("node", ["serve.mjs"], {
          cwd: WEB_DIR,
          env: {
            ...process.env,
            PORT: String(servePort),
            INTERNAL_API_BASE_URL: `http://127.0.0.1:${mockPort}`,
            NODE_ENV: "production",
            // Suppress startup watchers / DB connections that are irrelevant
            // for these HTML-only tests.
            DATABASE_URL: "",
            PRESENTAIL_OS_API_KEY: "",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });

        // 3. Wait for the "presentail-web serving" log line (or timeout).
        await new Promise<void>((res, rej) => {
          const timeout = setTimeout(
            () => rej(new Error("serve.mjs did not emit ready log within 20 s")),
            20_000,
          );

          const onData = (chunk: Buffer) => {
            if (chunk.toString().includes(`on :${servePort}`)) {
              clearTimeout(timeout);
              serveProcess!.stdout?.off("data", onData);
              res();
            }
          };

          serveProcess!.stdout?.on("data", onData);

          serveProcess!.on("error", (err) => {
            clearTimeout(timeout);
            rej(err);
          });

          serveProcess!.on("exit", (code) => {
            clearTimeout(timeout);
            rej(
              new Error(
                `serve.mjs exited unexpectedly with code ${code ?? "null"}`,
              ),
            );
          });
        });

        // 4. Create a Playwright APIRequestContext pointing at the stubbed serve.
        const ctx = await base.request.newContext({
          baseURL: `http://127.0.0.1:${servePort}`,
        });

        await use(ctx);

        await ctx.dispose();
      } finally {
        // 5. Teardown: kill serve.mjs and close the mock server.
        if (serveProcess && !serveProcess.killed) {
          serveProcess.kill("SIGTERM");
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, 3_000);
            serveProcess!.on("exit", () => {
              clearTimeout(t);
              resolve();
            });
          });
        }
        await new Promise<void>((resolve) => mockServer.close(resolve));
      }
    },
    { scope: "worker" },
  ],
});

// ---------------------------------------------------------------------------
// Helpers — mirror the helpers in structured-data.spec.ts
// ---------------------------------------------------------------------------

function extractJsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const re =
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]) as Record<string, unknown>;
      if (Array.isArray(parsed["@graph"])) {
        for (const n of parsed["@graph"] as Record<string, unknown>[])
          nodes.push(n);
      } else {
        nodes.push(parsed);
      }
    } catch {
      // malformed block — skip
    }
  }
  return nodes;
}

function findBreadcrumbList(
  nodes: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  return nodes.find((n) => n["@type"] === "BreadcrumbList");
}

/**
 * Assert that a BreadcrumbList node is well-formed:
 *   - @type === "BreadcrumbList"
 *   - itemListElement is a non-empty array
 *   - every item has @type "ListItem", a numeric position ≥ 1, and a non-empty name
 */
function assertWellFormedBreadcrumbList(
  node: Record<string, unknown>,
): void {
  expect(node["@type"]).toBe("BreadcrumbList");
  const items = node.itemListElement as Array<Record<string, unknown>>;
  expect(Array.isArray(items), "itemListElement should be an array").toBe(true);
  expect(
    items.length,
    "BreadcrumbList should have at least one item",
  ).toBeGreaterThan(0);
  for (const item of items) {
    expect(item["@type"]).toBe("ListItem");
    expect(
      typeof item.position === "number" && item.position >= 1,
      "position should be a number ≥ 1",
    ).toBe(true);
    expect(
      typeof item.name === "string" &&
        (item.name as string).trim().length > 0,
      "name should be a non-empty string",
    ).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Suite 1 — Brand path with stubbed entity
// ---------------------------------------------------------------------------

test.describe(
  "BreadcrumbList (unconditional) — brand path /en-lb/beirut/brand/stub-brand",
  () => {
    let html: string;
    let nodes: Record<string, unknown>[];

    test.beforeAll(async ({ stubbedRequest }) => {
      const response = await stubbedRequest.get(
        "/en-lb/beirut/brand/stub-brand",
      );
      expect(
        response.status(),
        "brand entity page should return HTTP 200",
      ).toBe(200);
      html = await response.text();
      nodes = extractJsonLdNodes(html);
    });

    test('JSON-LD block with "@type":"Organization" is present', () => {
      expect(html).toContain('"@type":"Organization"');
    });

    test('"@type":"BreadcrumbList" JSON-LD is present', () => {
      expect(html).toContain('"@type":"BreadcrumbList"');
    });

    test("BreadcrumbList JSON-LD is well-formed (ListItem array with position and name)", () => {
      const node = findBreadcrumbList(nodes);
      expect(
        node,
        "BreadcrumbList node not found in JSON-LD blocks",
      ).toBeTruthy();
      assertWellFormedBreadcrumbList(node!);
    });

    test("BreadcrumbList has at least 2 items (Home > … > Brand Name)", () => {
      const node = findBreadcrumbList(nodes);
      expect(node, "BreadcrumbList node not found").toBeTruthy();
      const items = node!.itemListElement as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThanOrEqual(2);
    });

    test("last BreadcrumbList item name matches the stub brand name", () => {
      const node = findBreadcrumbList(nodes);
      expect(node, "BreadcrumbList node not found").toBeTruthy();
      const items = node!.itemListElement as Array<Record<string, unknown>>;
      const last = items[items.length - 1];
      expect(last.name).toBe(STUB_BRAND.name);
    });

    test('"@type":"FAQPage" JSON-LD is present (brand pages emit it when productCount > 0)', () => {
      expect(html).toContain('"@type":"FAQPage"');
    });

    test('FAQPage JSON-LD contains at least one "@type":"Question"', () => {
      expect(html).toContain('"@type":"Question"');
    });
  },
);

// ---------------------------------------------------------------------------
// Suite 2 — Category path with stubbed entity
// ---------------------------------------------------------------------------

test.describe(
  "BreadcrumbList (unconditional) — category path /en-lb/beirut/category/stub-category",
  () => {
    let html: string;
    let nodes: Record<string, unknown>[];

    test.beforeAll(async ({ stubbedRequest }) => {
      const response = await stubbedRequest.get(
        "/en-lb/beirut/category/stub-category",
      );
      expect(
        response.status(),
        "category entity page should return HTTP 200",
      ).toBe(200);
      html = await response.text();
      nodes = extractJsonLdNodes(html);
    });

    test('JSON-LD block with "@type":"Organization" is present', () => {
      expect(html).toContain('"@type":"Organization"');
    });

    test('"@type":"BreadcrumbList" JSON-LD is present', () => {
      expect(html).toContain('"@type":"BreadcrumbList"');
    });

    test("BreadcrumbList JSON-LD is well-formed (ListItem array with position and name)", () => {
      const node = findBreadcrumbList(nodes);
      expect(
        node,
        "BreadcrumbList node not found in JSON-LD blocks",
      ).toBeTruthy();
      assertWellFormedBreadcrumbList(node!);
    });

    test("BreadcrumbList has at least 2 items (Home > … > Category Name)", () => {
      const node = findBreadcrumbList(nodes);
      expect(node, "BreadcrumbList node not found").toBeTruthy();
      const items = node!.itemListElement as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThanOrEqual(2);
    });

    test("last BreadcrumbList item name matches the stub category name", () => {
      const node = findBreadcrumbList(nodes);
      expect(node, "BreadcrumbList node not found").toBeTruthy();
      const items = node!.itemListElement as Array<Record<string, unknown>>;
      const last = items[items.length - 1];
      expect(last.name).toBe(STUB_CATEGORY.name);
    });

    test('"@type":"FAQPage" JSON-LD is present (category pages emit it when productCount > 0)', () => {
      expect(html).toContain('"@type":"FAQPage"');
    });

    test('FAQPage JSON-LD contains at least one "@type":"Question"', () => {
      expect(html).toContain('"@type":"Question"');
    });
  },
);

// ---------------------------------------------------------------------------
// Suite 3 — Occasion path with stubbed entity
// ---------------------------------------------------------------------------

test.describe(
  "BreadcrumbList (unconditional) — occasion path /en-lb/beirut/occasion/stub-occasion",
  () => {
    let html: string;
    let nodes: Record<string, unknown>[];

    test.beforeAll(async ({ stubbedRequest }) => {
      const response = await stubbedRequest.get(
        "/en-lb/beirut/occasion/stub-occasion",
      );
      expect(
        response.status(),
        "occasion entity page should return HTTP 200",
      ).toBe(200);
      html = await response.text();
      nodes = extractJsonLdNodes(html);
    });

    test('JSON-LD block with "@type":"Organization" is present', () => {
      expect(html).toContain('"@type":"Organization"');
    });

    test('"@type":"BreadcrumbList" JSON-LD is present', () => {
      expect(html).toContain('"@type":"BreadcrumbList"');
    });

    test("BreadcrumbList JSON-LD is well-formed (ListItem array with position and name)", () => {
      const node = findBreadcrumbList(nodes);
      expect(
        node,
        "BreadcrumbList node not found in JSON-LD blocks",
      ).toBeTruthy();
      assertWellFormedBreadcrumbList(node!);
    });

    test("BreadcrumbList has at least 2 items (Home > … > Occasion Name)", () => {
      const node = findBreadcrumbList(nodes);
      expect(node, "BreadcrumbList node not found").toBeTruthy();
      const items = node!.itemListElement as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThanOrEqual(2);
    });

    test("last BreadcrumbList item name matches the stub occasion name", () => {
      const node = findBreadcrumbList(nodes);
      expect(node, "BreadcrumbList node not found").toBeTruthy();
      const items = node!.itemListElement as Array<Record<string, unknown>>;
      const last = items[items.length - 1];
      expect(last.name).toBe(STUB_OCCASION.name);
    });

    test('"@type":"FAQPage" JSON-LD is present (occasion pages emit it when productCount > 0)', () => {
      expect(html).toContain('"@type":"FAQPage"');
    });

    test('FAQPage JSON-LD contains at least one "@type":"Question"', () => {
      expect(html).toContain('"@type":"Question"');
    });
  },
);
