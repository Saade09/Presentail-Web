#!/usr/bin/env node

/**
 * Production cache-boundary diagnostic.
 *
 * It intentionally measures a completely anonymous request separately from an
 * affinity-established request. Cookie values are held only in memory and are
 * never printed or written; reports contain cookie names only.
 */

const baseUrl = (process.env.BASE_URL ?? "https://presentail.com").replace(/\/$/, "");
const sourceImage =
  process.env.SOURCE_IMAGE_URL ??
  "https://os.presentail.com/api/storage/public-objects/products/318/main.png";

function cookieNames(setCookie) {
  if (!setCookie) return [];
  return [...setCookie.matchAll(/(?:^|,\s*)([^=;,\s]+)=/g)].map((match) => match[1]);
}

function cookieHeader(setCookie) {
  if (!setCookie) return "";
  return setCookie
    .split(/,(?=[^;,]+=)/)
    .map((part) => part.split(";", 1)[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function policy(cacheControl) {
  const value = (cacheControl ?? "").toLowerCase();
  if (value.includes("no-store")) return "no-store";
  if (value.includes("private")) return "private";
  if (value.includes("public")) return "public";
  return "unspecified";
}

async function request(path, cookie = "", options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "user-agent": "Presentail-Public-Cache-Boundary/1.0",
      accept: options.accept ?? "*/*",
      "accept-encoding": "br, gzip",
      ...(cookie ? { cookie } : {}),
    },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  await response.body?.cancel();
  const setCookie = response.headers.get("set-cookie") ?? "";
  return {
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    cachePolicy: policy(response.headers.get("cache-control")),
    age: response.headers.get("age"),
    etag: response.headers.get("etag"),
    vary: response.headers.get("vary"),
    contentEncoding: response.headers.get("content-encoding"),
    cookieNames: cookieNames(setCookie),
    _cookie: cookieHeader(setCookie),
  };
}

const landing = await request("/", "", { accept: "text/html" });
const affinityCookie = landing._cookie;
const html = await fetch(`${baseUrl}/`, {
  headers: {
    "user-agent": "Presentail-Public-Cache-Boundary/1.0",
    ...(affinityCookie ? { cookie: affinityCookie } : {}),
  },
  signal: AbortSignal.timeout(20_000),
}).then((response) => response.text());
const assetPath =
  html.match(/(?:src|href)="([^"]*\/assets\/[^"]+\.(?:js|css))"/i)?.[1] ?? null;

const imagePath =
  `/api/img/proxy?url=${encodeURIComponent(sourceImage)}&w=400&f=webp`;
const probes = [
  { name: "hashedAsset", path: assetPath, expected: "public" },
  { name: "publicImage", path: imagePath, expected: "public" },
  { name: "currencies", path: "/api/currencies", expected: "public" },
  {
    name: "deliveryLocations",
    path: "/api/delivery-locations?profile=summary&cityId=lb-beirut",
    expected: "public",
  },
  { name: "geoCurrency", path: "/api/geo/currency", expected: "private" },
  { name: "anonymousHtml", path: "/en-lb/beirut/", expected: "private" },
  { name: "checkoutHtml", path: "/en-lb/beirut/checkout", expected: "private" },
];

const results = {};
const failures = [];
for (const probe of probes) {
  if (!probe.path) {
    failures.push(`${probe.name}: no hashed asset URL discovered`);
    continue;
  }
  const anonymous = await request(probe.path);
  const established = await request(probe.path, affinityCookie);
  delete anonymous._cookie;
  delete established._cookie;
  results[probe.name] = { path: probe.path, anonymous, affinityEstablished: established };

  if (established.status !== 200 && established.status !== 304) {
    failures.push(`${probe.name}: affinity-established status ${established.status}`);
  }
  if (probe.expected === "public" && established.cachePolicy !== "public") {
    failures.push(
      `${probe.name}: expected public affinity-established policy, got ${established.cachePolicy}`,
    );
  }
  if (probe.expected === "private" && !["private", "no-store"].includes(established.cachePolicy)) {
    failures.push(
      `${probe.name}: expected private/no-store policy, got ${established.cachePolicy}`,
    );
  }
  if ((established.vary ?? "").toLowerCase().includes("cookie")) {
    failures.push(`${probe.name}: response varies by Cookie`);
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  baseUrl,
  platformAffinity: {
    acquired: Boolean(affinityCookie),
    cookieNames: landing.cookieNames,
    valuesPersisted: false,
  },
  results,
  failures,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;