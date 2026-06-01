/**
 * In-memory cache for delivery locations fetched from Presentail OS.
 *
 * On startup (and every OS_SYNC_INTERVAL_MS thereafter) it polls
 * GET /api/public/locations from Presentail OS and stores the result.
 *
 * Fallback policy (per spec):
 *   - If OS is unreachable at startup → warn + serve hardcoded data.
 *   - If OS returns a non-empty response → use it as-is; hardcoded data
 *     supplements countries that are entirely absent from the OS response
 *     (e.g. Cyprus not yet configured in OS) AND countries that OS returns
 *     with zero cities (data not yet published to the OS API). A per-country
 *     WARN is emitted when the city-level fallback fires so ops can see the
 *     gap without the app serving empty pickers to shoppers.
 *   - Once a successful OS response has been stored, a later fetch failure
 *     retains the last good cache rather than falling back to hardcoded data.
 *
 * PRESENTAIL_OS_API_KEY must be present; call validateOsEnv() at startup.
 */

import {
  fetchOsLocations,
  type OSLocationsResponse,
  type OSExpressConfig,
  type OSTimeSlot,
} from "@workspace/presentail-os";
import {
  DELIVERY_COUNTRIES as HARDCODED_COUNTRIES,
  feeForDistrict,
  localizedNamesForCountry,
  localizedNamesForCity,
} from "@workspace/catalog-data";
import { resolveDeliveryConfig } from "../data/deliveryConfig";
import { logger } from "./logger";

// ── Types ──────────────────────────────────────────────────────────────────

type CachedCity = {
  id: string;
  name: string;
  isActive: boolean;
  fee?: number;
  expressAvailable?: boolean;
  expressDeliveryLabel?: string;
  sameDayCutoffHour?: number;
  timeSlots?: OSTimeSlot[];
  localizedNames?: { ar?: string; fr?: string };
};

type CachedCountry = {
  id: string;
  name: string;
  /** Uppercase ISO 3166-1 alpha-2, e.g. "LB". */
  code: string;
  flag: string;
  currency: string;
  isActive: boolean;
  preferredDefaultCityId?: string;
  localizedNames?: { ar?: string; fr?: string };
  freeDeliveryThresholdUsd?: number;
  freeDeliveryEnabled?: boolean;
  cities: CachedCity[];
};

export type OsDeliverySlot = OSTimeSlot;

// ── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

const INTERVAL_MS = (() => {
  const raw = Number(process.env.WOO_SYNC_INTERVAL_MS);
  if (!Number.isFinite(raw) || raw < 60_000) return DEFAULT_INTERVAL_MS;
  return raw;
})();

const HARDCODED_BY_CODE = new Map(
  HARDCODED_COUNTRIES.map((c) => [c.code.toUpperCase(), c]),
);

// ── Module state ───────────────────────────────────────────────────────────

/** null = not yet fetched; set after first successful or fallback load. */
let cachedCountries: CachedCountry[] | null = null;
let cityIndex = new Map<string, CachedCity>();
let timer: NodeJS.Timeout | null = null;
let fetching = false;

// ── Transform helpers ──────────────────────────────────────────────────────

function buildCityIndex(countries: CachedCountry[]): Map<string, CachedCity> {
  const idx = new Map<string, CachedCity>();
  for (const country of countries) {
    for (const city of country.cities) {
      idx.set(city.id, city);
    }
  }
  return idx;
}

/**
 * Resolve the canonical internal city ID from what OS returns.
 *
 * OS may store the slug as just the city name (e.g. "beirut") rather than
 * the full prefixed form we use internally ("lb-beirut"). We try three
 * strategies in order:
 *   1. Direct match against the hardcoded city id (e.g. "lb-beirut").
 *   2. Country-prefixed form: `{countryCode.lower()}-{osSlug}` (e.g. "lb-beirut").
 *   3. Case-insensitive name match against hardcoded cities.
 * Falls back to the OS-supplied id unchanged if none match.
 */
function resolveOsCityId(
  osId: string,
  osName: string,
  countryCode: string,
  hardcodedCities: ReadonlyArray<{ id: string; name: string }>,
): string {
  // 1. Direct id match
  if (hardcodedCities.some((hc) => hc.id === osId)) return osId;

  // 2. Prefixed: "lb-" + osSlug
  const prefixed = `${countryCode.toLowerCase()}-${osId}`;
  if (hardcodedCities.some((hc) => hc.id === prefixed)) return prefixed;

  // 3. Name match (case-insensitive, trimmed)
  const normName = osName.trim().toLowerCase();
  const byName = hardcodedCities.find(
    (hc) => hc.name.trim().toLowerCase() === normName,
  );
  if (byName) return byName.id;

  // No match — use OS id as-is
  return osId;
}

function transformOsResponse(resp: OSLocationsResponse): CachedCountry[] {
  const osCodes = new Set(resp.countries.map((c) => c.code.toUpperCase()));

  const fromOs: CachedCountry[] = resp.countries.map((osCountry) => {
    const code = osCountry.code.toUpperCase();
    const hardcoded = HARDCODED_BY_CODE.get(code);

    const flag = osCountry.flag ?? hardcoded?.flag ?? "";
    const currency = osCountry.currency ?? hardcoded?.currency ?? "USD";

    // When OS returns a country but with no cities (data pipeline gap or
    // not yet published to the public API), fall back to hardcoded cities
    // for that country so shoppers still see a picker. Emit a WARN so ops
    // can see the gap without needing to check the API manually.
    const cities: CachedCity[] =
      osCountry.cities.length === 0 && hardcoded?.cities.length
        ? (() => {
            logger.warn(
              { countryCode: code },
              "osLocationsCache: OS returned 0 cities for country — serving hardcoded fallback cities until OS data is available",
            );
            return hardcoded.cities.map((city) => ({
              id: city.id,
              name: city.name,
              isActive: city.isActive,
              fee: feeForDistrict(code, city.name),
              localizedNames: localizedNamesForCity(city.id),
            }));
          })()
        : osCountry.cities.map((c) => {
            // Resolve the canonical city id regardless of what slug OS uses.
            const canonicalId = resolveOsCityId(
              c.id,
              c.name,
              code,
              hardcoded?.cities ?? [],
            );
            if (canonicalId !== c.id) {
              logger.debug(
                { osId: c.id, canonicalId, cityName: c.name, countryCode: code },
                "osLocationsCache: mapped OS city slug to canonical id",
              );
            }
            return {
              id: canonicalId,
              name: c.name,
              isActive: c.isActive ?? true,
              fee: c.deliveryFee ?? feeForDistrict(code, c.name),
              expressAvailable: c.expressAvailable,
              expressDeliveryLabel: c.expressDeliveryLabel,
              sameDayCutoffHour: c.sameDayCutoffHour,
              timeSlots: c.timeSlots,
              localizedNames: localizedNamesForCity(canonicalId),
            };
          });

    return {
      id: osCountry.id ?? osCountry.code.toLowerCase(),
      name: osCountry.name,
      code,
      flag,
      currency,
      isActive: osCountry.isActive ?? hardcoded?.isActive ?? true,
      preferredDefaultCityId:
        osCountry.preferredDefaultCityId ?? hardcoded?.preferredDefaultCityId,
      localizedNames: localizedNamesForCountry(code),
      freeDeliveryThresholdUsd: osCountry.freeDeliveryThresholdUsd,
      freeDeliveryEnabled: osCountry.freeDeliveryEnabled,
      cities,
    };
  });

  // Append countries entirely missing from OS (e.g. Cyprus not yet in OS).
  const hardcodedOnly = HARDCODED_COUNTRIES.filter(
    (c) => !osCodes.has(c.code.toUpperCase()),
  ).map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code.toUpperCase(),
    flag: c.flag,
    currency: c.currency,
    isActive: c.isActive,
    preferredDefaultCityId: c.preferredDefaultCityId,
    localizedNames: localizedNamesForCountry(c.code),
    cities: c.cities.map((city) => ({
      id: city.id,
      name: city.name,
      isActive: city.isActive,
      fee: feeForDistrict(c.code, city.name),
      localizedNames: localizedNamesForCity(city.id),
    })),
  }));

  return [...fromOs, ...hardcodedOnly];
}

function hardcodedFallback(): CachedCountry[] {
  return HARDCODED_COUNTRIES.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code.toUpperCase(),
    flag: c.flag,
    currency: c.currency,
    isActive: c.isActive,
    preferredDefaultCityId: c.preferredDefaultCityId,
    localizedNames: localizedNamesForCountry(c.code),
    cities: c.cities.map((city) => ({
      id: city.id,
      name: city.name,
      isActive: city.isActive,
      fee: feeForDistrict(c.code, city.name),
      localizedNames: localizedNamesForCity(city.id),
    })),
  }));
}

// ── Fetch ──────────────────────────────────────────────────────────────────

async function fetchAndStore(): Promise<void> {
  const apiKey = process.env.PRESENTAIL_OS_API_KEY ?? "";
  const baseUrl = process.env.PRESENTAIL_OS_API_URL ?? "https://os.presentail.com";

  try {
    const resp = await fetchOsLocations({ baseUrl, apiKey });
    const countries = transformOsResponse(resp);
    cachedCountries = countries;
    cityIndex = buildCityIndex(countries);
    logger.info(
      { countryCount: countries.length },
      "osLocationsCache: locations refreshed from Presentail OS",
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (cachedCountries !== null) {
      // Retain the last good cache; do not fall back to hardcoded data.
      logger.warn(
        { err: msg },
        "osLocationsCache: fetch failed — retaining last good cache",
      );
    } else {
      // First fetch failed: fall back to hardcoded data so the server stays up.
      logger.warn(
        { err: msg },
        "osLocationsCache: initial fetch failed — serving hardcoded fallback until next poll",
      );
      cachedCountries = hardcodedFallback();
      cityIndex = buildCityIndex(cachedCountries);
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns the cached delivery countries + cities.
 * Always returns a non-empty array (hardcoded fallback at worst).
 */
export function getLocations(): CachedCountry[] {
  return cachedCountries ?? hardcodedFallback();
}

/**
 * Returns the time slots for a given city from the OS cache.
 * Returns an empty array when the city is not in OS or has no slots configured
 * (callers should fall back to lib/delivery defaults).
 */
export function getDeliverySlots(cityId: string): OsDeliverySlot[] {
  return cityIndex.get(cityId)?.timeSlots ?? [];
}

/**
 * Returns the express/same-day delivery config for a city from the OS cache.
 * Returns undefined fields when the city is not yet in OS — callers fall back
 * to the hardcoded delivery config.
 */
export function getExpressConfig(cityId: string | null | undefined): OSExpressConfig {
  if (!cityId) return {};
  const city = cityIndex.get(cityId);
  if (!city) return {};
  return {
    expressAvailable: city.expressAvailable,
    expressDeliveryLabel: city.expressDeliveryLabel,
    sameDayCutoffHour: city.sameDayCutoffHour,
  };
}

/**
 * Returns the cached country entry by its uppercase ISO code, or undefined
 * when the code is absent from the cache.
 */
function getCachedCountry(code: string): CachedCountry | undefined {
  const countries = cachedCountries ?? null;
  if (!countries) return undefined;
  return countries.find((c) => c.code === code.toUpperCase());
}

/**
 * Returns the resolved delivery config for a country/city, merging the
 * OS express label and same-day cutoff (when available) with the hardcoded
 * threshold and currency, and overriding free-delivery fields from the OS
 * country entry when present.
 */
export function resolveOsDeliveryConfig(
  countryCode: string | undefined,
  cityId: string | undefined,
) {
  const base = resolveDeliveryConfig(countryCode, cityId);
  const express = getExpressConfig(cityId);

  let result = express.expressDeliveryLabel
    ? { ...base, expressDeliveryTimeLabel: express.expressDeliveryLabel }
    : { ...base };

  if (countryCode) {
    const osCountry = getCachedCountry(countryCode);
    if (osCountry) {
      if (typeof osCountry.freeDeliveryThresholdUsd === "number") {
        result = { ...result, freeDeliveryThresholdUsd: osCountry.freeDeliveryThresholdUsd };
      }
      if (typeof osCountry.freeDeliveryEnabled === "boolean") {
        result = { ...result, freeDeliveryEnabled: osCountry.freeDeliveryEnabled };
      }
      // When OS explicitly disables free delivery, force threshold high enough
      // that it is never reached so fee calculation is unaffected regardless of
      // whether callers check freeDeliveryEnabled first.
      if (osCountry.freeDeliveryEnabled === false) {
        result = { ...result, freeDeliveryEnabled: false };
      }
    }
  }

  return result;
}

/**
 * Store a delivery locations payload pushed by Presentail OS via webhook.
 *
 * OS sends the full locations payload to the registered webhook URL whenever
 * cities or country settings change (and on "Send test ping"). This is the
 * primary way cities reach the server — the pull API (/api/delivery-locations)
 * requires additional workspace configuration that may not yet be set up.
 *
 * The payload goes through the same transformOsResponse + fallback pipeline
 * as a polled response, so city-level hardcoded fallback still applies when
 * OS pushes a country with 0 cities.
 */
export function storeLocationsFromWebhook(payload: OSLocationsResponse): void {
  if (!payload.countries || !Array.isArray(payload.countries)) {
    logger.warn(
      { payload },
      "osLocationsCache: webhook payload has no countries array — ignoring",
    );
    return;
  }

  const countries = transformOsResponse(payload);
  cachedCountries = countries;
  cityIndex = buildCityIndex(countries);

  const totalCities = countries.reduce((n, c) => n + c.cities.length, 0);
  logger.info(
    { countryCount: countries.length, cityCount: totalCities },
    "osLocationsCache: locations updated from OS webhook push",
  );
}

/**
 * Invalidate the cache and trigger a fresh fetch immediately.
 * Retains the last-good cache while the refetch is in progress so
 * callers keep serving stale-but-valid data rather than falling back
 * to hardcoded data during the fetch window.
 *
 * Use storeLocationsFromWebhook() instead when the OS pushes a full payload.
 */
export function invalidateOsLocationsCache(): void {
  fetchAndStore().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, "osLocationsCache: invalidation fetch failed");
  });
}

/**
 * Validate required OS environment variables at startup.
 * Logs a warning if PRESENTAIL_OS_API_KEY is missing — the server will
 * start and fall back to hardcoded city/delivery data until the secret
 * is configured.
 *
 * Call this before startOsLocationSync() in the server entry point.
 */
export function validateOsEnv(): void {
  if (!process.env.PRESENTAIL_OS_API_KEY) {
    logger.warn(
      "PRESENTAIL_OS_API_KEY is not set — live city/delivery config from " +
        "Presentail OS is disabled. Falling back to hardcoded data.",
    );
  }
  if (!process.env.PRESENTAIL_OS_WEBHOOK_SECRET) {
    logger.warn(
      "PRESENTAIL_OS_WEBHOOK_SECRET is not set — the /api/os/webhook endpoint " +
        "will return 503 until this secret is configured.",
    );
  }
}

/**
 * Start the background polling worker. Safe to call multiple times (idempotent).
 * Performs an initial fetch shortly after startup, then polls on INTERVAL_MS.
 *
 * Call validateOsEnv() before this to ensure the API key is present.
 */
export function startOsLocationSync(): void {
  if (process.env.NODE_ENV === "test") return;
  if (timer) return;

  // Initial fetch shortly after startup (stagger slightly to avoid
  // hammering the OS API at the same time as other workers).
  const initTimer = setTimeout(() => {
    fetchAndStore().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg }, "osLocationsCache: initial fetch failed");
    });
  }, 5_000);
  initTimer.unref?.();

  timer = setInterval(() => {
    if (fetching) return;
    fetching = true;
    fetchAndStore()
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ err: msg }, "osLocationsCache: scheduled fetch failed");
      })
      .finally(() => {
        fetching = false;
      });
  }, INTERVAL_MS);
  timer.unref?.();

  logger.info({ intervalMs: INTERVAL_MS }, "osLocationsCache: worker started");
}

export function stopOsLocationSync(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
