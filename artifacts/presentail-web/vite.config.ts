import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
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
import { LOGO_EN_WEBP_BASENAME, LOGO_AR_WEBP_BASENAME, LOGO_EN_WHITE_WEBP_BASENAME, LOGO_AR_WHITE_WEBP_BASENAME } from "./logo-assets.mjs";

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
 * Inject <link rel="preload" as="image"> tags for both the English and Arabic
 * WebP logos into the built index.html. Reads the Vite manifest to resolve the
 * content-hashed asset filenames, then splices the tags into <head> right
 * before </head>. A tiny inline <script> immediately removes the unused tag
 * based on the URL's lang segment (URL pattern: /{lang}-{country}/{city}/...)
 * so neither locale incurs an extra network hit. Runs only at build time.
 *
 * Logo basenames are imported from logo-assets.mjs (the single source of
 * truth shared with scripts/check-logo-preload.mjs).
 */
function logoPreloadPlugin(outDir: string, basePath: string): Plugin {
  // Normalise basePath: strip trailing slash so we can append "/" + file safely.
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;

  return {
    name: "presentail-logo-preload",
    apply: "build",
    async closeBundle() {
      const htmlPath = path.join(outDir, "index.html");
      const manifestPath = path.join(outDir, ".vite", "manifest.json");
      if (!fs.existsSync(htmlPath) || !fs.existsSync(manifestPath)) return;

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<
        string,
        { file: string }
      >;

      /** Look up a logo by its source basename in the Vite manifest. */
      function findLogoEntry(basename: string) {
        return (
          Object.entries(manifest).find(([key]) => key.endsWith(basename))?.[1] ??
          Object.values(manifest).find(
            (entry) =>
              entry.file.includes(basename.replace(".webp", "")) &&
              entry.file.endsWith(".webp")
          )
        );
      }

      const enEntry = findLogoEntry(LOGO_EN_WEBP_BASENAME);
      const arEntry = findLogoEntry(LOGO_AR_WEBP_BASENAME);
      const enWhiteEntry = findLogoEntry(LOGO_EN_WHITE_WEBP_BASENAME);
      const arWhiteEntry = findLogoEntry(LOGO_AR_WHITE_WEBP_BASENAME);

      // Require at least the English logo; all others are best-effort.
      // Hard error instead of silent skip: if the EN logo is missing from the
      // manifest the preload would be silently omitted and LCP would regress
      // without any CI signal. Fail the build so the rename is caught early.
      if (!enEntry) {
        this.error(
          `[logo-preload] EN logo asset "${LOGO_EN_WEBP_BASENAME}" was not found in the Vite manifest. ` +
          `Update LOGO_EN_WEBP_BASENAME in artifacts/presentail-web/logo-assets.mjs to match the current source filename.`,
        );
      }

      const enHref = `${base}/${enEntry.file}`;
      const arHref = arEntry ? `${base}/${arEntry.file}` : null;
      const enWhiteHref = enWhiteEntry ? `${base}/${enWhiteEntry.file}` : null;
      const arWhiteHref = arWhiteEntry ? `${base}/${arWhiteEntry.file}` : null;

      // All four preload tags are emitted with IDs so the inline script can
      // remove the two that are not needed for the current locale.
      const enTag = `<link rel="preload" as="image" type="image/webp" href="${enHref}" id="preload-logo-en">`;
      const arTag = arHref
        ? `<link rel="preload" as="image" type="image/webp" href="${arHref}" id="preload-logo-ar">`
        : null;
      const enWhiteTag = enWhiteHref
        ? `<link rel="preload" as="image" type="image/webp" href="${enWhiteHref}" id="preload-logo-en-white">`
        : null;
      const arWhiteTag = arWhiteHref
        ? `<link rel="preload" as="image" type="image/webp" href="${arWhiteHref}" id="preload-logo-ar-white">`
        : null;

      // Inline script: strip the base path prefix, extract the first URL
      // segment, and remove whichever preload tags are not needed for the
      // current locale (both normal and white variants for the unused locale).
      // Additionally, the white-logo preloads are only useful on routes where
      // the inverse logo is above-the-fold (checkout, order-confirmed).  On
      // every other route the current-locale white tag is also pruned so we
      // never emit unnecessary preload hints.
      // The URL pattern is /{basePath}/{lang}-{country}/{city}/...
      // A segment starting with "ar-" means Arabic locale.
      const cleanBase = base || "";
      // Emit the pruning script whenever any preload tag exists (normal or white).
      const hasAnyTag = arTag || enWhiteTag || arWhiteTag;
      const localeScript = hasAnyTag
        ? `<script>(function(){var p=location.pathname.replace(/\\/+$/,"");${
            cleanBase ? `if(p.indexOf(${JSON.stringify(cleanBase)})===0)p=p.slice(${cleanBase.length});` : ""
          }var seg=(p.split("/").filter(Boolean)[0]||"");var isAr=seg.startsWith("ar-");var isDark=p.endsWith("/checkout")||p.endsWith("/order-confirmed");var ids=isAr?["preload-logo-en","preload-logo-en-white"]:["preload-logo-ar","preload-logo-ar-white"];if(!isDark)ids.push(isAr?"preload-logo-ar-white":"preload-logo-en-white");ids.forEach(function(id){var el=document.getElementById(id);if(el)el.parentNode.removeChild(el);});}());</script>`
        : null;

      const html = fs.readFileSync(htmlPath, "utf8");
      const injection = [enTag, arTag, enWhiteTag, arWhiteTag, localeScript]
        .filter(Boolean)
        .map((t) => `  ${t}`)
        .join("\n");
      const patched = html.replace("</head>", `${injection}\n  </head>`);
      if (patched === html) return; // guard: no </head> found
      fs.writeFileSync(htmlPath, patched, "utf8");
      console.log(`[logo-preload] Injected EN preload for ${enHref}`);
      if (arHref) console.log(`[logo-preload] Injected AR preload for ${arHref}`);
      if (enWhiteHref) console.log(`[logo-preload] Injected EN-white preload for ${enWhiteHref}`);
      if (arWhiteHref) console.log(`[logo-preload] Injected AR-white preload for ${arWhiteHref}`);
    },
  };
}

/**
 * After the Vite build, read the manifest and inject `<link rel="modulepreload">`
 * tags for named chunks that are lazy-loaded but will always be needed on the
 * first page view (HomepageHeader → vendor-framer, app-shared, etc.).
 *
 * Rationale: Vite only auto-injects modulepreload for *statically* imported
 * chunks. By making HomepageHeader and Footer lazy we removed vendor-framer
 * from the automatic preload list (which reduces the initial render-blocking
 * chain). But we still want those chunks to be fetched in parallel while the
 * entry JS is executing, not in a second waterfall after it runs. This plugin
 * bridges the gap: it adds explicit preloads for the most critical lazy chunks
 * so browsers can fetch them from the HTML without waiting for JS discovery.
 *
 * Matching strategy:
 *  - Named vendor chunks are matched by `chunk.name` (manualChunks key).
 *  - Page-level route chunks have Rollup-generated names that vary by build.
 *    They are matched by the manifest entry key (= the Vite source path, e.g.
 *    "src/pages/Home.tsx"), which is stable across builds.
 */
function lazyChunkPreloadPlugin(outDir: string): Plugin {
  const ALWAYS_NEEDED_CHUNK_NAMES = new Set([
    "vendor-framer",
    "vendor-embla",
  ]);

  // Page source paths (relative to the artifact root) for chunks that are
  // always needed on the first user-facing page view. Matched against the
  // manifest entry key so they are correctly identified regardless of the
  // Rollup-generated chunk name.
  const ALWAYS_NEEDED_SRCS = new Set([
    "src/pages/Home.tsx",
    "src/pages/Shop.tsx",
  ]);

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
        // Match vendor chunks by their manualChunks name.
        if (chunk.name && ALWAYS_NEEDED_CHUNK_NAMES.has(chunk.name)) {
          preloadFiles.push(chunk.file);
          continue;
        }
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

/**
 * Inject `<link rel="preconnect">` and `<link rel="dns-prefetch">` hints for
 * origins that are fetched unconditionally on the first page view, so the
 * browser can open the TCP/TLS connection while the entry JS is still executing.
 *
 * The most important origin is os.presentail.com — every page immediately
 * fetches product catalog data from it. Without a preconnect hint the browser
 * only discovers this origin after the JS bundle executes, adding a full
 * TCP+TLS round-trip (~100-300 ms on typical connections) to the critical path.
 */
function preconnectPlugin(outDir: string): Plugin {
  const PRECONNECT_ORIGINS = [
    // Product catalog API — fetched on every page view.
    "https://os.presentail.com",
  ];

  return {
    name: "presentail-preconnect",
    apply: "build",
    async closeBundle() {
      const htmlPath = path.join(outDir, "index.html");
      if (!fs.existsSync(htmlPath)) return;

      const html = fs.readFileSync(htmlPath, "utf8");

      // Build hint tags for each origin, skipping any already present.
      const tags: string[] = [];
      for (const origin of PRECONNECT_ORIGINS) {
        if (html.includes(origin)) continue; // already injected by another pass
        tags.push(`  <link rel="preconnect" href="${origin}" crossorigin>`);
        tags.push(`  <link rel="dns-prefetch" href="${origin}">`);
      }

      if (tags.length === 0) {
        console.log("[preconnect] All preconnect hints already present — skipping.");
        return;
      }

      // Inject as the very first children of <head> so the browser sees them
      // before any other resource hints or scripts.
      const patched = html.replace("<head>", `<head>\n${tags.join("\n")}`);
      if (patched === html) {
        console.warn("[preconnect] Could not find <head> tag — skipping preconnect injection.");
        return;
      }

      fs.writeFileSync(htmlPath, patched, "utf8");
      console.log(
        `[preconnect] Injected ${tags.length / 2} preconnect+dns-prefetch hint(s) for: ${PRECONNECT_ORIGINS.join(", ")}`,
      );
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

export default defineConfig(async ({ command }) => {
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
      runtimeErrorOverlay(),
      seoInjectPlugin(basePath),
      logoPreloadPlugin(path.resolve(import.meta.dirname, "dist/public"), basePath),
      preconnectPlugin(path.resolve(import.meta.dirname, "dist/public")),
      lazyChunkPreloadPlugin(path.resolve(import.meta.dirname, "dist/public")),
      criticalCssPlugin(path.resolve(import.meta.dirname, "dist/public")),
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
      modulePreload: { polyfill: true },
      // Never inline logo WebP files as base64 data URLs — they need to be
      // separate assets in the Vite manifest so logoPreloadPlugin can inject
      // <link rel="preload"> tags for all four variants (EN, AR, EN-white,
      // AR-white).  Without this, small logos (<4 kB default threshold) would
      // be inlined, skipped by the manifest lookup, and silently omitted from
      // the preload tags — causing a missed LCP hint for Arabic-white pages.
      assetsInlineLimit: (filePath: string) => {
        if (
          [
            LOGO_EN_WEBP_BASENAME,
            LOGO_AR_WEBP_BASENAME,
            LOGO_EN_WHITE_WEBP_BASENAME,
            LOGO_AR_WHITE_WEBP_BASENAME,
          ].some((basename) => filePath.endsWith(basename))
        ) {
          return 0; // force separate file — never inline
        }
        return 4096; // Vite default
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/@clerk/")) return "vendor-clerk";
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
