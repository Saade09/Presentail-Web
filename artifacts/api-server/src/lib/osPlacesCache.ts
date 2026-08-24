/**
 * In-memory cache + search index for verified Address Book places from
 * Presentail OS.
 *
 * The OS Address Book is the single source of truth for landmarks and
 * well-known places (hospitals, universities, hotels, malls...). This module
 * only consumes a public-safe projection of it: places must be verified AND
 * published AND checkout-enabled to ever be indexed. This repo never invents
 * places, districts, or coordinates.
 *
 * Feature flag: OS_ADDRESS_BOOK_ENABLED
 *   As of Aug 2026 the storefront API key gets a generic 403 "no_access"
 *   from every candidate OS address-book endpoint (see ADDRESS_BOOK_PATHS in
 *   @workspace/presentail-os). Until the OS team grants access, this flag
 *   stays unset and the cache stays dark: searchAddressBookPlaces() returns
 *   an empty list, the public search route returns { places: [] }, and
 *   checkout behaves exactly as today (plain free-text address entry).
 *   Set OS_ADDRESS_BOOK_ENABLED=1 (and redeploy) to light it up.
 *
 * Fallback policy:
 *   - Flag off → always empty, no OS calls at all.
 *   - Fetch failure with no prior data → empty (checkout degrades to free
 *     text; the field never errors because of this module).
 *   - Fetch failure after a successful load → last-good data is retained.
 */

import {
  fetchOsAddressBookPlaces,
  type OSAddressBookPlace,
} from "@workspace/presentail-os";
import { getLocations } from "./osLocationsCache";
import { logger } from "./logger";

// ── Feature flag ────────────────────────────────────────────────────────────

export function isAddressBookEnabled(): boolean {
  const v = (process.env.OS_ADDRESS_BOOK_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

// ── Cache state ─────────────────────────────────────────────────────────────

/** Refresh the place list at most this often (successful fetches). */
const PLACES_TTL_MS = 5 * 60 * 1000;
/** After a failed fetch, wait this long before retrying (avoids hammering OS). */
const FAILURE_RETRY_MS = 60 * 1000;

type IndexedPlace = {
  place: OSAddressBookPlace;
  /** Normalised display name. */
  normName: string;
  /** Normalised official name ("" when absent). */
  normOfficial: string;
  /** Normalised aliases. */
  normAliases: string[];
};

let indexedPlaces: IndexedPlace[] = [];
let lastSuccessAt = 0;
let lastAttemptAt = 0;
let refreshInFlight: Promise<void> | null = null;

// ── Normalisation ───────────────────────────────────────────────────────────

/**
 * Normalise text for matching: lowercase, strip diacritics/accents (NFKD),
 * unify common Arabic letter variants, replace punctuation with spaces, and
 * collapse whitespace. "A.U.B." → "a u b" → matches alias "aub" after token
 * join; "Hôtel-Dieu" → "hotel dieu".
 */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFKD")
    // Latin accents + Arabic harakat/hamza marks. The range runs to \u065F so
    // the combining hamza (\u0654/\u0655) that NFKD splits off أ/إ is stripped
    // rather than falling through to the punctuation pass and becoming a space.
    .replace(/[\u0300-\u036f\u064B-\u065F\u0670]/g, "")
    .replace(/[\u0622\u0623\u0625]/g, "\u0627") // آ أ إ → ا
    .replace(/\u0629/g, "\u0647") // ة → ه
    .replace(/\u0649/g, "\u064A") // ى → ي
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Compact form with all spaces removed — "a u b" → "aub". */
function compactForm(normalized: string): string {
  return normalized.replace(/ /g, "");
}

// ── Ranking ────────────────────────────────────────────────────────────────

/**
 * Match tiers, lower is better:
 *   0 — exact match on an alias, display name, or official name
 *   1 — prefix match
 *   2 — token-prefix or substring match
 *   3 — fuzzy (in-order subsequence, query ≥ 4 chars)
 * Returns null when the place does not match at all.
 */
export function matchTier(normQuery: string, entry: IndexedPlace): number | null {
  if (!normQuery) return null;
  const compactQuery = compactForm(normQuery);
  const keys = [entry.normName, entry.normOfficial, ...entry.normAliases].filter(
    (k) => k.length > 0,
  );

  let best: number | null = null;
  const consider = (tier: number) => {
    if (best === null || tier < best) best = tier;
  };

  for (const key of keys) {
    const compactKey = compactForm(key);
    // Tier 0: exact (spacing/punctuation-insensitive)
    if (key === normQuery || compactKey === compactQuery) {
      consider(0);
      continue;
    }
    // Tier 1: prefix
    if (key.startsWith(normQuery) || compactKey.startsWith(compactQuery)) {
      consider(1);
      continue;
    }
    // Tier 2: every query token is a prefix of some key token, or plain substring
    const queryTokens = normQuery.split(" ");
    const keyTokens = key.split(" ");
    const allTokensMatch = queryTokens.every((qt) =>
      keyTokens.some((kt) => kt.startsWith(qt)),
    );
    if (allTokensMatch || key.includes(normQuery)) {
      consider(2);
      continue;
    }
    // Tier 3: in-order subsequence (guarded to ≥4 chars to avoid noise)
    if (compactQuery.length >= 4 && isSubsequence(compactQuery, compactKey)) {
      consider(3);
    }
  }
  return best;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return i === needle.length;
}

// ── Index building ─────────────────────────────────────────────────────────

/**
 * Build the search index from raw OS places, keeping ONLY checkout-eligible
 * records: verified + published + checkout-enabled. This is the safety
 * filter the public search route relies on — unverified or inactive places
 * must never be suggested to shoppers.
 */
export function buildPlaceIndex(places: OSAddressBookPlace[]): IndexedPlace[] {
  const out: IndexedPlace[] = [];
  for (const place of places) {
    if (!place.verified || !place.published || !place.checkoutEnabled) continue;
    out.push({
      place,
      normName: normalizeSearchText(place.name),
      normOfficial: place.officialName ? normalizeSearchText(place.officialName) : "",
      normAliases: place.aliases.map(normalizeSearchText).filter((a) => a.length > 0),
    });
  }
  return out;
}

// ── Refresh ────────────────────────────────────────────────────────────────

async function refreshPlaces(): Promise<void> {
  lastAttemptAt = Date.now();
  try {
    const apiKey = process.env.PRESENTAIL_OS_API_KEY ?? "";
    const { places } = await fetchOsAddressBookPlaces({
      apiKey,
      baseUrl: process.env.PRESENTAIL_OS_API_URL || undefined,
    });
    indexedPlaces = buildPlaceIndex(places);
    lastSuccessAt = Date.now();
    logger.info(
      { total: places.length, eligible: indexedPlaces.length },
      "[osPlacesCache] refreshed address-book places",
    );
  } catch (err) {
    // Expected until the OS team grants the API key access — keep last-good
    // data (possibly empty). Checkout degrades to free text, never errors.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[osPlacesCache] address-book fetch failed; retaining last-good data",
    );
  }
}

function ensureFresh(): void {
  if (!isAddressBookEnabled()) return;
  const now = Date.now();
  const stale = now - lastSuccessAt >= PLACES_TTL_MS;
  const canRetry = now - lastAttemptAt >= FAILURE_RETRY_MS;
  if (!stale || !canRetry || refreshInFlight) return;
  refreshInFlight = refreshPlaces().finally(() => {
    refreshInFlight = null;
  });
}

// ── Public search API ──────────────────────────────────────────────────────

/**
 * Public-safe projection of a place returned to the storefront. Only fields
 * a shopper may see — never internal notes, contacts, or verification
 * history (those never even reach this process; see the OS client type).
 */
export type SafeAddressBookPlace = {
  id: string;
  name: string;
  officialName: string | null;
  area: string | null;
  /** Verified OS district display name (e.g. "Beirut"). */
  districtName: string | null;
  /**
   * Canonical internal city id for the district (e.g. "lb-beirut") when the
   * OS district maps onto one of our delivery cities; null otherwise.
   */
  districtCityId: string | null;
  /** Our city display name for that id (matches the checkout district picker). */
  districtCityName: string | null;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
  verified: true;
  followUpQuestion: string | null;
  followUpPlaceholder: string | null;
};

/**
 * Resolve the place's OS district onto one of our delivery cities so the
 * checkout district picker can be updated to a value it actually contains.
 * Mirrors the strategies of osLocationsCache.resolveOsCityId.
 */
function resolveDistrict(place: OSAddressBookPlace): {
  districtCityId: string | null;
  districtCityName: string | null;
} {
  const slug = (place.districtId ?? "").trim().toLowerCase();
  const name = (place.districtName ?? "").trim().toLowerCase();
  if (!slug && !name) return { districtCityId: null, districtCityName: null };

  const countries = getLocations();
  const candidates = place.countryCode
    ? countries.filter((c) => c.code.toUpperCase() === place.countryCode)
    : countries;

  for (const country of candidates) {
    const cc = country.code.toLowerCase();
    for (const city of country.cities) {
      if (city.isActive === false) continue;
      const cityId = city.id.toLowerCase();
      const cityName = city.name.trim().toLowerCase();
      if (
        (slug && (cityId === slug || cityId === `${cc}-${slug}`)) ||
        (name && cityName === name) ||
        (slug && cityName === slug)
      ) {
        return { districtCityId: city.id, districtCityName: city.name };
      }
    }
  }
  return { districtCityId: null, districtCityName: null };
}

/**
 * Search checkout-eligible Address Book places.
 *
 * Spans ALL districts of the given country (not just the shopper's selected
 * one) — a landmark match is exactly how a shopper discovers the recipient
 * is in a different district. Never throws; any internal problem yields [].
 */
export function searchAddressBookPlaces(
  query: string,
  countryCode?: string,
  limit = 6,
): SafeAddressBookPlace[] {
  try {
    if (!isAddressBookEnabled()) return [];
    ensureFresh();

    const normQuery = normalizeSearchText(query);
    if (compactForm(normQuery).length < 2) return [];

    const cc = countryCode ? countryCode.trim().toUpperCase() : null;
    const scored: Array<{ entry: IndexedPlace; tier: number }> = [];
    for (const entry of indexedPlaces) {
      if (cc && entry.place.countryCode && entry.place.countryCode !== cc) continue;
      const tier = matchTier(normQuery, entry);
      if (tier !== null) scored.push({ entry, tier });
    }
    scored.sort(
      (a, b) =>
        a.tier - b.tier ||
        a.entry.normName.length - b.entry.normName.length ||
        a.entry.normName.localeCompare(b.entry.normName),
    );

    return scored.slice(0, Math.max(1, Math.min(limit, 10))).map(({ entry }) => {
      const { place } = entry;
      const district = resolveDistrict(place);
      return {
        id: place.id,
        name: place.name,
        officialName:
          place.officialName && place.officialName !== place.name
            ? place.officialName
            : null,
        area: place.area ?? null,
        districtName: place.districtName ?? district.districtCityName,
        districtCityId: district.districtCityId,
        districtCityName: district.districtCityName,
        countryCode: place.countryCode ?? null,
        lat: place.lat ?? null,
        lng: place.lng ?? null,
        verified: true,
        followUpQuestion: place.followUpQuestion ?? null,
        followUpPlaceholder: place.followUpPlaceholder ?? null,
      };
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[osPlacesCache] search failed; returning empty list",
    );
    return [];
  }
}

// ── Test hooks ─────────────────────────────────────────────────────────────

/** Test-only: replace the in-memory index and mark it fresh. */
export function __setPlacesForTest(places: OSAddressBookPlace[]): void {
  indexedPlaces = buildPlaceIndex(places);
  lastSuccessAt = Date.now();
  lastAttemptAt = Date.now();
}

/** Test-only: clear all cache state. */
export function __resetPlacesCacheForTest(): void {
  indexedPlaces = [];
  lastSuccessAt = 0;
  lastAttemptAt = 0;
  refreshInFlight = null;
}
