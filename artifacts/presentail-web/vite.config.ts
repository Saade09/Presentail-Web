import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
// @ts-expect-error - plain ESM module (no types).
import { injectSeoTags } from "./seo-inject.mjs";

/**
 * Inject locale-aware SEO tags (title, meta description, OG, hreflang,
 * canonical) into the served index.html so they're present in the initial
 * HTML for crawlers viewing source on /{lang}-{country}/{city}/... URLs.
 */
function seoInjectPlugin(basePath: string): Plugin {
  return {
    name: "presentail-seo-inject",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        // ctx.originalUrl is the full request URL including the base prefix.
        const reqUrl = ctx.originalUrl ?? ctx.path ?? "/";
        const cleanBase = basePath.replace(/\/$/, "");
        let pathname = reqUrl.split("?")[0].split("#")[0];
        if (cleanBase && pathname.startsWith(cleanBase)) {
          pathname = pathname.slice(cleanBase.length) || "/";
        }
        return injectSeoTags(html, pathname, { basePath: cleanBase });
      },
    },
  };
}

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
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
});
