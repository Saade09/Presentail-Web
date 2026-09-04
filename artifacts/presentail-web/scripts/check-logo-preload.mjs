#!/usr/bin/env node
/**
 * Verifies logo preload generation against the built Vite manifest. Logo hints
 * are injected per request by serve.mjs, so index.html must not contain baked
 * cross-locale tags or the former client-side pruning script.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLocaleLogoPreloadTags } from "../logo-preloads.mjs";
import {
  LOGO_EN_WEBP_BASENAME,
  LOGO_AR_WEBP_BASENAME,
  LOGO_EN_WHITE_WEBP_BASENAME,
  LOGO_AR_WHITE_WEBP_BASENAME,
} from "../logo-assets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, "../dist/public");
const htmlPath = path.join(distDir, "index.html");
const manifestPath = path.join(distDir, ".vite/manifest.json");

if (!fs.existsSync(htmlPath) || !fs.existsSync(manifestPath)) {
  console.error("check-logo-preload: index.html and .vite/manifest.json are required.");
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, "utf8");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const findFile = (basename) =>
  Object.entries(manifest).find(([key]) => key.endsWith(basename))?.[1]?.file ??
  Object.values(manifest).find(
    (entry) => entry.file?.includes(basename.replace(".webp", "")) && entry.file.endsWith(".webp"),
  )?.file;

const expected = {
  en: [findFile(LOGO_EN_WEBP_BASENAME), findFile(LOGO_EN_WHITE_WEBP_BASENAME)],
  ar: [findFile(LOGO_AR_WEBP_BASENAME), findFile(LOGO_AR_WHITE_WEBP_BASENAME)],
};
if (Object.values(expected).flat().some((file) => !file)) {
  console.error("check-logo-preload: one or more logo variants are missing from the Vite manifest.");
  process.exit(1);
}

try {
  const enHome = buildLocaleLogoPreloadTags(manifest, "", "/en-lb/beirut");
  const arHome = buildLocaleLogoPreloadTags(manifest, "", "/ar-lb/beirut");
  const enCheckout = buildLocaleLogoPreloadTags(manifest, "", "/en-lb/beirut/checkout");
  const arCheckout = buildLocaleLogoPreloadTags(manifest, "", "/ar-lb/beirut/checkout");
  const [en, enWhite] = expected.en;
  const [ar, arWhite] = expected.ar;
  const valid =
    enHome.includes(en) && !enHome.includes(ar) && !enHome.includes(enWhite) &&
    arHome.includes(ar) && !arHome.includes(en) && !arHome.includes(arWhite) &&
    enCheckout.includes(en) && enCheckout.includes(enWhite) && !enCheckout.includes(ar) &&
    arCheckout.includes(ar) && arCheckout.includes(arWhite) && !arCheckout.includes(en) &&
    !html.includes("preload-logo-") && !html.includes("ids.forEach(function(id)");
  if (!valid) throw new Error("locale-specific preload output or static-shell guard failed");
} catch (err) {
  console.error(`check-logo-preload: FAIL — ${err.message}`);
  process.exit(1);
}

console.log("check-logo-preload: PASS — server-side output is locale-aware and index.html has no pruning script.");