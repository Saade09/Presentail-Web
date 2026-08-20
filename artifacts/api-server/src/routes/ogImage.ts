/**
 * GET /api/og-image/product/:slug
 * GET /api/og-image/occasion/:slug
 *
 * On-demand 1200×630 JPEG generator for per-product and per-occasion Open
 * Graph share images. Product cards use an ivory Presentail template and
 * unaltered catalog photography; brand and occasion cards retain their
 * existing visual contract.
 *
 * Images are generated with `sharp` on the first request and cached
 * in-process for 1 hour. WhatsApp / iMessage / Slack crawlers retry
 * aggressively, so the in-memory cache prevents repeated upstream fetches
 * for the same product.
 *
 * Product cold-cache/unknown/image failures return a generic JPEG so crawlers
 * never cache a broken image response.
 *
 * Output: image/jpeg, Cache-Control: public, max-age=3600.
 * Budget: target ≤ 300 kB (JPEG q=80 with mozjpeg; consistent with the
 * check-public-image-budget constraint on the web artifact's static images).
 */

import { Router } from "express";
import sharp from "sharp";
import {
  getOsProductBySlug,
  getOsOccasions,
  getOsBrands,
} from "../lib/osProductsCache";
import {
  buildProductSocialVersion,
  renderProductSocialCard,
  selectProductSocialImage,
} from "../lib/productSocialShare";
import {
  getProductSocialShare,
  rowToProductSocialOverrides,
  upsertProductSocialShare,
} from "../lib/productSocialShareStore";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();

// ── Dimensions ────────────────────────────────────────────────────────────
const W = 1200;
const H = 630;

// Width of the photo panel on the left side of the card.
const PHOTO_W = 560;

// ── Brand colours ─────────────────────────────────────────────────────────
const BG = "#1a2e1e";
const GOLD = "#c9a96e";
const WHITE = "#ffffff";
const CREAM = "#f5ede0";

// ── Caching ───────────────────────────────────────────────────────────────
const OG_CACHE_TTL_MS = 60 * 60 * 1_000; // 1 h

type CacheEntry = { buffer: Buffer; generatedAt: number };
const ogCache = new Map<string, CacheEntry>();

/** Clear every cached variation for a product after an OS webhook or admin edit. */
export function invalidateProductSocialCardCache(slug: string): void {
  for (const key of ogCache.keys()) {
    if (key.startsWith(`product:${slug}:`)) ogCache.delete(key);
  }
}

/** Catalog-wide changes may affect selected photos without a per-product id. */
export function invalidateAllProductSocialCardCache(): void {
  for (const key of ogCache.keys()) {
    if (key.startsWith("product:")) ogCache.delete(key);
  }
}

function getCached(key: string): Buffer | null {
  const entry = ogCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.generatedAt > OG_CACHE_TTL_MS) {
    ogCache.delete(key);
    return null;
  }
  return entry.buffer;
}

function setCached(key: string, buffer: Buffer): void {
  // Evict oldest entry when the map gets large (>500 items).
  if (ogCache.size >= 500) {
    const oldest = ogCache.keys().next().value;
    if (oldest !== undefined) ogCache.delete(oldest);
  }
  ogCache.set(key, { buffer, generatedAt: Date.now() });
}

// ── Image fetch ───────────────────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 5_000;

/**
 * Hostnames from which it is safe to fetch entity photos AND attach the OS
 * API key. This list covers the Presentail OS API itself and any CDN/storage
 * origins it serves images from. Extend when new origins are added.
 *
 * A URL whose hostname does NOT appear here is still fetched (so public CDN
 * images work), but the API key is never sent to untrusted hosts.
 */
const TRUSTED_IMAGE_HOSTNAMES = new Set<string>([
  "os.presentail.com",
  "storage.presentail.com",
  "cdn.presentail.com",
  "api.presentail.com",
]);

function isTrustedImageHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only trust HTTPS origins. Never attach credentials to plain HTTP.
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (TRUSTED_IMAGE_HOSTNAMES.has(host)) return true;
    // Also accept any subdomain of presentail.com (e.g. assets.os.presentail.com).
    if (host.endsWith(".presentail.com")) return true;
    return false;
  } catch {
    return false;
  }
}

async function fetchImageBuffer(
  url: string,
  options: { includeTrustedApiKey?: boolean } = {},
): Promise<Buffer | null> {
  if (!url) return null;
  const apiKey = process.env.PRESENTAIL_OS_API_KEY ?? "";
  // Only attach the API key for trusted Presentail-owned origins to prevent
  // accidental credential forwarding / SSRF if a catalog entry ever contains
  // an attacker-controlled image URL.
  const trusted = isTrustedImageHost(url);
  const headers: Record<string, string> =
    options.includeTrustedApiKey !== false && apiKey && trusted ? { "x-api-key": apiKey } : {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchProductSocialSource(url: string): Promise<Buffer | null> {
  if (url.startsWith("/objects/")) {
    try {
      const file = await new ObjectStorageService().getObjectEntityFile(url);
      const [buffer] = await file.download();
      return Buffer.from(buffer);
    } catch {
      return null;
    }
  }
  // Social cards are server-rendered. Never accept an arbitrary non-HTTP
  // scheme here; it would bypass the URL parser and SSRF protection above.
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  } catch {
    return null;
  }
  const parsed = new URL(url);
  // Catalog photos served from OS public object storage are intentionally
  // unauthenticated. Do not forward an API key to that asset host: it is both
  // unnecessary and can cause a public object request to be rejected by the
  // storage layer. Other trusted Presentail image endpoints retain the
  // existing authenticated fetch behavior.
  const isPublicCatalogObject =
    parsed.hostname.toLowerCase() === "os.presentail.com" &&
    parsed.pathname.startsWith("/api/storage/public-objects/");
  return fetchImageBuffer(url, { includeTrustedApiKey: !isPublicCatalogObject });
}

// ── Text helpers ──────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Wrap text into lines where each line is at most `maxChars` characters.
 * Returns at most `maxLines` lines; excess text is truncated with an ellipsis.
 */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = word.length > maxChars ? word.slice(0, maxChars - 1) + "…" : word;
      if (lines.length >= maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length >= maxLines && current && current !== lines[maxLines - 1]) {
    // We still have remaining words — truncate last line.
    const last = lines[maxLines - 1];
    if (last && last.length > 1) lines[maxLines - 1] = last.slice(0, -1) + "…";
  }
  return lines.slice(0, maxLines);
}

// ── Image generator ───────────────────────────────────────────────────────

/**
 * Compose a 1200×630 branded JPEG for a named entity.
 *
 * Layout:
 *   Left (0–PHOTO_W):  entity photo, cover-cropped to PHOTO_W×H.
 *                      A gradient blends it into the green panel at the edge.
 *   Right (PHOTO_W–W): dark-green panel with entity name + PRESENTAIL wordmark.
 *   Bottom strip:      semi-transparent gold band + "LEBANON · UAE · CYPRUS".
 */
async function generateOgImage(
  name: string,
  imageUrl: string | null,
): Promise<Buffer> {
  // ── 1. Fetch and resize entity photo ──────────────────────────────────
  let photoComposite: sharp.OverlayOptions | null = null;

  if (imageUrl) {
    const rawBuf = await fetchImageBuffer(imageUrl);
    if (rawBuf) {
      try {
        const resized = await sharp(rawBuf)
          .resize(PHOTO_W, H, { fit: "cover", position: "centre" })
          .toBuffer();
        photoComposite = { input: resized, top: 0, left: 0 };
      } catch {
        // Photo processing failed — fall through to text-only card.
      }
    }
  }

  // ── 2. Build text layout ────────────────────────────────────────────
  const TEXT_LEFT = PHOTO_W + 44; // left edge of the text column (px)
  const TEXT_RIGHT = W - 48; // right edge (used for line-length estimate)
  // Each char is roughly 0.54 × font-size px wide for the serif font at these
  // sizes — a rough but effective line-length guard so names don't overflow.
  const MAX_LINES = 3;

  // Choose font size based on name length so short names are big and long ones fit.
  let nameFontSize = 52;
  if (name.length > 40) nameFontSize = 36;
  else if (name.length > 26) nameFontSize = 44;

  // Approximate chars-per-line at the chosen font size.
  const charsPerLine = Math.floor((TEXT_RIGHT - TEXT_LEFT) / (nameFontSize * 0.55));
  const nameLines = wrapText(name, charsPerLine, MAX_LINES);

  const lineH = nameFontSize + 12; // line-height
  const nameBlockH = nameLines.length * lineH;

  // Vertically centre the text block (excluding the bottom strip, ~58 px).
  const usableH = H - 58;
  const nameTopY = Math.round((usableH - nameBlockH - 64) / 2);

  // Tagline appears below the name block.
  const taglineY = nameTopY + nameBlockH + 28;
  const wordmarkY = taglineY + 38;

  // ── 3. Build SVG overlay ─────────────────────────────────────────────
  const nameTextSvg = nameLines
    .map((line, i) => {
      const y = nameTopY + i * lineH + nameFontSize;
      return `<text
        x="${TEXT_LEFT}" y="${y}"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="${nameFontSize}"
        font-weight="400"
        fill="${WHITE}"
        opacity="0.96"
      >${escapeXml(line)}</text>`;
    })
    .join("\n");

  const svgOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <!-- Gradient that fades the photo into the green panel at its right edge -->
    <linearGradient id="photoFade" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="60%"  style="stop-color:${BG};stop-opacity:0"/>
      <stop offset="100%" style="stop-color:${BG};stop-opacity:1"/>
    </linearGradient>
  </defs>

  ${
    photoComposite
      ? `<!-- Blend gradient over photo right edge -->
    <rect x="${Math.round(PHOTO_W * 0.45)}" y="0"
          width="${Math.round(PHOTO_W * 0.55)}" height="${H}"
          fill="url(#photoFade)"/>`
      : ""
  }

  <!-- ── Thin gold border frame ── -->
  <rect x="22" y="22" width="${W - 44}" height="${H - 44}"
        fill="none" stroke="${GOLD}" stroke-width="0.8" opacity="0.3" rx="2"/>

  <!-- ── Vertical separator line ── -->
  ${
    photoComposite
      ? `<line x1="${PHOTO_W}" y1="60" x2="${PHOTO_W}" y2="${H - 70}"
              stroke="${GOLD}" stroke-width="0.6" opacity="0.0"/>`
      : ""
  }

  <!-- ── Entity name ── -->
  ${nameTextSvg}

  <!-- ── Gold accent rule beneath the name ── -->
  <line x1="${TEXT_LEFT}" y1="${taglineY - 4}"
        x2="${Math.min(TEXT_LEFT + 220, TEXT_RIGHT)}" y2="${taglineY - 4}"
        stroke="${GOLD}" stroke-width="1" opacity="0.7"/>

  <!-- ── PRESENTAIL wordmark ── -->
  <text
    x="${TEXT_LEFT}" y="${wordmarkY}"
    font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
    font-size="18"
    font-weight="300"
    letter-spacing="4"
    fill="${GOLD}"
    opacity="0.9"
  >PRESENTAIL</text>

  <!-- ── Tagline ── -->
  <text
    x="${TEXT_LEFT}" y="${wordmarkY + 28}"
    font-family="Georgia, 'Times New Roman', serif"
    font-style="italic"
    font-size="14"
    fill="${CREAM}"
    opacity="0.65"
  >Luxury flowers &amp; gifts, delivered.</text>

  <!-- ── Bottom strip background ── -->
  <rect x="0" y="${H - 58}" width="${W}" height="58"
        fill="${GOLD}" opacity="0.10"/>

  <!-- ── Thin divider above strip ── -->
  <line x1="60" y1="${H - 58}" x2="${W - 60}" y2="${H - 58}"
        stroke="${GOLD}" stroke-width="0.7" opacity="0.45"/>

  <!-- ── Country callout ── -->
  <text
    x="${W / 2}" y="${H - 22}"
    text-anchor="middle"
    font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
    font-size="11"
    font-weight="400"
    letter-spacing="3.5"
    fill="${GOLD}"
    opacity="0.85"
  >LEBANON  ·  UAE  ·  CYPRUS</text>
</svg>`;

  // ── 4. Composite layers onto background ─────────────────────────────
  const composites: sharp.OverlayOptions[] = [];
  if (photoComposite) composites.push(photoComposite);
  composites.push({ input: Buffer.from(svgOverlay), top: 0, left: 0 });

  const jpeg = await sharp({
    create: { width: W, height: H, channels: 3, background: BG },
  })
    .composite(composites)
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  return jpeg;
}

// ── Store key list (for product lookup) ──────────────────────────────────
const STORE_KEYS = ["lebanon", "dubai", "abudhabi", "cyprus"] as const;

// ── Budget guard ──────────────────────────────────────────────────────────
// Product cards are recompressed by the reusable renderer at this target. The
// guard remains for the legacy city/brand contracts handled in this router.
const JPEG_BUDGET_BYTES = 1_000_000; // 1 MB

function checkJpegBudget(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  buffer: Buffer,
  context: string,
): void {
  if (buffer.byteLength > JPEG_BUDGET_BYTES) {
    req.log.warn(
      { context, sizeKb: Math.round(buffer.byteLength / 1024) },
      "og-image: generated JPEG exceeds 1 MB budget — consider reducing quality or resizing the source photo",
    );
  }
}

// ── Shared send helper ────────────────────────────────────────────────────
function sendJpeg(
  res: Parameters<Parameters<typeof router.get>[1]>[1],
  buffer: Buffer,
  maxAge = 3600,
): void {
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader(
    "Cache-Control",
    `public, max-age=${maxAge}, stale-while-revalidate=600`,
  );
  res.send(buffer);
}

// ── Routes ─────────────────────────────────────────────────────────────
/**
 * GET /api/og-image/product/:slug
 *
 * Returns a 1200×630 JPEG branded card for the product identified by `slug`.
 * Looks the product up in the OS product cache (all stores; first match wins).
 *
 * Fallback strategy — the og:image URL is embedded in HTML served to crawlers
 * before the image is generated; a broken URL would be permanently cached by
 * WhatsApp / iMessage. To guarantee this URL always resolves to a valid JPEG:
 *   - Found product  → branded ivory card with catalog photo
 *   - Cold cache / unknown slug → generic Presentail branded card (no name /
 *     photo) cached for only 5 minutes so the correct card is served once the
 *     cache warms up
 */
router.get("/og-image/product/:slug", async (req, res) => {
  const slug = (req.params.slug ?? "").trim();
  if (!slug) return res.status(400).end();

  const requestedStore = typeof req.query.store === "string" && STORE_KEYS.includes(req.query.store as typeof STORE_KEYS[number])
    ? req.query.store as typeof STORE_KEYS[number]
    : null;
  const lookupStores = requestedStore ? [requestedStore] : STORE_KEYS;
  let product: ReturnType<typeof getOsProductBySlug> = null;
  for (const storeKey of lookupStores) {
    const p = getOsProductBySlug(slug, storeKey);
    if (p) {
      product = p;
      break;
    }
  }

  try {
    // DB edits are optional at runtime: a temporary DB issue must still leave
    // crawlers with a valid generic/product card rather than a broken image.
    const overrideRow = await getProductSocialShare(slug).catch(() => null);
    const overrides = rowToProductSocialOverrides(overrideRow);
    const selection = selectProductSocialImage(product, overrides);
    const selectionFlags: import("../lib/productSocialShare").ProductSocialQualityFlag[] = [];
    if (!product?.images?.[0]?.url) selectionFlags.push("absent-primary");
    if (!selection) selectionFlags.push("generic-fallback");
    const version = buildProductSocialVersion(selection?.url ?? null, overrides);
    const wantsThumbnail = req.query.thumbnail === "1";
    const cacheKey = `product:${slug}:${version}:${wantsThumbnail ? "thumbnail" : "full"}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return sendJpeg(res, cached, product ? 86400 : 300);
    }

    const isEditorialUrl = selection?.source === "custom" || selection?.source === "preferred";
    const source = selection && (!isEditorialUrl || selection.url.startsWith("/objects/") || isTrustedImageHost(selection.url))
      ? await fetchProductSocialSource(selection.url)
      : null;
    if (!source && !selectionFlags.includes("generic-fallback")) selectionFlags.push("generic-fallback");
    let rendered;
    try {
      rendered = await renderProductSocialCard({
        imageBuffer: source,
        layout: overrides.layout,
        focalX: overrides.focalX,
        focalY: overrides.focalY,
        scale: overrides.scale,
        positionX: overrides.positionX,
        positionY: overrides.positionY,
      });
    } catch (renderError) {
      // A bad editorial source/control must never turn a crawler request into
      // a 500. The generic branded artwork is a valid social-card fallback.
      req.log.warn({ err: renderError, slug }, "og-image product: renderer failed; using generic fallback");
      rendered = await renderProductSocialCard();
    }
    // Persist diagnostics only when editorial settings already exist. Public
    // crawler requests must not create a database row for every product.
    if (overrideRow) {
      void upsertProductSocialShare(
        slug,
        overrides,
        [...new Set([...rendered.qualityFlags, ...selectionFlags])],
        { bumpVersion: false },
      ).catch(() => undefined);
    }
    const buffer = wantsThumbnail
      ? await sharp(rendered.buffer).resize(600, 315, { fit: "cover" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
      : rendered.buffer;
    checkJpegBudget(req, buffer, `product:${slug}:${selection?.source ?? "generic"}`);
    const maxAge = product ? 86400 : 300;
    setCached(cacheKey, buffer);
    return sendJpeg(res, buffer, maxAge);
  } catch (err) {
    req.log.warn({ err, slug }, "og-image product: generation failed");
    return res.status(500).end();
  }
});

/**
 * GET /api/og-image/brand/:slug
 *
 * Returns a 1200×630 JPEG branded card for the brand identified by `slug`.
 * Same fallback strategy as the product route above.
 */
router.get("/og-image/brand/:slug", async (req, res) => {
  const slug = (req.params.slug ?? "").trim();
  if (!slug) return res.status(400).end();

  const cacheKey = `brand:${slug}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return sendJpeg(res, cached);
  }

  const brands = getOsBrands();
  const brand = brands?.find((b) => b.slug === slug);
  const found = !!brand;

  const name = brand?.name ?? "";
  const imageUrl = (typeof brand?.image === "string" && brand.image) ? brand.image : null;

  try {
    const buffer = await generateOgImage(name, imageUrl);
    checkJpegBudget(req, buffer, `brand:${slug}`);
    const maxAge = found ? 3600 : 300;
    setCached(cacheKey, buffer);
    return sendJpeg(res, buffer, maxAge);
  } catch (err) {
    req.log.warn({ err, slug }, "og-image brand: generation failed");
    return res.status(500).end();
  }
});

/**
 * GET /api/og-image/occasion/:slug
 *
 * Returns a 1200×630 JPEG branded card for the occasion identified by `slug`.
 * Same fallback strategy as the product route above.
 */
router.get("/og-image/occasion/:slug", async (req, res) => {
  const slug = (req.params.slug ?? "").trim();
  if (!slug) return res.status(400).end();

  const cacheKey = `occasion:${slug}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return sendJpeg(res, cached);
  }

  const occasions = getOsOccasions();
  const occasion = occasions?.find((o) => o.slug === slug);
  const found = !!occasion;

  const name = occasion?.name ?? "";
  // Prefer the public CDN URL (no auth required); fall back to the private URL
  // (fetched with PRESENTAIL_OS_API_KEY, only for trusted origins).
  const imageUrl = occasion?.imagePublicUrl ?? occasion?.image ?? null;

  try {
    const buffer = await generateOgImage(name, imageUrl);
    checkJpegBudget(req, buffer, `occasion:${slug}`);
    const maxAge = found ? 3600 : 300;
    setCached(cacheKey, buffer);
    return sendJpeg(res, buffer, maxAge);
  } catch (err) {
    req.log.warn({ err, slug }, "og-image occasion: generation failed");
    return res.status(500).end();
  }
});

/**
 * GET /api/og-image/city/:country/:city
 *
 * Returns a 1200×630 JPEG branded card for a city listing page (home, shop,
 * brands, occasions, weddings, corporate, etc.). City pages have no entity
 * photo, so the card is text-only: city + country name rendered on the
 * standard dark-green Presentail brand panel.
 *
 * Using the same visual style as product/brand/occasion cards means all
 * share images on presentail.com are recognisably on-brand.
 *
 * The URL is stable (city slug never changes) so we cache for 24 h.
 * An invalid country or city slug still returns a valid JPEG (the name
 * is just the raw slug, capitalised) so og:image URLs never 404.
 */

const CITY_COUNTRY_LABELS: Record<string, string> = {
  lb: "Lebanon",
  ae: "UAE",
  cy: "Cyprus",
};

function slugToLabel(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

router.get("/og-image/city/:country/:city", async (req, res) => {
  const countrySlug = (req.params.country ?? "").trim().toLowerCase();
  const citySlug = (req.params.city ?? "").trim().toLowerCase();
  if (!countrySlug || !citySlug) return res.status(400).end();

  const cacheKey = `city:${countrySlug}:${citySlug}`;
  const cached = getCached(cacheKey);
  if (cached) return sendJpeg(res, cached, 86400);

  const cityName = slugToLabel(citySlug);
  const countryName = CITY_COUNTRY_LABELS[countrySlug] ?? slugToLabel(countrySlug);
  // "Beirut · Lebanon", "Dubai · UAE", "Nicosia · Cyprus", etc.
  const name = `${cityName} \u00b7 ${countryName}`;

  try {
    // imageUrl = null → text-only card; generateOgImage handles this gracefully.
    const buffer = await generateOgImage(name, null);
    checkJpegBudget(req, buffer, cacheKey);
    setCached(cacheKey, buffer);
    // City slugs never change — cache aggressively at the CDN / client layer.
    return sendJpeg(res, buffer, 86400);
  } catch (err) {
    req.log.warn({ err, countrySlug, citySlug }, "og-image city: generation failed");
    return res.status(500).end();
  }
});

export default router;
