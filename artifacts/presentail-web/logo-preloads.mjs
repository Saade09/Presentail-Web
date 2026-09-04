import {
  LOGO_EN_WEBP_BASENAME,
  LOGO_AR_WEBP_BASENAME,
  LOGO_EN_WHITE_WEBP_BASENAME,
  LOGO_AR_WHITE_WEBP_BASENAME,
} from "./logo-assets.mjs";

function findLogoEntry(manifest, basename) {
  return (
    Object.entries(manifest).find(([key]) => key.endsWith(basename))?.[1] ??
    Object.values(manifest).find(
      (entry) =>
        typeof entry.file === "string" &&
        entry.file.includes(basename.replace(".webp", "")) &&
        entry.file.endsWith(".webp"),
    )
  );
}

/**
 * Build image-preload tags for the logo variants used by one request. The
 * language comes from the URL before HTML is sent, so an unused locale's logo
 * never enters the preload scanner.
 */
export function buildLocaleLogoPreloadTags(manifest, basePath = "", pathname = "/") {
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const firstSegment = String(pathname).split("/").filter(Boolean)[0] || "";
  const isArabic = firstSegment === "ar" || firstSegment.startsWith("ar-");
  const isDarkRoute = /\/(?:checkout|order-confirmed)\/?$/.test(String(pathname));
  const normalEntry = findLogoEntry(
    manifest,
    isArabic ? LOGO_AR_WEBP_BASENAME : LOGO_EN_WEBP_BASENAME,
  );
  const whiteEntry = isDarkRoute
    ? findLogoEntry(
        manifest,
        isArabic ? LOGO_AR_WHITE_WEBP_BASENAME : LOGO_EN_WHITE_WEBP_BASENAME,
      )
    : null;

  if (!normalEntry?.file) {
    const basename = isArabic ? LOGO_AR_WEBP_BASENAME : LOGO_EN_WEBP_BASENAME;
    throw new Error(`[logo-preload] logo asset "${basename}" was not found in the Vite manifest.`);
  }

  const tags = [
    `<link rel="preload" as="image" type="image/webp" href="${base}/${normalEntry.file}" fetchpriority="high">`,
  ];
  if (whiteEntry?.file) {
    tags.push(
      `<link rel="preload" as="image" type="image/webp" href="${base}/${whiteEntry.file}">`,
    );
  }
  return tags.join("\n    ");
}
