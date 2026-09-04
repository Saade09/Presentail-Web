import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { clarityPluginsForMode } from "./src/lib/clarityInjectPlugin";
import {
  LOGO_EN_WEBP_BASENAME,
  LOGO_AR_WEBP_BASENAME,
  LOGO_EN_WHITE_WEBP_BASENAME,
  LOGO_AR_WHITE_WEBP_BASENAME,
} from "./logo-assets.mjs";
// rollup-plugin-visualizer: opt-in only. Set VITE_VISUALIZE=1 before running
// `pnpm --filter @workspace/presentail-web run build` to emit dist/stats.html
// for bundle composition auditing. Never runs during normal CI builds.
// @ts-expect-error - plain ESM module (no bundled types)
const visualizer = process.env.VITE_VISUALIZE
  ? await import("rollup-plugin-visualizer").then((m) => m.visualizer({ filename: "dist/stats.html", open: false, gzipSize: true, brotliSize: true }))
  : null;
// @ts-expect-error - plain ESM module (no types).
import { injectSeoTagsAsync } from "./seo-inject.mjs";
// @ts-expect-error - plain ESM module (no types).
import { getMarkdownForPath, isMirroredPath } from "./markdown.mjs";

/**
 * Dev-server middleware plugin that serves Markdown mirror pages at `<path>.md`
 * and via `Accept: text/markdown` content negotiation, exactly matching what
 * serve.mjs does in production. Runs only in dev mode (`apply: "serve"`).
 *
 * Also injects `Link: rel="alternate"` response headers for mirrored HTML
 * paths so the test suite can verify content-negotiation support without a
 * production build.
 */
function markdownMirrorDevPlugin(basePath: string): Plugin {
  const apiBaseUrl =
    process.env.INTERNAL_API_BASE_URL ?? "http://localhost:80";

  async function fetchJson(url: string): Promise<unknown> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function acceptsMarkdownPreferred(acceptHeader: string | undefined): boolean {
    if (!acceptHeader) return false;
    let mdQ = 0;
    let htmlQ = -1;
    let starQ = -1;
    for (const part of acceptHeader.split(",")) {
      const [typeRaw, ...params] = part.trim().split(";");
      const type = typeRaw.trim().toLowerCase();
      let q = 1;
      for (const p of params) {
        const m = p.trim().match(/^q\s*=\s*([01](?:\.\d{0,3})?)/i);
        if (m) { q = parseFloat(m[1]); break; }
      }
      if (type === "text/markdown") mdQ = q;
      else if (type === "text/html") htmlQ = q;
      else if (type === "*/*") starQ = q;
    }
    const effectiveHtml = htmlQ >= 0 ? htmlQ : (starQ >= 0 ? starQ : 0);
    return mdQ > 0 && mdQ > effectiveHtml;
  }

  return {
    name: "presentail-markdown-mirror-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: () => void) => {
        const rawUrl = req.url ?? "/";
        const qIdx = rawUrl.indexOf("?");
        let pathname = qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl;

        const cleanBase = (basePath ?? "").replace(/\/$/, "");
        if (cleanBase && pathname.startsWith(cleanBase)) {
          pathname = pathname.slice(cleanBase.length) || "/";
        }

        const origin = `http://${req.headers.host ?? "localhost"}`;

        // Handle /sitemap.md
        if (pathname === "/sitemap.md") {
          try {
            const { buildSitemapMd } = await import("./markdown.mjs" as string) as any;
            const [catalogData, brandsData] = await Promise.all([
              fetchJson(`${apiBaseUrl}/api/catalog/metadata`),
              fetchJson(`${apiBaseUrl}/api/woo/brands`),
            ]) as any[];
            const content = buildSitemapMd({
              origin,
              basePath: cleanBase,
              categories: catalogData?.categories ?? [],
              occasions: catalogData?.occasions ?? [],
              brands: Array.isArray(brandsData) ? brandsData : (brandsData?.brands ?? []),
              products: [],
            });
            res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" });
            res.end(content);
          } catch {
            res.writeHead(500, { "content-type": "text/plain" });
            res.end("Error building sitemap.md");
          }
          return;
        }

        // Handle <path>.md requests
        if (pathname.endsWith(".md")) {
          const htmlPath = pathname.slice(0, -3);
          const mirrorable = isMirroredPath(htmlPath);
          if (!mirrorable) {
            res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" });
            res.end("Not Found");
            return;
          }
          try {
            const content = await getMarkdownForPath(htmlPath, {
              origin,
              basePath: cleanBase,
              fetchJson,
              apiBaseUrl,
            });
            if (!content) {
              res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" });
              res.end("Not Found");
              return;
            }
            res.writeHead(200, {
              "content-type": "text/markdown; charset=utf-8",
              "cache-control": "no-store",
              "link": `<${origin}${cleanBase}${htmlPath}>; rel="canonical"; type="text/html"`,
            });
            res.end(content);
          } catch {
            res.writeHead(500, { "content-type": "text/plain" });
            res.end("Error building markdown");
          }
          return;
        }

        // For Accept: text/markdown content negotiation on HTML paths
        if (acceptsMarkdownPreferred(req.headers.accept as string | undefined)) {
          const mirrorable = isMirroredPath(pathname);
          if (mirrorable) {
            try {
              const content = await getMarkdownForPath(pathname, {
                origin,
                basePath: cleanBase,
                fetchJson,
                apiBaseUrl,
              });
              if (content) {
                res.writeHead(200, {
                  "content-type": "text/markdown; charset=utf-8",
                  "cache-control": "no-store",
                  "link": `<${origin}${cleanBase}${pathname}>; rel="canonical"; type="text/html"`,
                });
                res.end(content);
                return;
              }
            } catch { /* fall through */ }
          }
        }

        // For mirrored HTML paths, inject Link: rel="alternate" response header.
        // This is independent of the <link> tag injection done in transformIndexHtml.
        if (!pathname.endsWith(".md") && pathname !== "/sitemap.md" && isMirroredPath(pathname)) {
          const mdHref = `${origin}${cleanBase}${pathname}.md`;
          const origSetHeader = res.setHeader.bind(res);
          const extraLink = `<${mdHref}>; rel="alternate"; type="text/markdown"`;
          // Append to any existing Link header once the first setHeader("link",...) fires.
          let injected = false;
          (res as any).setHeader = function(name: string, value: string | string[]) {
            if (!injected && name.toLowerCase() === "link") {
              injected = true;
              (res as any).setHeader = origSetHeader;
              const existing = Array.isArray(value) ? value.join(", ") : value;
              return origSetHeader(name, `${existing}, ${extraLink}`);
            }
            return origSetHeader(name, value);
          };
          // If Vite never sets a Link header, inject it via writeHead.
          const origWriteHead = res.writeHead.bind(res);
          (res as any).writeHead = function(statusCode: number, headersArg?: Record<string, string | string[]> | string) {
            (res as any).writeHead = origWriteHead;
            (res as any).setHeader = origSetHeader;
            if (!injected && typeof headersArg === "object" && headersArg) {
              injected = true;
              const lc = Object.keys(headersArg).find((k) => k.toLowerCase() === "link");
              const existing = lc ? headersArg[lc] : "";
              const merged = existing ? `${existing}, ${extraLink}` : extraLink;
              return origWriteHead(statusCode, { ...headersArg, link: merged });
            }
            if (!injected) {
              injected = true;
              return origWriteHead(statusCode, { ...(typeof headersArg === "object" && headersArg ? headersArg : {}), link: extraLink });
            }
            return origWriteHead(statusCode, headersArg as Record<string, string | string[]>);
          };
        }

        next();
      });
    },
    // Inject <link rel="alternate" type="text/markdown"> into HTML head for
    // all mirrored paths, matching what serve.mjs does in production.
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const rawUrl = ctx.originalUrl ?? ctx.path ?? "/";
        const qIdx = rawUrl.indexOf("?");
        let pathname = qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl;
        const cleanBase = (basePath ?? "").replace(/\/$/, "");
        if (cleanBase && pathname.startsWith(cleanBase)) {
          pathname = pathname.slice(cleanBase.length) || "/";
        }
        if (!isMirroredPath(pathname)) return html;
        const mdHref = `${cleanBase}${pathname}.md`;
        return html.replace(
          "</head>",
          `    <link rel="alternate" type="text/markdown" href="${mdHref.replace(/"/g, "&quot;")}">\n  </head>`,
        );
      },
    },
  };
}

/**
 * Inject locale-aware SEO tags (title, meta description, OG, hreflang,
 * canonical) into the served index.html so they're present in the initial
 * HTML for crawlers viewing source on /{lang}-{country}/{city}/... URLs.
 */
function seoInjectPlugin(basePath: string): Plugin {
  // In dev, fetch per-product OG data through the shared Replit proxy. The API
  // server is mounted on /api so the same localhost:80 base works for both.
  const apiBaseUrl =
    process.env.INTERNAL_API_BASE_URL ?? "http://localhost:80";
  return {
    name: "presentail-seo-inject",
    // IMPORTANT: only run during the dev server. At build time `ctx.originalUrl`
    // is always "/" with no real request context, so injecting here would bake a
    // relative canonical (`href="/"`) and stale generic title into the static
    // index.html. The Node serve script (serve.mjs) re-runs the same injector
    // per-request with the real origin, which is the only output crawlers see in
    // production — running here too produces duplicate <link rel="canonical"> tags
    // (Lighthouse picks the first, relative one and rejects it).
    apply: "serve",
    transformIndexHtml: {
      order: "post",
      async handler(html, ctx) {
        // ctx.originalUrl is the full request URL including the base prefix.
        const reqUrl = ctx.originalUrl ?? ctx.path ?? "/";
        const cleanBase = basePath.replace(/\/$/, "");
        const hashIdx = reqUrl.indexOf("#");
        const noHash = hashIdx >= 0 ? reqUrl.slice(0, hashIdx) : reqUrl;
        const qIdx = noHash.indexOf("?");
        let pathname = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;
        const search = qIdx >= 0 ? noHash.slice(qIdx) : "";
        if (cleanBase && pathname.startsWith(cleanBase)) {
          pathname = pathname.slice(cleanBase.length) || "/";
        }
        return injectSeoTagsAsync(html, pathname, {
          basePath: cleanBase,
          apiBaseUrl,
          search,
        });
      },
    },
  };
}

/**
 * After the Vite build, read the manifest and inject `<link rel="modulepreload">`
 * tags for named chunks that are lazy-loaded but will always be needed on the
 * first page view.
 *
 * Rationale: Vite only auto-injects modulepreload for *statically* imported
 * chunks. Route-level pages are lazy, so without an explicit hint the browser
 * discovers Home/Shop only after the entry JS executes (a second waterfall).
 * This plugin adds explicit preloads for exactly the page chunks that render
 * the typical entry route (Home, Shop) — and nothing else. Preload hints for
 * chunks that don't paint the current page (cart, checkout, payment, vendor
 * extras) compete with the LCP resource for bandwidth, so they are
 * intentionally excluded.
 *
 * Matching strategy: page-level route chunks have Rollup-generated names that
 * vary by build, so they are matched by the manifest entry key (= the Vite
 * source path, e.g. "src/pages/Home.tsx"), which is stable across builds.
 */
function lazyChunkPreloadPlugin(outDir: string): Plugin {
  // Page source paths (relative to the artifact root) for chunks that are
  // always needed on the first user-facing page view. Matched against the
  // manifest entry key so they are correctly identified regardless of the
  // Rollup-generated chunk name.
  // Route-specific preloads are now injected per-request by serve.mjs
  // (injectPageChunkPreload) so only the chunk for the current route fires,
  // rather than preloading Home + Shop on every route regardless of which
  // page the visitor is actually viewing. Keep the set empty so the plugin
  // silently no-ops at build time.
  const ALWAYS_NEEDED_SRCS = new Set<string>([]);

  return {
    name: "presentail-lazy-chunk-preload",
    apply: "build",
    async closeBundle() {
      const htmlPath = path.join(outDir, "index.html");
      const manifestPath = path.join(outDir, ".vite", "manifest.json");
      if (!fs.existsSync(htmlPath) || !fs.existsSync(manifestPath)) return;

      type ManifestChunk = { file: string; name?: string; src?: string; isEntry?: boolean };
      const manifest: Record<string, ManifestChunk> = JSON.parse(
        fs.readFileSync(manifestPath, "utf8"),
      );

      const preloadFiles: string[] = [];
      for (const [key, chunk] of Object.entries(manifest)) {
        if (!chunk.file) continue;
        // Match page-level route chunks by their source path (manifest key).
        // The key is the Vite source path relative to the project root, e.g.
        // "src/pages/Home.tsx". Normalise to forward slashes for cross-platform.
        const normKey = key.replace(/\\/g, "/");
        if (ALWAYS_NEEDED_SRCS.has(normKey)) {
          preloadFiles.push(chunk.file);
        }
      }

      if (preloadFiles.length === 0) return;

      const html = fs.readFileSync(htmlPath, "utf8");

      // Only inject hints for chunks Vite did NOT already preload so we never
      // emit a duplicate <link> in the built HTML.
      const newFiles = preloadFiles.filter((f) => !html.includes(`/${f}"`));
      if (newFiles.length === 0) {
        console.log(
          "[lazy-chunk-preload] All target chunks already have modulepreload hints from Vite — skipping.",
        );
        return;
      }

      const linkTags = newFiles
        .map((f) => `  <link rel="modulepreload" href="/${f}" crossorigin fetchpriority="low">`)
        .join("\n");

      // Inject before the closing </head> tag so these hints ship in the
      // first HTML response alongside the entry modulepreload tags that Vite
      // already injects.
      const updated = html.replace("</head>", `${linkTags}\n</head>`);
      fs.writeFileSync(htmlPath, updated, "utf8");
      console.log(
        `[lazy-chunk-preload] Injected ${newFiles.length} modulepreload hint(s) for: ${newFiles.join(", ")}`,
      );
    },
  };
}



// NOTE: font preloads are intentionally NOT injected at build time. serve.mjs
// injects them per-request so the font set can be filtered by the active
// language (Arabic woff2 files only on /ar-* routes). Injecting here too would
// duplicate every font hint in the served <head> and preload Arabic fonts on
// English pages.

/**
 * After the Vite build, scan the built index.html for any unsubstituted
 * %VITE_*% env placeholders and fail the build if any remain.  This turns a
 * silent misconfiguration (missing production env var) into a loud CI failure
 * so placeholder strings can never reach production and break tracking scripts.
 *
 * Caveat: the check runs BEFORE logoPreloadPlugin / fontPreloadPlugin inject
 * their tags, so if those plugins ever introduce a %VITE_*% pattern the order
 * would need adjusting.  For current usage (gtag IDs only) this is fine.
 */
function envPlaceholderGuardPlugin(outDir: string): Plugin {
  return {
    name: "presentail-env-placeholder-guard",
    apply: "build",
    // Run in writeBundle (after all other closeBundle transforms) so we check
    // the final written file, not an intermediate in-memory copy.
    writeBundle() {
      const htmlPath = path.join(outDir, "index.html");
      if (!fs.existsSync(htmlPath)) return;
      const html = fs.readFileSync(htmlPath, "utf8");
      const remaining = [...html.matchAll(/%VITE_[A-Z0-9_]+%/g)].map((m) => m[0]);
      if (remaining.length > 0) {
        const unique = [...new Set(remaining)];
        throw new Error(
          `[env-placeholder-guard] Build failed: ${unique.length} unsubstituted env placeholder(s) remain in index.html.\n` +
          unique.map((p) => `  ${p}  →  set ${p.replace(/%/g, "")} in your Replit environment secrets`).join("\n") +
          "\nSet these variables before publishing so tracking scripts receive real IDs.",
        );
      }
      console.log("[env-placeholder-guard] All %VITE_*% placeholders substituted ✓");
    },
  };
}

/**
 * Convert every hashed CSS asset link in the built index.html from a
 * render-blocking <link rel="stylesheet"> into the LoadCSS preload+swap
 * pattern, eliminating the CSS file from the render-blocking critical path.
 *
 * Each matching tag is replaced with:
 *   <link rel="preload" as="style" href="..." onload="this.onload=null;this.rel='stylesheet'">
 *   <noscript><link rel="stylesheet" href="..."></noscript>
 *
 * This achieves the same outcome critters was supposed to produce but does so
 * with a simple string transform that works reliably on the SPA shell produced
 * by Vite (critters was silently a no-op because the SPA shell has no visible
 * content for its JSDOM renderer to identify as "critical").
 *
 * A build-time assertion at the end confirms the transformation happened so a
 * regression is caught immediately in CI rather than silently reaching prod.
 *
 * Note: the chunk-budget check (scripts/check-chunk-budget.mjs) iterates only
 * over JS chunks from the Vite manifest — CSS files are not affected.
 */
function criticalCssPlugin(outDir: string): Plugin {
  return {
    name: "presentail-critical-css",
    apply: "build",
    closeBundle() {
      const htmlPath = path.join(outDir, "index.html");
      if (!fs.existsSync(htmlPath)) return;

      const html = fs.readFileSync(htmlPath, "utf8");

      // Match hashed CSS asset links emitted by Vite, e.g.:
      //   <link rel="stylesheet" crossorigin href="/assets/index-xxx.css">
      //   <link rel="stylesheet" href="/assets/index-xxx.css">
      // Vite always emits href with a leading "/" under the base path. The regex
      // captures the href value and any extra attributes so they can be preserved
      // on the replacement tags.
      //
      // Two patterns cover both attribute orderings Vite may produce:
      //   Pattern 1: rel="stylesheet" ... href="..."   (rel before href)
      //   Pattern 2: href="..."       ... rel="stylesheet" (href before rel)
      const CSS_HREF_PAT = `"(/[^"]+\\.css[^"]*)"`;
      const STYLESHEET_RE =
        new RegExp(`<link([^>]*)\\srel="stylesheet"([^>]*)\\shref=${CSS_HREF_PAT}([^>]*)>`, "g");

      let replaced = 0;

      function makePreload(href: string, ...attrFragments: string[]): string {
        // Strip rel/as from captured attribute fragments to avoid duplicates.
        const extra = attrFragments
          .join(" ")
          .replace(/\s*rel="[^"]*"/g, "")
          .replace(/\s*as="[^"]*"/g, "")
          .trim();
        const extraAttr = extra ? ` ${extra}` : "";
        replaced++;
        return (
          `<link rel="preload" as="style" href="${href}"${extraAttr} onload="this.onload=null;this.rel='stylesheet'">` +
          `<noscript><link rel="stylesheet" href="${href}"${extraAttr}></noscript>`
        );
      }

      const result = html.replace(
        STYLESHEET_RE,
        (_match, before: string, between: string, href: string, after: string) =>
          makePreload(href, before, between, after),
      );

      // Also handle the alternate attribute order: href before rel
      const STYLESHEET_RE2 =
        new RegExp(`<link([^>]*)\\shref=${CSS_HREF_PAT}([^>]*)\\srel="stylesheet"([^>]*)>`, "g");

      const result2 = result.replace(
        STYLESHEET_RE2,
        (_match, before: string, href: string, between: string, after: string) =>
          makePreload(href, before, between, after),
      );

      fs.writeFileSync(htmlPath, result2, "utf8");

      // Build-time assertion: no plain stylesheet link to a hashed CSS asset must remain
      // outside of <noscript> fallbacks. Strip <noscript>...</noscript> blocks first so
      // the intentional fallback links we just inserted don't trigger a false positive.
      const withoutNoscript = result2.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
      const remaining = withoutNoscript.match(/<link[^>]+rel="stylesheet"[^>]+href="\/[^"]+\.css|<link[^>]+href="\/[^"]+\.css[^>]+rel="stylesheet"/g);
      if (remaining && remaining.length > 0) {
        throw new Error(
          `[critical-css] Build assertion failed: ${remaining.length} render-blocking stylesheet link(s) remain in index.html after transform.\n` +
          remaining.map((t) => `  ${t}`).join("\n"),
        );
      }

      if (replaced === 0) {
        // Warn but don't fail — Vite may have emitted no CSS chunks (e.g. empty build).
        console.warn("[critical-css] No hashed CSS stylesheet links found in index.html; nothing to transform.");
      } else {
        console.log(`[critical-css] Converted ${replaced} stylesheet link(s) to non-blocking preload in index.html`);
      }
    },
  };
}

export default defineConfig(async ({ command, mode }) => {
  // BASE_PATH defaults to "/" so bare `vite build` works without wrapper env vars.
  const basePath = process.env.BASE_PATH ?? "/";

  // PORT is only required for the dev server — build doesn't bind a port.
  let port: number | undefined;
  if (command === "serve") {
    const rawPort = process.env.PORT;
    if (!rawPort) {
      throw new Error(
        "PORT environment variable is required but was not provided.",
      );
    }
    port = Number(rawPort);
    if (Number.isNaN(port) || port <= 0) {
      throw new Error(`Invalid PORT value: "${rawPort}"`);
    }
  }

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      ...(command === "serve" ? [runtimeErrorOverlay()] : []),
      markdownMirrorDevPlugin(basePath),
      seoInjectPlugin(basePath),
      lazyChunkPreloadPlugin(path.resolve(import.meta.dirname, "dist/public")),
      criticalCssPlugin(path.resolve(import.meta.dirname, "dist/public")),
      envPlaceholderGuardPlugin(path.resolve(import.meta.dirname, "dist/public")),
      ...clarityPluginsForMode(mode),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
      ...(visualizer ? [visualizer] : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      cssCodeSplit: true,
      minify: "esbuild",
      manifest: true,
      sourcemap: false,
      modulePreload: { polyfill: true },
      // Never inline logo WebP files as base64 data URLs — they need to be
      // separate assets in the Vite manifest so logoPreloadPlugin can inject
      // <link rel="preload"> tags for all four variants (EN, AR, EN-white,
      // AR-white).  Without this, small logos (<4 kB default threshold) would
      // be inlined, skipped by the manifest lookup, and silently omitted from
      // the preload tags — causing a missed LCP hint for Arabic-white pages.
      //
      // NOTE: In Vite 6+ the function variant of assetsInlineLimit must return
      // boolean | undefined, NOT a number.  Returning a number is coerced to a
      // boolean, so `return 4096` would be truthy → always inline, bloating the
      // CSS with base64-encoded fonts.  Use `return false` to force a separate
      // file and `return undefined` to fall back to Vite's default 4 kB check.
      assetsInlineLimit: (filePath: string) => {
        if (
          [
            LOGO_EN_WEBP_BASENAME,
            LOGO_AR_WEBP_BASENAME,
            LOGO_EN_WHITE_WEBP_BASENAME,
            LOGO_AR_WHITE_WEBP_BASENAME,
          ].some((basename) => filePath.endsWith(basename))
        ) {
          return false; // force separate file — never inline logos
        }
        return undefined; // fall back to Vite's default 4 kB threshold
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes("node_modules/@tanstack/react-query-persist-client") ||
              id.includes("node_modules/@tanstack/query-async-storage-persister") ||
              id.includes("node_modules/idb-keyval/")
            )
              return "vendor-query-persist";
            if (
              id.includes("node_modules/@tanstack/react-query") ||
              id.includes("node_modules/react-query")
            )
              return "vendor-query";
            if (
              id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/scheduler/")
            )
              return "vendor-react";
            if (id.includes("node_modules/framer-motion/"))
              return "vendor-framer";
            if (id.includes("node_modules/lucide-react/"))
              return "vendor-lucide";
            if (id.includes("node_modules/@radix-ui/"))
              return "vendor-radix";
            if (
              id.includes("node_modules/embla-carousel") ||
              id.includes("node_modules/embla-carousel-react")
            )
              return "vendor-embla";
            if (
              id.includes("node_modules/recharts/") ||
              id.includes("node_modules/victory-vendor/")
            )
              return "vendor-recharts";
            // QR code library is only used in Cart.tsx (on-demand) — split it
            // so it never lands in the eagerly-evaluated instant vendor chunk.
            if (id.includes("node_modules/qrcode.react/")) return "vendor-qrcode";
            // Phone input libraries are loaded lazily via LazyWebPhoneField
            // (React.lazy + dynamic import). Give them a dedicated chunk so they
            // never get folded into the statically-evaluated vendor catch-all.
            // NOTE: country-flag-icons is intentionally excluded here — it is
            // used by CountryFlag.tsx which is imported by always-loaded
            // components (TopUtilityBar, LocationPicker, Landing), so it must
            // be allowed in the instant bundle.  Only the heavy phone-parsing
            // libraries belong in the lazy-only vendor-phone chunk.
            if (
              id.includes("node_modules/react-phone-number-input/") ||
              id.includes("node_modules/libphonenumber-js/")
            )
              return "vendor-phone";
            // Stripe libraries are loaded lazily (StripeCheckoutSection is a
            // React.lazy import; @stripe/stripe-js is a dynamic import inside
            // getStripePromise). Give them a dedicated chunk so they never get
            // folded into the statically-evaluated instant vendor catch-all.
            if (
              id.includes("node_modules/@stripe/") ||
              id.includes("node_modules/stripe/")
            )
              return "vendor-stripe";
            // cmdk is only reachable via the lazy SearchOverlay chunk
            // (LazySearchOverlay → React.lazy → SearchOverlay → cmdk).
            // Without this rule the vendor catch-all below grabs it and folds
            // it into the eagerly-evaluated instant vendor bundle, negating the
            // entire point of the lazy wrapper. Giving it a dedicated chunk
            // keeps it out of the critical path — it only loads when the user
            // first opens search.
            if (id.includes("node_modules/cmdk/")) return "vendor-cmdk";
            if (id.includes("node_modules/")) return "vendor";

            // Collapse small app-level shared components into a single chunk so
            // they are fetched in one request instead of 10+ tiny parallel ones.
            // This eliminates the 3rd-waterfall level Lighthouse flags as a
            // ~4 s delay: lazy page chunk loads → discovers shared deps → 3rd fetch.
            // ProductCard imports framer-motion and is only used by lazy pages,
            // so keeping it here would pull vendor-framer into the static preload
            // chain via app-shared → ProductCard → framer-motion.  Leave it out
            // so the vendor-framer chunk is only fetched when a lazy page chunk
            // that uses ProductCard is actually executed.
            // Only include pure UI primitives here. Business components that
            // import from contexts (AuthContext, LocaleContext, etc.) must NOT
            // be listed — they would pull those context modules into app-shared,
            // forcing the entry bundle to statically depend on app-shared and
            // adding ~40 kB to every page's startup cost.
            const APP_SHARED_BASENAMES = new Set([
              "dialog", "input", "label", "select", "textarea", "useNow",
            ]);
            // ui/skeleton is the only ui component the skeleton fallbacks import
            // statically (skeletons are imported by App.tsx as Suspense fallbacks).
            // Keeping skeleton in app-shared would drag the entire 40+ kB chunk
            // into the entry's static modulepreload graph.  Give it its own tiny
            // chunk so the rest of app-shared can be deferred.
            //
            // ui/tooltip (TooltipProvider) is imported statically by App.tsx as a
            // top-level context provider.  Keeping it in app-shared would drag the
            // entire 40+ kB chunk into the entry's static modulepreload graph.
            // It is tiny (~32 lines) so let it fall through into the entry bundle.
            if (id.endsWith("/src/components/ui/skeleton.tsx")) return "ui-skeleton";
            if (id.endsWith("/src/components/ui/tooltip.tsx")) return undefined;
            // chart.tsx (recharts) is only used in the admin/debug funnel dashboard —
            // exclude it from app-shared so recharts stays out of the entry preload
            // graph. It falls into the route chunk that actually imports it.
            if (id.endsWith("/src/components/ui/chart.tsx")) return undefined;
            if (id.includes("/src/components/ui/")) return "app-shared";
            const base = path.basename(id, path.extname(id));
            if (APP_SHARED_BASENAMES.has(base)) return "app-shared";
          },
        },
      },
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
