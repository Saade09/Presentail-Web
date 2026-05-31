import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
// @ts-expect-error - plain ESM module (no types).
import { injectSeoTagsAsync } from "./seo-inject.mjs";

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
