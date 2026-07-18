/**
 * checkSubdomainRedirects
 *
 * Post-DNS smoke test: verifies that all three retired country subdomains
 * (lb.presentail.com, ae.presentail.com, cy.presentail.com) issue a 301
 * redirect to the canonical apex (presentail.com) with the path and query
 * string preserved verbatim.
 *
 * Run this AFTER the infra team has added DNS CNAME records and CDN redirect
 * rules (see artifacts/presentail-web/docs/subdomain-redirect-runbook.md).
 *
 * Exit codes:
 *   0 — all redirects resolve correctly end-to-end
 *   1 — at least one check failed (redirect missing, wrong target, or network error)
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-subdomain-redirects
 *
 * Options:
 *   --timeout <ms>   Per-request timeout in milliseconds (default: 10000)
 *   --apex <origin>  Expected redirect target origin (default: https://presentail.com)
 */

import https from "node:https";
import http from "node:http";
import url from "node:url";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const timeoutIdx = args.indexOf("--timeout");
const TIMEOUT_MS = timeoutIdx !== -1 ? Number(args[timeoutIdx + 1]) : 10_000;
const apexIdx = args.indexOf("--apex");
const APEX_ORIGIN =
  apexIdx !== -1 ? args[apexIdx + 1] : "https://presentail.com";

// ---------------------------------------------------------------------------
// Check matrix: [subdomain, path, expected redirect target]
// ---------------------------------------------------------------------------

interface Check {
  subdomain: string;
  path: string;
  expectedLocation: string;
  description: string;
}

const CHECKS: Check[] = [
  {
    subdomain: "lb.presentail.com",
    path: "/en-lb/beirut/shop",
    expectedLocation: `${APEX_ORIGIN}/en-lb/beirut/shop`,
    description: "LB → apex, path preserved",
  },
  {
    subdomain: "lb.presentail.com",
    path: "/en-lb/beirut/shop?category=roses&sort=price",
    expectedLocation: `${APEX_ORIGIN}/en-lb/beirut/shop?category=roses&sort=price`,
    description: "LB → apex, query string preserved",
  },
  {
    subdomain: "ae.presentail.com",
    path: "/en-ae/dubai/shop",
    expectedLocation: `${APEX_ORIGIN}/en-ae/dubai/shop`,
    description: "AE → apex, path preserved",
  },
  {
    subdomain: "ae.presentail.com",
    path: "/en-ae/dubai/product/roses?ref=homepage",
    expectedLocation: `${APEX_ORIGIN}/en-ae/dubai/product/roses?ref=homepage`,
    description: "AE → apex, query string preserved",
  },
  {
    subdomain: "cy.presentail.com",
    path: "/en-cy/nicosia/shop",
    expectedLocation: `${APEX_ORIGIN}/en-cy/nicosia/shop`,
    description: "CY → apex, path preserved",
  },
  {
    subdomain: "cy.presentail.com",
    path: "/",
    expectedLocation: `${APEX_ORIGIN}/`,
    description: "CY → apex, root path",
  },
];

// ---------------------------------------------------------------------------
// HTTP fetch — single request, no redirect following
// ---------------------------------------------------------------------------

interface FetchResult {
  status: number;
  location: string | undefined;
  error?: string;
}

function fetchOnce(targetUrl: string): Promise<FetchResult> {
  return new Promise((resolve) => {
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        "user-agent": "presentail-subdomain-smoke-test/1.0",
      },
      timeout: TIMEOUT_MS,
    };

    const req = lib.request(options, (res) => {
      res.resume();
      resolve({
        status: res.statusCode ?? 0,
        location: Array.isArray(res.headers.location)
          ? res.headers.location[0]
          : res.headers.location,
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, location: undefined, error: `Timed out after ${TIMEOUT_MS}ms` });
    });

    req.on("error", (err) => {
      resolve({ status: 0, location: undefined, error: err.message });
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

console.log(
  `\nPresentail subdomain redirect smoke test — apex target: ${APEX_ORIGIN}\n` +
  `${"─".repeat(72)}`,
);

for (const check of CHECKS) {
  const targetUrl = `https://${check.subdomain}${check.path}`;
  process.stdout.write(`  ${check.description}\n  → ${targetUrl}\n`);

  const result = await fetchOnce(targetUrl);

  if (result.error) {
    console.log(`  ✗ NETWORK ERROR: ${result.error}\n`);
    failed++;
    continue;
  }

  if (result.status !== 301) {
    console.log(
      `  ✗ FAIL: expected HTTP 301, got HTTP ${result.status}` +
      (result.location ? ` (location: ${result.location})` : "") +
      "\n",
    );
    failed++;
    continue;
  }

  if (result.location !== check.expectedLocation) {
    console.log(
      `  ✗ FAIL: HTTP 301 but wrong location\n` +
      `    expected: ${check.expectedLocation}\n` +
      `    got:      ${result.location ?? "(none)"}\n`,
    );
    failed++;
    continue;
  }

  console.log(`  ✓ PASS: HTTP 301 → ${result.location}\n`);
  passed++;
}

console.log(
  `${"─".repeat(72)}\n` +
  `Results: ${passed} passed, ${failed} failed out of ${CHECKS.length} checks.\n`,
);

if (failed > 0) {
  console.error(
    `ERROR: ${failed} check(s) failed.\n` +
    `Ensure DNS CNAME records and CDN redirect rules are in place.\n` +
    `See artifacts/presentail-web/docs/subdomain-redirect-runbook.md for steps.\n`,
  );
  process.exit(1);
}

console.log("All subdomain redirects are working correctly.");
