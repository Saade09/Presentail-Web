// Production static server with locale-aware SEO injection.
// Serves files from dist/public and, for any request that resolves to
// index.html (the SPA shell), injects locale-aware <title>, meta description,
// OG/Twitter, canonical and hreflang link tags based on the request URL.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { injectSeoTags } from "./seo-inject.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "dist/public");
const PORT = Number(process.env.PORT ?? 24188);
const BASE_PATH = (process.env.BASE_PATH ?? "/").replace(/\/$/, "");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function safeJoin(root, urlPath) {
  const resolved = path.resolve(root, "." + urlPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

const indexHtml = fs.readFileSync(path.join(DIST, "index.html"), "utf8");

const server = http.createServer((req, res) => {
  try {
    const proto =
      (req.headers["x-forwarded-proto"]?.toString().split(",")[0] ?? "http").trim();
    const host = req.headers["x-forwarded-host"]?.toString() ?? req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `${proto}://${host}`);
    const origin = `${proto}://${host}`;

    // Strip BASE_PATH prefix for both asset lookup and SEO parsing so
    // canonical/hreflang reflect the locale path, not the deploy prefix.
    let pathname = url.pathname;
    if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
      pathname = pathname.slice(BASE_PATH.length) || "/";
    }
    let assetPath = pathname;
    if (assetPath === "/") assetPath = "/index.html";

    const filePath = safeJoin(DIST, assetPath);
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      // index.html gets locale-aware SEO injection.
      if (ext === ".html") {
        const html = fs.readFileSync(filePath, "utf8");
        const out = injectSeoTags(html, pathname, { basePath: BASE_PATH, origin });
        res.writeHead(200, { "content-type": MIME[".html"] });
        res.end(out);
        return;
      }
      const stream = fs.createReadStream(filePath);
      res.writeHead(200, {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
      });
      stream.pipe(res);
      return;
    }

    // SPA fallback: rewrite to index.html with locale-aware SEO.
    const out = injectSeoTags(indexHtml, pathname, { basePath: BASE_PATH, origin });
    res.writeHead(200, { "content-type": MIME[".html"] });
    res.end(out);
  } catch (err) {
    console.error("serve error:", err);
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal Server Error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`presentail-web serving from ${DIST} on :${PORT}`);
});
