/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");
const staticAssetCanaryPercent = Math.min(
  100,
  Math.max(0, Number(process.env.STATIC_ASSET_CANARY_PERCENT || "0") || 0),
);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".map", ".svg"]);
const IMMUTABLE_ASSET_PATH =
  /^(?:static\/)?\d{10,}-\d+\/_expo\/static\/js\//;

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, "..", "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function parseAcceptEncoding(header) {
  const values = new Map();

  for (const part of String(header || "").toLowerCase().split(",")) {
    const [name, ...parameters] = part.trim().split(";");
    if (!name) continue;

    let quality = 1;
    for (const parameter of parameters) {
      const [key, value] = parameter.trim().split("=");
      if (key === "q" && value !== undefined) {
        const parsed = Number(value);
        quality = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
      }
    }
    values.set(name, quality);
  }

  return values;
}

function chooseEncoding(acceptEncoding, sidecars) {
  const values = parseAcceptEncoding(acceptEncoding);
  const wildcard = values.get("*");
  const supported = [
    ["br", ".br"],
    ["gzip", ".gz"],
  ];

  for (const [encoding, extension] of supported) {
    const quality = values.get(encoding) ?? wildcard ?? 0;
    if (quality > 0 && sidecars.has(extension)) {
      return { encoding, extension };
    }
  }

  return null;
}

function buildHeaders({
  contentType,
  contentLength,
  etag,
  encoding,
  cacheControl,
  vary,
  extra = {},
}) {
  return Object.fromEntries(
    Object.entries({
      "content-type": contentType,
      "content-length": String(contentLength),
      etag,
      "cache-control": cacheControl,
      vary: vary || (encoding ? "Accept-Encoding" : undefined),
      ...(encoding ? { "content-encoding": encoding } : {}),
      ...extra,
    }).filter(([, value]) => value !== undefined),
  );
}

function sendBody(req, res, status, headers, body) {
  res.writeHead(status, headers);
  if (req.method !== "HEAD") {
    res.end(body);
  } else {
    res.end();
  }
}

function serveFile(req, res, filePath, options = {}) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendBody(
      req,
      res,
      404,
      { "content-type": "text/plain; charset=utf-8" },
      "Not Found",
    );
    return;
  }

  const sourceStat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    options.contentType || MIME_TYPES[ext] || "application/octet-stream";
  const sidecars = new Map();

  if (TEXT_EXTENSIONS.has(ext)) {
    for (const sidecar of [".br", ".gz"]) {
      const sidecarPath = `${filePath}${sidecar}`;
      if (fs.existsSync(sidecarPath) && fs.statSync(sidecarPath).isFile()) {
        sidecars.set(sidecar, sidecarPath);
      }
    }
  }

  const selected = chooseEncoding(req.headers["accept-encoding"], sidecars);
  const selectedPath = selected ? sidecars.get(selected.extension) : filePath;
  const content = fs.readFileSync(selectedPath);
  const etag = `"${crypto
    .createHash("sha1")
    .update(`${sourceStat.size}:${sourceStat.mtimeMs}:${selected?.encoding || "identity"}`)
    .digest("hex")}"`;
  const cacheControl =
    options.cacheControl ||
    (IMMUTABLE_ASSET_PATH.test((options.urlPath || "").replace(/^\/+/, ""))
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300, stale-while-revalidate=60");
  const headers = buildHeaders({
    contentType,
    contentLength: content.length,
    etag,
    encoding: selected?.encoding,
    cacheControl,
    vary: sidecars.size > 0 ? "Accept-Encoding" : undefined,
    extra: options.extraHeaders,
  });

  if (req.headers["if-none-match"] === etag) {
    res.writeHead(
      304,
      Object.fromEntries(
        Object.entries({
          etag,
          "cache-control": cacheControl,
          vary: headers.vary,
        }).filter(([, value]) => value !== undefined),
      ),
    );
    res.end();
    return;
  }

  sendBody(req, res, 200, headers, content);
}

function serveGeneratedHtml(req, res, html) {
  const content = Buffer.from(html, "utf-8");
  const sidecars = new Map([
    [".br", zlib.brotliCompressSync(content)],
    [".gz", zlib.gzipSync(content, { level: 9 })],
  ]);
  const selected = chooseEncoding(req.headers["accept-encoding"], sidecars);
  const body = selected ? sidecars.get(selected.extension) : content;
  const etag = `"${crypto
    .createHash("sha1")
    .update(content)
    .update(`:${selected?.encoding || "identity"}`)
    .digest("hex")}"`;

  sendBody(
    req,
    res,
    200,
    buildHeaders({
      contentType: "text/html; charset=utf-8",
      contentLength: body.length,
      etag,
      encoding: selected?.encoding,
      cacheControl: "public, max-age=300, stale-while-revalidate=60",
      vary: "Accept-Encoding",
    }),
    body,
  );
}

function isStaticCanaryRequest(req, platform) {
  if (staticAssetCanaryPercent <= 0) return false;
  if (staticAssetCanaryPercent >= 100) return true;

  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const cohortKey = [
    req.headers["expo-session"] || "",
    forwardedFor || req.socket.remoteAddress || "",
    req.headers["user-agent"] || "",
    platform,
  ].join(":");
  const bucket = crypto
    .createHash("sha1")
    .update(cohortKey)
    .digest()
    .readUInt32BE(0) % 100;
  return bucket < staticAssetCanaryPercent;
}

function serveManifest(req, platform, res) {
  const wantsStatic = isStaticCanaryRequest(req, platform);
  const staticManifestPath = path.join(
    STATIC_ROOT,
    platform,
    "manifest-static.json",
  );
  const useStatic = wantsStatic && fs.existsSync(staticManifestPath);
  const manifestPath = useStatic
    ? staticManifestPath
    : path.join(STATIC_ROOT, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    sendBody(
      req,
      res,
      404,
      { "content-type": "application/json; charset=utf-8" },
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  serveFile(req, res, manifestPath, {
    urlPath: `${platform}/manifest.json`,
    contentType: "application/json",
    cacheControl: "no-store",
    extraHeaders: {
      "expo-protocol-version": "1",
      "expo-sfv-version": "0",
      "x-presentail-asset-delivery": useStatic ? "static" : "node",
      // The manifest body varies by platform. This is required if a CDN
      // caches the otherwise identical /app/ and /app/manifest requests.
      vary: "Expo-Platform, Accept-Encoding",
    },
  });

  console.log(
    JSON.stringify({
      event: "mobile_manifest_served",
      platform,
      assetDelivery: useStatic ? "static" : "node",
      canaryPercent: staticAssetCanaryPercent,
    }),
  );
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  serveGeneratedHtml(req, res, html);
}

function stripBasePath(pathname) {
  if (!basePath) return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length) || "/";
  }
  return pathname;
}

function serveStaticFile(req, res, urlPath) {
  const safePath = path.posix.normalize(`/${urlPath}`).replace(/^\/+/, "");
  const filePath = path.resolve(STATIC_ROOT, safePath);

  if (
    filePath !== STATIC_ROOT &&
    !filePath.startsWith(`${STATIC_ROOT}${path.sep}`)
  ) {
    sendBody(
      req,
      res,
      403,
      { "content-type": "text/plain; charset=utf-8" },
      "Forbidden",
    );
    return;
  }

  serveFile(req, res, filePath, { urlPath });
}

const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, "utf-8");
const appName = getAppName();

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = stripBasePath(url.pathname);

  if (pathname === "/" || pathname === "/manifest") {
    const platform = req.headers["expo-platform"];
    if (platform === "ios" || platform === "android") {
      return serveManifest(req, platform, res);
    }

    if (pathname === "/") {
      const staticLandingPath = path.join(STATIC_ROOT, "index.html");
      if (process.env.STATIC_LANDING === "true" && fs.existsSync(staticLandingPath)) {
        return serveFile(req, res, staticLandingPath, {
          urlPath: "index.html",
          cacheControl: "public, max-age=300, stale-while-revalidate=60",
        });
      }
      return serveLandingPage(req, res, landingPageTemplate, appName);
    }
  }

  serveStaticFile(req, res, pathname);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving static Expo build on port ${port}`);
});
