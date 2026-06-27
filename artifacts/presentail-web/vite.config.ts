import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
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
 */
function lazyChunkPreloadPlugin(outDir: string): Plugin {
  const ALWAYS_NEEDED_CHUNKS = new Set([
    "vendor-framer",
    "vendor-embla",
  ]);

  return {
    name: "presentail-lazy-chunk-preload",
    apply: "build",
    async closeBundle() {
      const htmlPath = path.join(outDir, "index.html");
      const manifestPath = path.join(outDir, ".vite", "manifest.json");
      if (!fs.existsSync(htmlPath) || !fs.existsSync(manifestPath)) return;

      type ManifestChunk = { file: string; name?: string; isEntry?: boolean };
      const manifest: Record<string, ManifestChunk> = JSON.parse(
        fs.readFileSync(manifestPath, "utf8"),
      );

      const preloadFiles: string[] = [];
      for (const chunk of Object.values(manifest)) {
        if (chunk.name && ALWAYS_NEEDED_CHUNKS.has(chunk.name) && chunk.file) {
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
        .map((f) => `  <link rel="modulepreload" href="/${f}" crossorigin>`)
        .join("\n");

      // Inject before the closing </head> tag so these hints ship in the
      // first HTML response alongside the entry modulepreload tags that Vite
      // already injects.
      const updated = html.replace("</head>", `${linkTags}\n</head>`);
      fs.writeFileSync(htmlPath, updated, "utf8");
      console.log(
        `[lazy-chunk-preload] Injected ${preloadFiles.length} modulepreload hint(s) for: ${preloadFiles.join(", ")}`,
      );
    },
  };
}

/**
 * Inline critical (above-the-fold) CSS and load the full stylesheet
 * non-blocking using Google's `critters` library. Runs only at build time so
 * it never slows down dev-server restarts.
 *
 * critters converts each <link rel="stylesheet"> into:
 *   1. A <style> block containing only the CSS rules needed for the initial
 *      viewport (inlined critical CSS — no network round-trip before first paint).
 *   2. A preload + onload swap pattern that fetches the full CSS asynchronously,
 *      eliminating it from the render-blocking critical path.
 *
 * Note: the chunk-budget check (scripts/check-chunk-budget.mjs) iterates only
 * over JS chunks from the Vite manifest — it never reads inline <style> blocks
 * or CSS files, so this transformation has no effect on that budget check.
 */
function criticalCssPlugin(outDir: string): Plugin {
  return {
    name: "presentail-critical-css",
    apply: "build",
    async closeBundle() {
      const htmlPath = path.join(outDir, "index.html");
      if (!fs.existsSync(htmlPath)) return;

      // Dynamically import critters so the import is resolved at build time.
      const { default: Critters } = await import("critters");
      const critters = new Critters({
        // "swap" converts <link rel="stylesheet"> to a preload+onload swap,
        // eliminating both CSS files from the render-blocking critical path.
        preload: "swap",
        // Keep the full CSS file on disk; only inline the critical subset.
        pruneSource: false,
        // Resolve relative asset URLs against the built output directory.
        path: outDir,
        // Log warnings but don't throw on missing selectors (e.g. dynamic classes).
        logLevel: "warn",
      });

      const html = fs.readFileSync(htmlPath, "utf8");
      const result = await critters.process(html);
      fs.writeFileSync(htmlPath, result, "utf8");
      console.log("[critical-css] Inlined critical CSS into index.html");
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
