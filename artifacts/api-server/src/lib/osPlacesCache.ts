/**
 * Per-query search proxy + short-lived cache for verified Address Book
 * places from Presentail OS.
 *
 * The OS Address Book is the single source of truth for landmarks and
 * well-known places (hospitals, universities, hotels, malls...). Per the
 * confirmed OS contract (Aug 2026) the SEARCH ITSELF happens OS-side:
 * we forward the shopper's debounced text as `q` to
 * GET /api/address-book/places and relay only checkout-safe records.
 * This repo never invents places, districts, or coordinates, and never
 * re-ranks the OS relevance ordering.
 *
 * Feature flag: OS_ADDRESS_BOOK_ENABLED
 *   While unset the module is fully dark: searchAddressBookPlaces() returns
 *   an empty list with NO OS calls, the public search route returns
 *   { places: [] }, and checkout behaves exactly as before (plain free-text
 *   address entry). Set OS_ADDRESS_BOOK_ENABLED=1 (and redeploy) to light
 *   it up.
 *
 * Fallback policy (checkout free-text entry must never depend on this API):
 *   - Flag off → always empty, no OS calls at all.
 *   - OS failure (authorization, network, bad payload) →
 *     empty list AND a global backoff so a shopper typing does not hammer
 *     OS with one failing request per keystroke.
 *   - Per-query results are cached briefly so repeated queries (backspacing,
 *     retyping) are served without extra OS round-trips.
 */

import {
  searchOsAddressBookPlaces,
  type OSAddressBookPlace,
} from "@workspace/presentail-os";
import { getLocations } from "./osLocationsCache";
import { logger } from "./logger";

// ── Feature flag ────────────────────────────────────────────────────────────

export function isAddressBookEnabled(): boolean {
  const v = (process.env.OS_ADDRESS_BOOK_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

// ── Normalisation ───────────────────────────────────────────────────────────

/**
 * Normalise text for cache keys and the minimum-length guard: lowercase,
 * strip diacritics/accents (NFKD), unify common Arabic letter variants,
 * replace punctuation with spaces, and collapse whitespace.
 * "A.U.B." → "a u b"; "Hôtel-Dieu" → "hotel dieu".
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

// ── Per-query cache + failure backoff ───────────────────────────────────────

/** Serve a cached per-query result for this long before re-asking OS. */
const QUERY_TTL_MS = 60 * 1000;
/**
 * After ANY OS failure, stop calling OS entirely for this long (globally).
 * Prevents one failing request per keystroke while access is still pending
 * (the current 403 state) or OS is down.
 */
const FAILURE_BACKOFF_MS = 60 * 1000;
/** Cap the per-query cache; oldest entries are evicted first. */
const MAX_CACHE_ENTRIES = 500;

type CacheEntry = {
  at: number;
  places: OSAddressBookPlace[];
};

const queryCache = new Map<string, CacheEntry>();
let backoffUntil = 0;
const inFlight = new Map<string, Promise<OSAddressBookPlace[]>>();

function cacheKey(normQuery: string, countryCode: string | null): string {
  // Compact (space-free) form so "A.U.B." and "aub" share one entry.
  return `${countryCode ?? "*"}|${compactForm(normQuery)}`;
}

function pruneCache(now: number): void {
  if (queryCache.size <= MAX_CACHE_ENTRIES) return;
  for (const [key, entry] of queryCache) {
    if (queryCache.size <= MAX_CACHE_ENTRIES && now - entry.at < QUERY_TTL_MS) break;
    queryCache.delete(key);
  }
}

// ── Public search API ──────────────────────────────────────────────────────

/**
 * Public-safe projection of a place returned to the storefront. Only fields
 * a shopper may see — never internal notes, contacts, delivery history, or
 * audit data (those never even reach this process; see the OS client type).
 */
export type SafeAddressBookPlace = {
  id: string;
  name: string;
  officialName: string | null;
  /** Approved public aliases (abbreviations, older names) — displayable. */
  aliases: string[];
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

function toSafePlace(place: OSAddressBookPlace): SafeAddressBookPlace {
  const district = resolveDistrict(place);
  return {
    id: place.id,
    name: place.name,
    officialName:
      place.officialName && place.officialName !== place.name
        ? place.officialName
        : null,
    aliases: place.aliases.filter(
      (a) => a.trim().length > 0 && a.trim().toLowerCase() !== place.name.trim().toLowerCase(),
    ),
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
}

/**
 * Fetch eligible places for a query from OS (or the per-query cache).
 * Returns the ELIGIBLE OSAddressBookPlace list (before limiting/projection).
 * Never throws; failures arm the global backoff and yield [].
 */
async function fetchEligiblePlaces(
  rawQuery: string,
  normQuery: string,
  countryCode: string | null,
): Promise<OSAddressBookPlace[]> {
  const now = Date.now();
  const key = cacheKey(normQuery, countryCode);

  const cached = queryCache.get(key);
  if (cached && now - cached.at < QUERY_TTL_MS) return cached.places;

  // Failure backoff: never call OS during the window; serve last-good
  // (possibly stale) data for this exact query if we have it.
  if (now < backoffUntil) return cached?.places ?? [];

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const { places } = await searchOsAddressBookPlaces(
        {
          apiKey: process.env.PRESENTAIL_OS_API_KEY ?? "",
          baseUrl: process.env.PRESENTAIL_OS_API_URL || undefined,
        },
        { q: rawQuery },
      );
      // Defensive eligibility filter — the OS contract promises only
      // checkout-safe records, but unverified places must never reach a
      // shopper even if OS misbehaves (fail closed).
      const eligible = places.filter(
        (p) => p.verified && p.published && p.checkoutEnabled,
      );
      queryCache.set(key, { at: Date.now(), places: eligible });
      pruneCache(Date.now());
      return eligible;
    } catch (err) {
      // Expected while OS access is pending (403) — back off, keep last-good.
      backoffUntil = Date.now() + FAILURE_BACKOFF_MS;
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[osPlacesCache] address-book search failed; backing off",
      );
      return cached?.places ?? [];
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

/**
 * Search checkout-eligible Address Book places via the OS search endpoint.
 *
 * Spans ALL districts of the given country (not just the shopper's selected
 * one) — a landmark match is exactly how a shopper discovers the recipient
 * is in a different district. Never throws; any internal problem yields [].
 */
export async function searchAddressBookPlaces(
  query: string,
  countryCode?: string,
  limit = 6,
): Promise<SafeAddressBookPlace[]> {
  try {
    if (!isAddressBookEnabled()) return [];

    const normQuery = normalizeSearchText(query);
    if (compactForm(normQuery).length < 2) return [];

    const cc = countryCode ? countryCode.trim().toUpperCase() : null;
    const eligible = await fetchEligiblePlaces(query.trim(), normQuery, cc);

    // Trust the OS relevance ordering; just scope, cap, and project.
    return eligible
      .filter((p) => !cc || !p.countryCode || p.countryCode === cc)
      .slice(0, Math.max(1, Math.min(limit, 10)))
      .map(toSafePlace);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[osPlacesCache] search failed; returning empty list",
    );
    return [];
  }
}

// ── Test hooks ─────────────────────────────────────────────────────────────

/** Test-only: clear all cache/backoff state. */
export function __resetPlacesCacheForTest(): void {
  queryCache.clear();
  inFlight.clear();
  backoffUntil = 0;
}

/** Test-only: report whether the failure backoff is currently armed. */
export function __isBackoffArmedForTest(): boolean {
  return Date.now() < backoffUntil;
}
