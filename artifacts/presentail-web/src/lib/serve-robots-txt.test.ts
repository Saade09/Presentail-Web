/**
 * Integration tests for the /robots.txt response served by serve.mjs.
 *
 * Verifies two things:
 *
 *   1. Content — all expected Disallow entries are present in the response
 *      body, including the WordPress-path entries (wp-admin/, wp-json/,
 *      wp-content/, wp-includes/, wp-login.php) and the /author/ entry that
 *      block legacy crawl-budget waste. A missing or wrong Disallow rule would
 *      silently let crawlers index undesirable paths after a deploy.
 *
 *   2. Cache-Control — the header value is "public, max-age=3600,
 *      must-revalidate" (1-hour TTL with mandatory revalidation). robots.txt
 *      carries no content hash in its filename so it cannot use immutable
 *      caching; the 1-hour TTL ensures crawlers pick up Disallow changes
 *      promptly after a deploy while still reducing origin load.
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

type RobotsRecord = {
  agents: string[];
  directives: string[];
};

function parseAgentRecords(body: string): RobotsRecord[] {
  const records: RobotsRecord[] = [];
  let current: RobotsRecord | null = null;
  let sealed = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    if (/^User-agent:/i.test(line)) {
      const agent = line.slice(line.indexOf(":") + 1).trim();
      if (!current || sealed) {
        current = { agents: [agent], directives: [] };
        records.push(current);
        sealed = false;
      } else {
        current.agents.push(agent);
      }
      continue;
    }

    if (/^Sitemap:/i.test(line)) continue;
    if (current) {
      current.directives.push(line);
      sealed = true;
    }
  }

  return records;
}

function recordFor(body: string, agent: string): RobotsRecord {
  const record = parseAgentRecords(body).find((candidate) =>
    candidate.agents.includes(agent),
  );
  if (!record) throw new Error(`Missing User-agent: ${agent} record`);
  return record;
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

describe("serve.mjs — /robots.txt cache-control header", () => {
  it('serves robots.txt with "public, max-age=3600, must-revalidate" (1-hour short-lived TTL)', async () => {
    const { status, headers } = await get(serverPort, "/robots.txt");
    expect(status).toBe(200);
    expect(headers["cache-control"]).toBe("public, max-age=3600, must-revalidate");
  });

  it("does NOT serve robots.txt with an immutable or long-lived cache header", async () => {
    const { headers } = await get(serverPort, "/robots.txt");
    const cc = headers["cache-control"] ?? "";
    expect(cc).not.toContain("immutable");
    expect(cc).not.toMatch(/max-age=3153600/);
  });
});

// ---------------------------------------------------------------------------
// Response content — user-account and transactional Disallow entries
// ---------------------------------------------------------------------------

describe("serve.mjs — /robots.txt account and transactional Disallow entries", () => {
  const ACCOUNT_DISALLOWS = [
    "Disallow: /cart",
    "Disallow: /checkout",
    "Disallow: /auth",
    "Disallow: /account",
    "Disallow: /order-confirmed",
    "Disallow: /sign-in",
    "Disallow: /sign-up",
    "Disallow: /reset-password",
    "Disallow: /favorites",
    "Disallow: /personal-information",
    "Disallow: /admin",
    "Disallow: /api/",
  ];

  for (const line of ACCOUNT_DISALLOWS) {
    it(`contains "${line}"`, async () => {
      const { body } = await get(serverPort, "/robots.txt");
      expect(body).toContain(line);
    });
  }

  it("contains locale-prefixed Disallow variants (e.g. /*/cart)", async () => {
    const { body } = await get(serverPort, "/robots.txt");
    expect(body).toContain("Disallow: /*/cart");
    expect(body).toContain("Disallow: /*/checkout");
    expect(body).toContain("Disallow: /*/account");
  });
});

// ---------------------------------------------------------------------------
// Response content — legacy WordPress path entries
// ---------------------------------------------------------------------------

describe("serve.mjs — /robots.txt legacy WordPress Disallow entries", () => {
  const WP_DISALLOWS = [
    "Disallow: /wp-admin/",
    "Disallow: /wp-json/",
    "Disallow: /wp-content/",
    "Disallow: /wp-includes/",
    "Disallow: /wp-login.php",
    "Disallow: /author/",
  ];

  for (const line of WP_DISALLOWS) {
    it(`contains "${line}"`, async () => {
      const { body } = await get(serverPort, "/robots.txt");
      expect(body).toContain(line);
    });
  }
});

// ---------------------------------------------------------------------------
// Response content — scoped crawler records
// ---------------------------------------------------------------------------

describe("serve.mjs — /robots.txt crawler-agent record scoping", () => {
  const PRIVATE_DISALLOWS = [
    "Disallow: /cart",
    "Disallow: /checkout",
    "Disallow: /auth",
    "Disallow: /account",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /order-confirmed",
    "Disallow: /sign-in",
    "Disallow: /sign-up",
    "Disallow: /reset-password",
    "Disallow: /favorites",
    "Disallow: /personal-information",
    "Disallow: /*/cart",
    "Disallow: /*/checkout",
    "Disallow: /*/auth",
    "Disallow: /*/account",
    "Disallow: /*/sign-in",
    "Disallow: /*/sign-up",
    "Disallow: /*/reset-password",
    "Disallow: /*/favorites",
    "Disallow: /*/order-confirmed",
    "Disallow: /*/personal-information",
  ];
  const API_EXCEPTION_ALLOWS = [
    "Allow: /api/img/proxy",
    "Allow: /api/og-image/",
  ];
  const WP_DISALLOWS = [
    "Disallow: /wp-admin/",
    "Disallow: /wp-json/",
    "Disallow: /wp-content/",
    "Disallow: /wp-includes/",
    "Disallow: /wp-login.php",
    "Disallow: /author/",
  ];
  const WILDCARD_PARAMETER_DISALLOWS = [
    "Disallow: /*?_cr=",
    "Disallow: /*?utm_source=",
    "Disallow: /*?utm_medium=",
    "Disallow: /*?utm_campaign=",
    "Disallow: /*?utm_content=",
    "Disallow: /*?utm_term=",
    "Disallow: /*?utm_id=",
    "Disallow: /*?gclid=",
    "Disallow: /*?gbraid=",
    "Disallow: /*?wbraid=",
    "Disallow: /*?orderby=",
    "Disallow: /*?min_price=",
    "Disallow: /*?max_price=",
    "Disallow: /*?filter_",
    "Disallow: /*?sort=",
    "Disallow: /*?currency=",
    "Disallow: /*?wmc-currency=",
    "Disallow: /*?delivery=",
    "Disallow: /*?availability=",
    "Disallow: /*?price_min=",
    "Disallow: /*?price_max=",
    "Disallow: /*?page=",
    "Disallow: /*?ref=",
    "Disallow: /*?from=",
    "Disallow: /*?scroll=",
  ];

  it("keeps private, API-exception, locale-private, and legacy rules in Googlebot's record", async () => {
    const { body } = await get(serverPort, "/robots.txt");
    const googlebot = recordFor(body, "Googlebot");

    expect(googlebot.directives).toContain("Allow: /");
    for (const directive of [...API_EXCEPTION_ALLOWS, ...PRIVATE_DISALLOWS, ...WP_DISALLOWS]) {
      expect(googlebot.directives).toContain(directive);
    }
  });

  it("does not scope wildcard query-parameter or faceted-navigation blocks to Googlebot", async () => {
    const { body } = await get(serverPort, "/robots.txt");
    const googlebot = recordFor(body, "Googlebot");
    const wildcard = recordFor(body, "*");

    for (const directive of WILDCARD_PARAMETER_DISALLOWS) {
      expect(wildcard.directives).toContain(directive);
      expect(googlebot.directives).not.toContain(directive);
    }
  });

  it("gives Googlebot-Image exactly one directive: Allow: /", async () => {
    const { body } = await get(serverPort, "/robots.txt");
    expect(recordFor(body, "Googlebot-Image").directives).toEqual(["Allow: /"]);
  });

  it("gives Applebot-Extended a non-empty Allow directive", async () => {
    const { body } = await get(serverPort, "/robots.txt");
    expect(recordFor(body, "Applebot-Extended").directives).toEqual(["Allow: /"]);
  });
});

// ---------------------------------------------------------------------------
// Response content — URL parameter / faceted-navigation Disallow entries
// ---------------------------------------------------------------------------

describe("serve.mjs — /robots.txt URL-parameter Disallow entries", () => {
  const PARAM_DISALLOWS = [
    "Disallow: /*?utm_source=",
    "Disallow: /*?utm_medium=",
    "Disallow: /*?utm_campaign=",
    "Disallow: /*?gclid=",
    "Disallow: /*?sort=",
    "Disallow: /*?currency=",
    "Disallow: /*?page=",
  ];

  for (const line of PARAM_DISALLOWS) {
    it(`contains "${line}"`, async () => {
      const { body } = await get(serverPort, "/robots.txt");
      expect(body).toContain(line);
    });
  }
});

// ---------------------------------------------------------------------------
// Sitemap directive
// ---------------------------------------------------------------------------

describe("serve.mjs — /robots.txt sitemap directive", () => {
  it("contains the canonical Sitemap directive", async () => {
    const { body } = await get(serverPort, "/robots.txt");
    expect(body).toContain("Sitemap: https://presentail.com/sitemap.xml");
  });
});
