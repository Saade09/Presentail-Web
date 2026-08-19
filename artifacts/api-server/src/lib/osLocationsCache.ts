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
 *     (e.g. a country not yet configured in either OS locations endpoint)
 *     AND countries that OS returns with zero cities (data not yet
 *     published to the OS API). A per-country WARN is emitted when the
 *     city-level fallback fires so ops can see the gap without the app
 *     serving empty pickers to shoppers. Note: fetchOsLocations() (in
 *     @workspace/presentail-os) already merges the legacy
 *     /api/delivery-locations response into the primary -ext response for
 *     any country the ext endpoint doesn't yet serve (e.g. Cyprus), so this
 *     "entirely absent" path is now a last-resort fallback rather than the
 *     normal path for Cyprus.
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
import { getUsdAmount } from "./fxRateCache";
import {
  DELIVERY_COUNTRIES as HARDCODED_COUNTRIES,
  feeForDistrict,
  localizedNamesForCountry,
  localizedNamesForCity,
} from "@workspace/catalog-data";
import { resolveDeliveryConfig } from "../data/deliveryConfig";
import { logger } from "./logger";
import { sendAlert } from "./alerts";

// Mirrors lib/delivery EXPRESS_CLOSE_HOUR. Using a local constant avoids
// adding @workspace/delivery as a runtime dep of api-server.
const EXPRESS_CLOSE_HOUR = 22;

// ── Types ──────────────────────────────────────────────────────────────────

type CachedCity = {
  id: string;
  name: string;
  isActive: boolean;
  fee?: number;
  /** Whether this city supports express/same-day delivery at all (time-gated on client). */
  expressAvailable: boolean;
  /** Human-readable delivery promise label; empty string means "use client translation". */
  expressDeliveryLabel: string;
  /** Hour of day (0–23) after which same-day booking is disabled. Defaults to EXPRESS_CLOSE_HOUR. */
  sameDayCutoffHour: number;
  /** Minute component of the same-day booking cutoff. Defaults to :00. */
  sameDayCutoffMinute?: number;
  /**
   * True only when the current OS payload explicitly supplied the fields used
   * for campaign availability promises. Hardcoded/prior-cache defaults are
   * deliberately unverified so paid pages can fall back to neutral copy.
   */
  operationsConfigVerified: boolean;
  timeSlots: OSTimeSlot[];
  /**
   * Per-day-of-week slots from OS. Keys are lowercase English weekday names
   * (e.g. "monday"). Absent when OS did not return per-day data.
   */
  slotsByDay?: Record<string, OSTimeSlot[]>;
  localizedNames?: { ar?: string; fr?: string };
  /**
   * Per-city free-delivery threshold in USD from Presentail OS.
   * When present, overrides the country-level threshold.
   * Undefined means the city inherits the country's setting.
   */
  freeDeliveryThresholdUsd?: number;
  /**
   * Per-city flag controlling whether free delivery is offered.
   * When present, overrides the country-level freeDeliveryEnabled flag.
   * Undefined means the city inherits the country's setting.
   */
  freeDeliveryEnabled?: boolean;
  /**
   * Express surcharge in USD for this city. Derived from OSCity.expressSurcharge
   * converted via getUsdAmount(amount, country.currency). When absent (legacy
   * OS response without the ext endpoint), resolveOsDeliveryConfig returns 0.
   */
  expressSurchargeUsd?: number;
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
let locationsDataStatus: "live" | "stale" | "fallback" = "fallback";

/** Change-detection: tracks key delivery fields across OS polls. */
let lastLocationsSignature: string | null = null;
let locationsChangedFlag = false;

// ── All-active regression tracking ─────────────────────────────────────────
//
// Detects when a country transitions from having ≥1 inactive city to having
// zero inactive cities in the same OS response cycle. This can happen when the
// OS API contract changes so that inactive cities are no longer omitted from
// the response — the "absent = inactive" supplement never fires and every city
// defaults to active. A single Slack alert is fired per country per UTC day.
//
// Key: "{COUNTRY_CODE}:{YYYY-MM-DD}" — tracks which countries have already
// had the alert sent today so we don't spam Slack on every poll.
let allActiveRegressionAlertSentKeys = new Set<string>();

// ── Express-omission tracking ───────────────────────────────────────────────
//
// Counts webhook payloads per UTC day where a city was express-enabled in the
// prior cache but omitted express_available in the incoming payload. When the
// daily count first reaches EXPRESS_OMISSION_ALERT_THRESHOLD a single Slack
// alert is fired so ops can investigate whether OS is sending partial payloads.

const EXPRESS_OMISSION_ALERT_THRESHOLD = (() => {
  const raw = Number(process.env.EXPRESS_OMISSION_ALERT_COUNT);
  if (!Number.isFinite(raw) || raw < 1) return 3;
  return Math.floor(raw);
})();

/** ISO date string (YYYY-MM-DD) of the UTC day we are currently counting. */
let expressOmissionDay: string | null = null;
/** Number of omissions recorded so far on expressOmissionDay. */
let expressOmissionCount = 0;
/** True once the Slack alert for the current day has been sent. */
let expressOmissionAlertSent = false;

/**
 * Record a single express-omission event. Resets the counter at UTC-day
 * boundaries. Sends exactly one Slack alert per UTC day when the count
 * reaches EXPRESS_OMISSION_ALERT_THRESHOLD.
 */
function recordExpressOmission(cityId: string, countryCode: string): void {
  const today = new Date().toISOString().slice(0, 10);
  if (expressOmissionDay !== today) {
    expressOmissionDay = today;
    expressOmissionCount = 0;
    expressOmissionAlertSent = false;
  }
  expressOmissionCount += 1;

  if (!expressOmissionAlertSent && expressOmissionCount >= EXPRESS_OMISSION_ALERT_THRESHOLD) {
    expressOmissionAlertSent = true;
    sendAlert({
      title: "Delivery webhook omitting express_available for express-enabled cities", // i18n-ignore
      body:
        `${expressOmissionCount} webhook payloads today omitted \`express_available\` for cities whose prior cache had \`expressAvailable=true\`. ` + // i18n-ignore
        `The prior value is being preserved automatically, but this may indicate OS is sending partial/incomplete delivery_config.updated payloads. ` + // i18n-ignore
        `Latest city: ${cityId} (${countryCode}). Check the OS webhook payload for completeness.`, // i18n-ignore
      severity: "warn",
      source: "osLocationsCache",
    }).catch(() => {
      // Swallow — Slack send failure is already logged inside sendAlert.
    });
  }
}

/** Stable digest of the fields that matter for delivery rate / availability changes. */
function locationsSignature(countries: CachedCountry[]): string {
  return JSON.stringify(
    countries.map((c) => ({
      id: c.id,
      code: c.code,
      isActive: c.isActive,
      cities: c.cities.map((city) => ({
        id: city.id,
        isActive: city.isActive,
        fee: city.fee,
        freeDeliveryThresholdUsd: city.freeDeliveryThresholdUsd,
        freeDeliveryEnabled: city.freeDeliveryEnabled,
      })),
    })),
  );
}

/**
 * Returns true (and resets the flag) when the OS delivery-locations payload
 * has changed since the last time this function was called.
 * Designed to be called once per wooSync tick.
 */
export function consumeLocationsChanged(): boolean {
  const changed = locationsChangedFlag;
  locationsChangedFlag = false;
  return changed;
}

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
 * Explicit OS slug → canonical internal city ID overrides.
 *
 * Add an entry here when OS uses a different spelling or transliteration
 * than the one in our hardcoded city list and none of the three automatic
 * resolution strategies below can match them (e.g. "dennaye" vs "dennaya").
 *
 * An entry here also implicitly fixes the display name: whenever the resolved
 * canonicalId differs from the OS slug, transformOsResponse looks up the
 * matching hardcoded city by canonicalId and uses its `name` field instead of
 * the OS-supplied name. No separate display-name override map is needed.
 */
const OS_SLUG_TO_CANONICAL_ID: Record<string, string> = {
  "minnieh-dennaye": "lb-minnieh-dennaya",
  // OS uses a different spelling for these Lebanese cities than our canonical IDs.
  "jbeil": "lb-jbeil",
  "kesserwan": "lb-kesserwan",
  "rachaya": "lb-rechaya",
};

/**
 * Resolve the canonical internal city ID from what OS returns.
 *
 * OS may store the slug as just the city name (e.g. "beirut") rather than
 * the full prefixed form we use internally ("lb-beirut"). We try four
 * strategies in order:
 *   0. Explicit override map for known OS spelling mismatches.
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
  // 0. Explicit override for known spelling mismatches between OS and our IDs
  if (osId in OS_SLUG_TO_CANONICAL_ID) return OS_SLUG_TO_CANONICAL_ID[osId]!;

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

/**
 * Strips OS time slot entries that have no cutoffHour (null or undefined).
 * The OS admin panel can produce draft/incomplete slot rows that are
 * visible via the public API but should never reach shoppers — they lack
 * the cutoff needed for the availability check and inflate the displayed
 * slot list.
 */
function filterValidOsSlots(slots: OSTimeSlot[]): OSTimeSlot[] {
  return slots.filter((s) => s.cutoffHour != null);
}

function transformOsResponse(
  resp: OSLocationsResponse,
  previousCountries?: CachedCountry[] | null,
): CachedCountry[] {
  const osCodes = new Set(resp.countries.map((c) => c.code.toUpperCase()));

  // Track the number of formerly-inactive cities that OS now returns without
  // an explicit isActive:false, per country (uppercase code → count).
  // This is the signal that OS may have stopped using the "absent = inactive"
  // convention and started including previously-disabled cities in its response.
  // Only meaningful for the non-zero-city path; absent (0 by default) for
  // the zero-city fallback paths. The regression alert fires when this count
  // is ≥1 and the prior cache had at least one inactive city.
  const formerlyInactiveByCode = new Map<string, number>();

  const fromOs: CachedCountry[] = resp.countries.map((osCountry) => {
    const code = osCountry.code.toUpperCase();
    const hardcoded = HARDCODED_BY_CODE.get(code);

    const flag = osCountry.flag ?? hardcoded?.flag ?? "";
    const currency = osCountry.currency ?? hardcoded?.currency ?? "USD";

    // When OS returns a country but with no cities (data pipeline gap or
    // not yet published to the public API), prefer the prior cached city
    // list for that country so the last-known OS active/inactive states
    // are preserved. Only fall back to hardcoded cities when there is no
    // prior cached state at all (genuine first-ever fetch). Emit a WARN
    // so ops can see the gap without needing to check the API manually.
    //
    // When OS returns 1+ cities, map them normally and then append any
    // hardcoded cities absent from the OS response as inactive (isActive:
    // false). The OS only returns active cities — a known city that OS
    // omits has been disabled in the OS admin panel and should appear
    // greyed out rather than vanishing entirely.
    // Count of formerly-inactive cities that OS now returns without isActive:false.
    // Incremented inside the per-city map below (via closure) and stored in
    // formerlyInactiveByCode after the IIFE. Used by the regression alert check.
    let _formerlyInactiveReturnedCount = 0;

    const cities: CachedCity[] = (() => {
      if (osCountry.cities.length === 0) {
        // Prefer the prior cache for this country so last-known OS
        // active/inactive states survive transient 0-city responses.
        const priorCountry = previousCountries?.find((p) => p.code === code);
        if (priorCountry && priorCountry.cities.length > 0) {
          logger.warn(
            { countryCode: code, source: "prior_cache" },
            "osLocationsCache: OS returned 0 cities for country — retaining prior cached city states until OS data recovers",
          );
          return priorCountry.cities.map((city) => ({
            ...city,
            operationsConfigVerified: false,
          }));
        }

        // No prior cache: fall back to hardcoded cities so shoppers still
        // see a picker. All hardcoded flags are used as-is (conservative
        // safe default for first-ever server start).
        if (hardcoded?.cities.length) {
          logger.warn(
            { countryCode: code, source: "hardcoded_fallback" },
            "osLocationsCache: OS returned 0 cities for country — serving hardcoded fallback cities until OS data is available",
          );
          return hardcoded.cities.map((city) => {
            const cfg = resolveDeliveryConfig(code, city.id);
            // Prefer the prior cached city's expressAvailable so a
            // transient 0-city OS response doesn't wipe a good value.
            // Falls back to false only when there is genuinely no prior
            // record (e.g. first-ever cold start with no cached data).
            const priorCity = priorCountry?.cities.find(
              (pc) => pc.id === city.id,
            );
            return {
              id: city.id,
              name: city.name,
              isActive: city.isActive,
              fee: feeForDistrict(code, city.name),
              expressAvailable: priorCity?.expressAvailable ?? true,
              expressDeliveryLabel: "",
              sameDayCutoffHour: EXPRESS_CLOSE_HOUR,
              operationsConfigVerified: false,
              timeSlots: [] as OSTimeSlot[],
              localizedNames: localizedNamesForCity(city.id),
              freeDeliveryThresholdUsd: cfg.freeDeliveryThresholdUsd,
              freeDeliveryEnabled: cfg.freeDeliveryEnabled,
            };
          });
        }
        // No cities available from any source — return empty (country
        // will appear with no picker options, which is visible to ops).
        return [];
      }

      const osCities: CachedCity[] = osCountry.cities.map((c) => {
        // Prefer slug (URL-safe string key from the ext endpoint) as the
        // OS identifier; fall back to String(id) for legacy responses.
        const osSlug = c.slug ?? String(c.id);
        // Resolve the canonical city id regardless of what slug OS uses.
        const canonicalId = resolveOsCityId(
          osSlug,
          c.name,
          code,
          hardcoded?.cities ?? [],
        );
        // Always prefer the hardcoded city's display name when a match exists.
        // This ensures canonical casing and spelling ("West Bekaa", "Zgharta",
        // etc.) regardless of how the OS API cashes them (e.g. "west bekaa").
        // Falls back to the OS-supplied name for cities not in the hardcoded
        // list (future-proofing for cities added to OS before hardcoded list).
        const hardcodedCity = (hardcoded?.cities ?? []).find(
          (hc) => hc.id === canonicalId,
        );
        const displayName = hardcodedCity?.name ?? c.name;
        if (canonicalId !== osSlug) {
          logger.debug(
            {
              osSlug,
              canonicalId,
              osCityName: c.name,
              resolvedName: displayName,
              countryCode: code,
            },
            "osLocationsCache: mapped OS city slug to canonical id",
          );
        }
        // Look up the prior cached city once so we can both preserve its
        // expressAvailable and detect incomplete payloads.
        const priorCity = previousCountries
          ?.find((p) => p.code === code)
          ?.cities.find((pc) => pc.id === canonicalId);

        // Regression signal: OS returned this city without isActive:false but
        // the prior cache had it as inactive (the sticky-inactive guard will keep
        // it inactive, but ops need to know OS stopped using the absence heuristic).
        if (c.isActive === undefined && priorCity?.isActive === false) {
          _formerlyInactiveReturnedCount++;
        }

        // Warn when a webhook payload omits express_available for a city
        // that was previously express-enabled. The prior value is preserved
        // automatically (see the expressAvailable assignment below), but ops
        // need visibility to determine whether OS is sending partial payloads
        // or the city genuinely lost express support.
        if (c.expressAvailable === undefined && priorCity?.expressAvailable === true) {
          logger.warn(
            { cityId: canonicalId, countryCode: code },
            "osLocationsCache: delivery webhook omitted express_available for an express-enabled city — retaining prior cached value (true); verify the OS delivery_config.updated payload is complete",
          );
          recordExpressOmission(canonicalId, code);
        }

        // Filter flat slots and per-day slots independently, then derive the
        // effective flat list. Some cities (e.g. Akkar) are configured with
        // slotsByDay only — the OS API may omit the flat timeSlots array
        // entirely, causing every consumer to fall through to the country-wide
        // fallback and show the wrong (larger) slot set. When the flat list is
        // empty but slotsByDay entries exist, build the effective flat list as
        // the deduplicated union of all per-day arrays (keyed by cutoffHour).
        const filteredTimeSlots = filterValidOsSlots(c.timeSlots ?? []);
        const filteredSlotsByDay = c.slotsByDay
          ? Object.fromEntries(
              Object.entries(c.slotsByDay).map(([day, slots]) => [
                day,
                filterValidOsSlots(slots),
              ]),
            )
          : undefined;
        const effectiveTimeSlots =
          filteredTimeSlots.length > 0 || !filteredSlotsByDay
            ? filteredTimeSlots
            : Object.values(filteredSlotsByDay)
                .flat()
                .filter(
                  (slot, idx, arr) =>
                    arr.findIndex((s) => s.cutoffHour === slot.cutoffHour) === idx,
                );

        // Determine the city's active/inactive status using a layered strategy
        // that is defensive against OS API contract drift:
        //
        //  1. OS explicitly sends isActive (true or false) → use it.
        //  2. OS returns the city but omits isActive (undefined):
        //       a. Prior cache had this city as inactive → stay inactive
        //          (sticky-inactive guard: prevents a regression where OS stops
        //          omitting inactive cities and returns them all without a flag
        //          from silently promoting every city to active).
        //       b. Prior cache had it as active, or no prior cache exists
        //          → fall back to hardcoded → default true (opt-in model).
        //
        // When prior cache preserves inactive state despite OS returning the
        // city, emit a WARN so ops see ambiguous active/inactive signalling.
        const resolvedIsActive = (() => {
          if (c.isActive !== undefined) return c.isActive;
          // OS omitted isActive — check prior cache for a known-inactive state.
          if (priorCity !== undefined && priorCity.isActive === false) {
            logger.warn(
              { cityId: canonicalId, countryCode: code },
              "osLocationsCache: OS returned city without isActive field but prior cache had it inactive — retaining inactive state; verify OS active/inactive signalling for this city",
            );
            return false;
          }
          // No prior evidence of inactivity. The city IS present in the OS
          // response — presence implies it is active (the "absent = inactive"
          // heuristic works in the opposite direction). Do NOT fall back to
          // hardcoded isActive here: hardcoded isActive:false values are
          // designed for the supplement path (cities absent from the OS
          // response), not for cities that OS explicitly includes.
          return true;
        })();

        return {
          id: canonicalId,
          name: displayName,
          isActive: resolvedIsActive,
          // deliveryFee is in country display currency — convert to USD.
          // Use the canonical displayName (from hardcoded list) for the fee
          // lookup so OS spelling variants (e.g. "Zghorta") still resolve to
          // the correct fee row keyed under the canonical name ("Zgharta").
          fee:
            c.deliveryFee != null
              ? getUsdAmount(c.deliveryFee, currency)
              : feeForDistrict(code, displayName),
          // When OS omits expressAvailable, check the prior cache for this
          // city before defaulting. This prevents a partial webhook
          // (e.g. slot-only or free-delivery-threshold update that omits
          // express_available) from silently turning off express delivery.
          // Fall back to false on a clean cold-start: a city with no prior
          // cache and no explicit OS field is unknown, so we conservatively
          // default to no express rather than silently enabling it. The first
          // real delivery_config.updated webhook or poll will set the correct value.
          expressAvailable:
            c.expressAvailable ??
            priorCity?.expressAvailable ??
            false,
          expressDeliveryLabel: c.expressDeliveryLabel ?? "",
          sameDayCutoffHour: c.sameDayCutoffHour ?? EXPRESS_CLOSE_HOUR,
          sameDayCutoffMinute: c.sameDayCutoffMinute ?? 0,
          operationsConfigVerified:
            c.expressAvailable !== undefined &&
            c.sameDayCutoffHour !== undefined &&
            c.operationsConfigConsistent !== false,
          // Effective flat slot list: if OS only configured slotsByDay (e.g.
          // Akkar), effectiveTimeSlots is the deduplicated per-day union so
          // todayHasSlots, firstAvailableDay, and label-matching all use the
          // correct city-specific set rather than falling back to LB defaults.
          timeSlots: effectiveTimeSlots,
          // Per-day slots — pre-filtered, used by the slot grid for day-specific rendering.
          slotsByDay: filteredSlotsByDay,
          localizedNames: localizedNamesForCity(canonicalId),
          // Per-city free-delivery settings: OS value takes precedence; fall
          // back to the hardcoded deliveryConfig entry so callers always get
          // a defined value (and freeDeliveryEnabled is never silently true
          // for cities that don't offer free delivery).
          // freeDeliveryThreshold is in country display currency — convert to USD.
          freeDeliveryThresholdUsd:
            c.freeDeliveryThreshold != null
              ? getUsdAmount(c.freeDeliveryThreshold, currency)
              : resolveDeliveryConfig(code, canonicalId).freeDeliveryThresholdUsd,
          freeDeliveryEnabled:
            c.freeDeliveryEnabled ??
            resolveDeliveryConfig(code, canonicalId).freeDeliveryEnabled,
          // Express surcharge in USD from the ext endpoint (expressSurcharge
          // is in country display currency; pipe through getUsdAmount).
          expressSurchargeUsd:
            c.expressSurcharge != null
              ? getUsdAmount(c.expressSurcharge, currency)
              : undefined,
        };
      });

      // Supplement with hardcoded cities that OS did not return.
      // The OS only includes active cities in its response, so any
      // hardcoded city absent here has been disabled in the OS admin
      // panel. Include it with isActive: false so pickers can show it
      // greyed out instead of silently hiding it from shoppers.
      const osCityIdSet = new Set(osCities.map((city) => city.id));
      const inactiveFromHardcoded: CachedCity[] = (hardcoded?.cities ?? [])
        .filter((hc) => !osCityIdSet.has(hc.id))
        .map((hc) => {
          const cfg = resolveDeliveryConfig(code, hc.id);
          logger.debug(
            { cityId: hc.id, countryCode: code },
            "osLocationsCache: city absent from OS response — serving as inactive",
          );
          return {
            id: hc.id,
            name: hc.name,
            isActive: false,
            fee: feeForDistrict(code, hc.name),
            expressAvailable: true,
            expressDeliveryLabel: "",
            sameDayCutoffHour: EXPRESS_CLOSE_HOUR,
            sameDayCutoffMinute: 0,
            operationsConfigVerified: false,
            timeSlots: [] as OSTimeSlot[],
            localizedNames: localizedNamesForCity(hc.id),
            freeDeliveryThresholdUsd: cfg.freeDeliveryThresholdUsd,
            freeDeliveryEnabled: cfg.freeDeliveryEnabled,
          };
        });

      return [...osCities, ...inactiveFromHardcoded].sort((a, b) => {
        if (a.id === "lb-beirut") return -1;
        if (b.id === "lb-beirut") return 1;
        return a.name.localeCompare(b.name, "en");
      });
    })();

    // Store the count of formerly-inactive cities OS now returns without
    // isActive:false for this country. Used by the regression alert below.
    formerlyInactiveByCode.set(code, _formerlyInactiveReturnedCount);

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
      // freeDeliveryThreshold is in country display currency — convert to USD.
      freeDeliveryThresholdUsd:
        osCountry.freeDeliveryThreshold != null
          ? getUsdAmount(osCountry.freeDeliveryThreshold, currency)
          : undefined,
      freeDeliveryEnabled: osCountry.freeDeliveryEnabled,
      cities,
    };
  });

  // Append countries entirely missing from OS. fetchOsLocations() already
  // merges the legacy /api/delivery-locations response into the primary -ext
  // response for countries the ext endpoint doesn't yet serve (e.g. Cyprus),
  // so a country only reaches this hardcoded-only path when it is absent
  // from *both* OS endpoints (a genuine outage or a country not configured
  // in OS at all).
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
      // Country not yet in OS — use hardcoded defaults.
      // Default true (opt-out model): express is on by default and only
      // disabled for cities that explicitly send expressAvailable: false.
      expressAvailable: true,
      expressDeliveryLabel: "",
      sameDayCutoffHour: EXPRESS_CLOSE_HOUR,
      operationsConfigVerified: false,
      timeSlots: [] as OSTimeSlot[],
      localizedNames: localizedNamesForCity(city.id),
    })),
  }));

  // ── All-active regression check ──────────────────────────────────────────
  // For each country we received from OS, detect whether OS has started
  // returning formerly-inactive cities without explicit isActive:false.
  // This signals that OS may have stopped using the "absent = inactive"
  // convention. We use formerlyInactiveByCode (the count of cities the
  // sticky-inactive guard handled per country) rather than counting
  // inactive cities in the result, because the sticky-inactive guard keeps
  // those cities at isActive:false even when OS returns them — so a plain
  // inactive-count comparison would never transition to zero and the alert
  // would never fire. Emit one Slack alert per country per UTC day so ops
  // can investigate before any sticky-inactive guard is relaxed.
  //
  // Only fires when there is a prior cache (previousCountries is non-null) so
  // the very first successful fetch never triggers a false alarm for genuinely
  // all-active countries (e.g. UAE/Cyprus when every city is enabled).
  if (previousCountries && previousCountries.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    for (const newCountry of fromOs) {
      const priorCountry = previousCountries.find((p) => p.code === newCountry.code);
      if (!priorCountry) continue; // New country added to OS — not a regression.

      const priorInactiveCount = priorCountry.cities.filter((c) => !c.isActive).length;
      // Count formerly-inactive cities OS now returns without isActive:false.
      // A count ≥1 means OS started including previously-disabled cities in its
      // response without marking them inactive — the regression signal.
      // When absent (zero-city fallback path), treat as no regression.
      const formerlyInactiveReturned = formerlyInactiveByCode.get(newCountry.code) ?? 0;

      if (priorInactiveCount >= 1 && formerlyInactiveReturned >= 1) {
        const alertKey = `${newCountry.code}:${today}`;
        if (!allActiveRegressionAlertSentKeys.has(alertKey)) {
          allActiveRegressionAlertSentKeys.add(alertKey);
          logger.warn(
            {
              countryCode: newCountry.code,
              priorInactiveCities: priorInactiveCount,
              totalCities: newCountry.cities.length,
            },
            "osLocationsCache: all-active regression detected — country had inactive cities but now all are active",
          );
          sendAlert({
            title: `All cities active for ${newCountry.code} — possible OS active/inactive regression`, // i18n-ignore
            body:
              `Country \`${newCountry.code}\` previously had **${priorInactiveCount}** inactive ` + // i18n-ignore
              `${priorInactiveCount === 1 ? "city" : "cities"}, but the latest OS response has all ` + // i18n-ignore
              `${newCountry.cities.length} cities marked active. ` + // i18n-ignore
              `This may indicate the OS API stopped omitting inactive cities from its response, ` + // i18n-ignore
              `causing the "absent = inactive" supplement to never fire. ` + // i18n-ignore
              `Verify \`GET /api/delivery-locations-ext\` and the \`delivery_config.updated\` webhook ` + // i18n-ignore
              `payload for explicit \`isActive: false\` flags on inactive cities.`, // i18n-ignore
            severity: "warn",
            source: "osLocationsCache",
          }).catch(() => {
            // Swallow — sendAlert already logs its own failures.
          });
        }
      }
    }
  }

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
    cities: c.cities.map((city) => {
      const cfg = resolveDeliveryConfig(c.code, city.id);
      return {
        id: city.id,
        name: city.name,
        isActive: city.isActive,
        fee: feeForDistrict(c.code, city.name),
        // OS unreachable — use hardcoded defaults.
        // Default true (opt-out model): express is on by default and only
        // disabled for cities that explicitly send expressAvailable: false.
        expressAvailable: true,
        expressDeliveryLabel: "",
        sameDayCutoffHour: EXPRESS_CLOSE_HOUR,
        operationsConfigVerified: false,
        timeSlots: [] as OSTimeSlot[],
        localizedNames: localizedNamesForCity(city.id),
        freeDeliveryThresholdUsd: cfg.freeDeliveryThresholdUsd,
        freeDeliveryEnabled: cfg.freeDeliveryEnabled,
      };
    }),
  }));
}

// ── Fetch ──────────────────────────────────────────────────────────────────

async function fetchAndStore(): Promise<void> {
  const apiKey = process.env.PRESENTAIL_OS_API_KEY ?? "";
  const baseUrl = process.env.PRESENTAIL_OS_API_URL ?? "https://os.presentail.com";

  try {
    const resp = await fetchOsLocations({ baseUrl, apiKey });
    const countries = transformOsResponse(resp, cachedCountries);
    cachedCountries = countries;
    cityIndex = buildCityIndex(countries);
    locationsDataStatus = "live";
    const sig = locationsSignature(countries);
    if (lastLocationsSignature !== null && lastLocationsSignature !== sig) {
      locationsChangedFlag = true;
    }
    lastLocationsSignature = sig;
    logger.info(
      { countryCount: countries.length, locationsChanged: locationsChangedFlag },
      "osLocationsCache: locations refreshed from Presentail OS",
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (cachedCountries !== null) {
      if (locationsDataStatus === "live") locationsDataStatus = "stale";
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
      locationsDataStatus = "fallback";
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns the cached delivery countries + cities.
 * Always returns a non-empty array (hardcoded fallback at worst).
 */
const COUNTRY_SORT_ORDER: Record<string, number> = { LB: 0, AE: 1, CY: 2 };

function sortCountries(countries: CachedCountry[]): CachedCountry[] {
  return [...countries].sort((a, b) => {
    const aOrder = COUNTRY_SORT_ORDER[a.code] ?? 99;
    const bOrder = COUNTRY_SORT_ORDER[b.code] ?? 99;
    return aOrder - bOrder;
  });
}

export function getLocations(): CachedCountry[] {
  return sortCountries(cachedCountries ?? hardcodedFallback());
}

export function getLocationsDataStatus(): "live" | "stale" | "fallback" {
  return locationsDataStatus;
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
    sameDayCutoffMinute: city.sameDayCutoffMinute,
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
 * threshold and currency, and overriding free-delivery fields from the OS.
 *
 * City-level free-delivery settings take precedence over country-level when
 * the OS has configured them for the specific city.
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

  // City-level overrides country-level; country-level overrides base defaults.
  const osCity = cityId ? cityIndex.get(cityId) : undefined;
  const osCountry = countryCode ? getCachedCountry(countryCode) : undefined;

  // Free-delivery threshold: city wins → country → keep base default.
  const threshold = osCity?.freeDeliveryThresholdUsd ?? osCountry?.freeDeliveryThresholdUsd;
  if (typeof threshold === "number") {
    result = { ...result, freeDeliveryThresholdUsd: threshold };
  }

  // Free-delivery enabled flag: city wins → country → keep base default.
  const enabled = osCity?.freeDeliveryEnabled ?? osCountry?.freeDeliveryEnabled;
  if (typeof enabled === "boolean") {
    result = { ...result, freeDeliveryEnabled: enabled };
  }

  // City delivery fee: available when a cityId is resolved in the cache.
  const cityFeeUsd = osCity !== undefined ? (osCity.fee ?? null) : null;
  result = { ...result, cityFeeUsd };

  // Express surcharge from the OS cache. When the city isn't in the cache
  // (e.g. hardcoded fallback country) or the ext endpoint hasn't sent
  // expressSurcharge yet, default to 0 — the checkout route re-verifies
  // against the OS delivery_config.updated webhook data when available.
  result = { ...result, expressSurchargeUsd: osCity?.expressSurchargeUsd ?? 0 };

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

  const countries = transformOsResponse(payload, cachedCountries);
  cachedCountries = countries;
  cityIndex = buildCityIndex(countries);
  locationsDataStatus = "live";

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

/**
 * Reset all module-level cache state back to the initial (null/empty) values.
 * For use in unit tests only — not exported in production builds via the
 * NODE_ENV guard in startOsLocationSync.
 */
export function resetCacheForTesting(): void {
  cachedCountries = null;
  cityIndex = new Map();
  locationsDataStatus = "fallback";
  lastLocationsSignature = null;
  locationsChangedFlag = false;
  expressOmissionDay = null;
  expressOmissionCount = 0;
  expressOmissionAlertSent = false;
  allActiveRegressionAlertSentKeys = new Set();
}

/**
 * Trigger a single fetch-and-store cycle. For use in unit tests only —
 * allows tests to exercise the fetchAndStore error-handling paths without
 * starting the background interval.
 */
export async function fetchAndStoreForTesting(): Promise<void> {
  return fetchAndStore();
}

/**
 * Returns the free-delivery threshold in USD for the given country code from
 * the live OS locations cache, or `undefined` when the cache has no entry for
 * that country (caller should fall back to the hardcoded per-country default).
 *
 * Safe to call at any time — returns `undefined` while the initial OS fetch is
 * still in-flight rather than blocking.
 */
export function getOsCountryFreeDeliveryThresholdUsd(
  countryCode: string,
): number | undefined {
  return cachedCountries
    ?.find((c) => c.code === countryCode.toUpperCase())
    ?.freeDeliveryThresholdUsd;
}

/**
 * Returns whether free delivery is enabled for the given country code from the
 * live OS locations cache, or `undefined` when the cache has no entry for that
 * country (caller should fall back to the hardcoded default of true).
 */
export function getOsCountryFreeDeliveryEnabled(
  countryCode: string,
): boolean | undefined {
  return cachedCountries?.find((c) => c.code === countryCode.toUpperCase())
    ?.freeDeliveryEnabled;
}

/**
 * Finds a city in the OS cache by country code and city name.
 * City name comparison is case-insensitive.
 */
function getCachedCityByName(
  countryCode: string,
  cityName: string,
): CachedCity | undefined {
  const country = getCachedCountry(countryCode);
  if (!country) return undefined;
  const lower = cityName.toLowerCase();
  return country.cities.find((c) => c.name.toLowerCase() === lower);
}

/**
 * Returns the per-city free-delivery threshold in USD from the OS cache, or
 * `undefined` when the city is absent or hasn't set a city-specific threshold
 * (caller should fall back to the country-level threshold).
 */
export function getOsCityFreeDeliveryThresholdUsd(
  countryCode: string,
  cityName: string,
): number | undefined {
  return getCachedCityByName(countryCode, cityName)?.freeDeliveryThresholdUsd;
}

/**
 * Returns the per-city free-delivery enabled flag from the OS cache, or
 * `undefined` when the city is absent or hasn't set a city-specific flag
 * (caller should fall back to the country-level flag).
 */
export function getOsCityFreeDeliveryEnabled(
  countryCode: string,
  cityName: string,
): boolean | undefined {
  return getCachedCityByName(countryCode, cityName)?.freeDeliveryEnabled;
}

/**
 * Returns the per-city delivery fee in USD from the OS cache, or `undefined`
 * when the city is absent or the cache is empty (caller should fall back to
 * the hardcoded per-district fee table).
 */
export function getOsCityDeliveryFeeUsd(
  countryCode: string,
  cityName: string,
): number | undefined {
  return getCachedCityByName(countryCode, cityName)?.fee;
}
