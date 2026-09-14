import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  fetchOsRealDeliveryPhotos,
  type OSRealDeliveryPhotoRecord,
} from "@workspace/presentail-os";
import { parseOsImageUrl, OS_IMAGE_HOSTNAME } from "./imageDelivery";

export type RealDeliveryDisplayItem = {
  /** Opaque AES-256-GCM encrypted token. Never an OS order id or object URL. */
  imageRef: string;
  imageUrl: string;
  /** Catalog slug for storefront URL, or empty string when the product is not in the local catalog. */
  productId: string;
  productName: string;
  cityName: string;
  position: number;
};

export type RealDeliveryDisplayResponse = {
  ok: true;
  items: RealDeliveryDisplayItem[];
  viewMoreUrl: string | null;
};

type CachedFeed = {
  expiresAt: number;
  response: RealDeliveryDisplayResponse;
};

const FEED_TTL_MS = 5 * 60 * 1000;
const feedCache = new Map<string, CachedFeed>();

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * `approved` and `completed` must be explicitly true (fail-closed).
 * `product_active` and `in_stock` are only checked when OS returns them
 * explicitly; absent means the OS storefront endpoint already filtered
 * server-side. The catalog product lookup (`findProductByOsId`) is the
 * definitive active/in-stock gate on our side.
 */
export function isPublishableRealDeliveryPhoto(
  photo: OSRealDeliveryPhotoRecord,
): boolean {
  return (
    Boolean(clean(photo.photo_id)) &&
    isValidOsAssetUrl(photo.asset_url) &&
    photo.eligibility?.approved === true &&
    photo.eligibility?.completed === true &&
    photo.eligibility?.product_active !== false &&
    photo.eligibility?.in_stock !== false
  );
}

function isValidOsAssetUrl(raw: unknown): boolean {
  const value = clean(raw);
  if (!value) return false;
  try {
    parseOsImageUrl(value);
    return true;
  } catch {
    return false;
  }
}

function safeViewMoreUrl(value: unknown): string | null {
  const candidate = clean(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate, "https://presentail.com");
    if (url.origin !== "https://presentail.com" || !url.pathname.startsWith("/")) {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/**
 * Convert an internal storefront city ID (e.g. "lb-beirut", "ae-abu-dhabi")
 * to the human-readable city name expected by the OS API (e.g. "Beirut",
 * "Abu Dhabi"). Strips the 2-letter country prefix and capitalises each word.
 */
export function cityIdToDisplayName(cityId: string): string {
  return cityId
    .replace(/^[a-z]{2}-/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── AES-256-GCM delivery reference ────────────────────────────────────────────
//
// The `deliveryRef` in each image URL is an AES-256-GCM encrypted token.
// The OS storage path is the plaintext; the ciphertext is genuinely opaque —
// it cannot be decoded without the server key. Stateless — no shared registry.
//
// Token format: base64url( iv[12] || ciphertext[n] || authTag[16] )

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function getDeliverySigningKey(): string {
  return process.env.SESSION_SECRET ?? "";
}

/**
 * Encrypt the OS storage path with AES-256-GCM. Returns a URL-safe opaque
 * token, or null when SESSION_SECRET is absent / the URL is invalid.
 * The token is not reversible without the server key.
 */
export function buildSignedDeliveryRef(sourceUrl: string): string | null {
  const secret = getDeliverySigningKey();
  if (secret.length < 16) return null;
  try {
    const target = parseOsImageUrl(sourceUrl);
    const plaintext = `${target.pathname}${target.search}`;
    const key = deriveKey(secret);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, encrypted, authTag]).toString("base64url");
  } catch {
    return null;
  }
}

/**
 * Decrypt and validate a signed delivery reference. Returns the full OS source
 * URL, or null for any tampered, malformed, or key-mismatched token.
 * Callers should return 404 on null — no sensitive detail is logged.
 */
export function resolveSignedDeliveryRef(token: string): string | null {
  const secret = getDeliverySigningKey();
  if (secret.length < 16 || !token) return null;
  try {
    const buf = Buffer.from(token, "base64url");
    const IV_LEN = 12;
    const TAG_LEN = 16;
    if (buf.length < IV_LEN + TAG_LEN + 1) return null;
    const iv = buf.subarray(0, IV_LEN);
    const authTag = buf.subarray(buf.length - TAG_LEN);
    const encrypted = buf.subarray(IV_LEN, buf.length - TAG_LEN);
    const key = deriveKey(secret);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const fullUrl = `https://${OS_IMAGE_HOSTNAME}${decrypted.toString("utf8")}`;
    parseOsImageUrl(fullUrl);
    return fullUrl;
  } catch {
    return null;
  }
}

/** @deprecated Alias retained for imgProxy route import compatibility. */
export const getApprovedRealDeliveryAsset = resolveSignedDeliveryRef;

export function buildRealDeliveryImageUrl(assetRef: string, width = 800): string {
  return `/api/img/proxy?deliveryRef=${encodeURIComponent(assetRef)}&w=${width}&f=webp`;
}

function buildDeliveryRef(photo: OSRealDeliveryPhotoRecord): string | null {
  return isValidOsAssetUrl(photo.asset_url)
    ? buildSignedDeliveryRef(clean(photo.asset_url))
    : null;
}

function cacheKey(countryCode: string, cityId: string): string {
  return `${countryCode}:${cityId}`;
}

export async function getRealDeliveryFeed(options: {
  countryCode: string;
  cityId: string;
  lang?: string;
  request?: { query: unknown; headers: unknown };
}): Promise<RealDeliveryDisplayResponse> {
  const countryCode = clean(options.countryCode).toUpperCase();
  const cityId = clean(options.cityId);
  if (!countryCode || !cityId) return { ok: true, items: [], viewMoreUrl: null };

  const key = cacheKey(countryCode, cityId);
  const cached = feedCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.response;

  const cityName = cityIdToDisplayName(cityId);
  let body: Awaited<ReturnType<typeof fetchOsRealDeliveryPhotos>>;
  try {
    body = await fetchOsRealDeliveryPhotos(
      {
        apiKey: process.env.PRESENTAIL_OS_API_KEY ?? "",
        baseUrl: process.env.PRESENTAIL_OS_API_URL,
      },
      { country: countryCode, city: cityName },
    );
  } catch {
    return { ok: true, items: [], viewMoreUrl: null };
  }

  const seen = new Set<string>();
  const items: RealDeliveryDisplayItem[] = [];

  for (const photo of (body.photos ?? []).filter(isPublishableRealDeliveryPhoto)) {
    const photoId = clean(photo.photo_id);
    if (seen.has(photoId)) continue;
    seen.add(photoId);

    const ref = buildDeliveryRef(photo);
    if (!ref) continue;

    items.push({
      imageRef: ref,
      imageUrl: buildRealDeliveryImageUrl(ref),
      productId: "",
      productName: clean(photo.product.name),
      cityName: clean(photo.location?.city) || cityName,
      position: items.length,
    });
  }

  // Require at least 3 photos before making the section visible.
  const MIN_ITEMS = 3;
  const viewMoreUrl = safeViewMoreUrl(body.view_more_url);
  const response: RealDeliveryDisplayResponse = {
    ok: true,
    items: items.length >= MIN_ITEMS ? items.slice(0, 12) : [],
    viewMoreUrl: items.length >= MIN_ITEMS ? viewMoreUrl : null,
  };
  feedCache.set(key, { response, expiresAt: Date.now() + FEED_TTL_MS });
  return response;
}

export function clearRealDeliveryCachesForTests(): void {
  feedCache.clear();
}
