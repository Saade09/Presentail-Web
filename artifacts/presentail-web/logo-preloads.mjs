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
export function buildLocaleLogoPreloadTags(
  manifest,
  basePath = "",
  pathname = "/",
  { highPriority = true } = {},
) {
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
    `<link rel="preload" as="image" type="image/webp" href="${base}/${normalEntry.file}"${highPriority ? ' fetchpriority="high"' : ""}>`,
  ];
  if (whiteEntry?.file) {
    tags.push(
      `<link rel="preload" as="image" type="image/webp" href="${base}/${whiteEntry.file}">`,
    );
  }
  return tags.join("\n    ");
}

const LINK_TAG_RE = /<link\b[^>]*>/gi;
const ATTR_RE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseLinkAttributes(tag) {
  const attrs = {};
  const body = tag.replace(/^<link\b/i, "").replace(/\/?>$/, "");
  for (const [, name, dq, sq, bare] of body.matchAll(ATTR_RE)) {
    const key = name.toLowerCase();
    if (!(key in attrs)) attrs[key] = dq ?? sq ?? bare ?? "";
  }
  return attrs;
}

/**
 * True when the HTML already carries a `<link rel="preload" as="image">` with
 * `fetchpriority="high"` (any attribute order, quoting or casing). Font/style
 * preloads and `<img fetchpriority="high">` elements do not count.
 */
export function hasHighPriorityImagePreload(html) {
  const source = String(html).replace(/<!--[\s\S]*?-->/g, "");
  for (const [tag] of source.matchAll(LINK_TAG_RE)) {
    const attrs = parseLinkAttributes(tag);
    const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
    if (
      rel.includes("preload") &&
      (attrs.as ?? "").trim().toLowerCase() === "image" &&
      (attrs.fetchpriority ?? "").trim().toLowerCase() === "high"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Insert the logo preload tags before `</head>`. When the page already has a
 * high-priority image preload (e.g. the product photo on a PDP, the real LCP
 * element), the logo is still preloaded but without `fetchpriority="high"` so
 * the two do not compete.
 */
export function injectLocaleLogoPreloads(html, manifest, basePath = "", pathname = "/") {
  const tags = buildLocaleLogoPreloadTags(manifest, basePath, pathname, {
    highPriority: !hasHighPriorityImagePreload(html),
  });
  return html.replace("</head>", `    ${tags}\n  </head>`);
}
