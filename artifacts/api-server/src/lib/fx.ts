import { logger } from "./logger";
import {
  CURRENCY_DECIMALS,
  currencyDecimals,
  roundToWholeUnit,
  toStripeMinorUnits as sharedToStripeMinorUnits,
} from "@workspace/display-currency";

export { roundToWholeUnit };

// Single source of truth for currency conversion across the server.
//
// FX rate sources (priority order):
//   1. Presentail OS public endpoint (`GET /api/public/currency-rates?workspace=…`)
//      for the currencies it manages: AED, EUR, GBP, QAR, SAR.
//      These are fetched in parallel with the open.er-api.com call below.
//   2. open.er-api.com for the remaining live currencies: CAD, AUD, CHF.
//      Also used as a full fallback if the OS fetch fails (covering all
//      currencies except LBP which is a static peg).
//   3. Embedded static fallback rates — returned when both upstreams are
//      unreachable. The fxRatesFallbackMonitor fires a Slack alert in this case.
//
// Cache TTL is 24 h for live rates (OS updates twice daily; one refresh per
// day is sufficient) and 5 min for the fallback retry so `consecutiveFailures`
// increments at most once per 5 minutes rather than per request.

export type SupportedCurrency =
  | "USD"
  | "AED"
  | "EUR"
  | "GBP"
  | "CAD"
  | "AUD"
  | "QAR"
  | "SAR"
  | "CHF"
  | "LBP";

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  "USD",
  "AED",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "QAR",
  "SAR",
  "CHF",
  "LBP",
];

// Currencies sourced from Presentail OS (primary).
const OS_CURRENCIES: SupportedCurrency[] = ["AED", "EUR", "GBP", "QAR", "SAR"];

// Currencies always sourced from open.er-api.com (OS does not provide these).
const ER_API_CURRENCIES: SupportedCurrency[] = ["CAD", "AUD", "CHF"];

// Conservative fallback if both FX upstreams are unreachable. Kept reasonably
// close to the static rates the mobile app shipped with so prices don't lurch.
// LBP: the Lebanese pound has been pegged informally at ~89,500 LBP/USD since
// the 2023 monetary reform; update if the peg shifts.
const FALLBACK_RATES: Record<SupportedCurrency, number> = {
  USD: 1,
  AED: 3.673,
  EUR: 0.92,
  GBP: 0.78,
  CAD: 1.37,
  AUD: 1.5,
  QAR: 3.64,
  SAR: 3.75,
  CHF: 0.88,
  LBP: 89_500,
};

// Number of decimals we charge in for each currency and the Stripe smallest-unit
// conversion both live in `@workspace/display-currency` — the single source of
// truth shared with the web storefront and mobile app — so the Apple Pay /
// Google Pay wallet sheet total (computed client-side) can never drift from the
// server-created PaymentIntent amount. Re-exported here for existing callers.
export { CURRENCY_DECIMALS };

type RateCache = {
  base: "USD";
  rates: Record<SupportedCurrency, number>;
  fetchedAt: number;
  source: "live" | "fallback";
};

// Cache TTL for live rates — 24 h matches the Presentail OS daily rate refresh
// cadence. Previously 6 h (open.er-api.com); one refresh per day is sufficient
// now that OS is the primary source and updates twice daily internally.
const LIVE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

// When live rates are unavailable the cache falls back to static rates.
// Rather than retrying on *every* incoming request (which would hammer
// open.er-api.com and make consecutiveFailures increment with traffic, not
// with time), we cap retries to once every 5 minutes. This makes
// consecutiveFailures a count of "refresh cycles", not "requests served".
const FALLBACK_RETRY_MS = 5 * 60 * 1000; // 5 min

let cache: RateCache = {
  base: "USD",
  rates: { ...FALLBACK_RATES },
  fetchedAt: 0,
  source: "fallback",
};
let inflight: Promise<RateCache> | null = null;

// Timestamp of the last fetch that returned live data. 0 means live rates
// have never been fetched in this process lifetime.
let lastLiveAt = 0;

// Count of consecutive refresh cycles that have returned fallback data.
// Reset to 0 when any refresh cycle returns live data.
// Because fallback results are cached for FALLBACK_RETRY_MS, this counter
// increments at most once per 5 minutes regardless of request volume.
let consecutiveFailures = 0;

export type FxStatus = {
  source: "live" | "fallback";
  fetchedAt: number;
  consecutiveFailures: number;
  /** Timestamp of the last successful live fetch; 0 if never fetched live in this process. */
  lastLiveAt: number;
};

export function getFxStatus(): FxStatus {
  return { source: cache.source, fetchedAt: cache.fetchedAt, consecutiveFailures, lastLiveAt };
}

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === "string" && (SUPPORTED_CURRENCIES as string[]).includes(value);
}

export function normalizeCurrency(value: unknown): SupportedCurrency {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (isSupportedCurrency(upper)) return upper;
  }
  return "USD";
}

/**
 * Fetch rates for OS_CURRENCIES from the Presentail OS public endpoint.
 * Returns a partial rate map on success, or rejects on failure.
 */
async function fetchOsRates(): Promise<Partial<Record<SupportedCurrency, number>>> {
  const osBaseUrl = process.env["PRESENTAIL_OS_API_URL"];
  if (!osBaseUrl) {
    throw new Error("PRESENTAIL_OS_API_URL is not set");
  }
  const workspace = process.env["PRESENTAIL_OS_WORKSPACE"] ?? "presentail";
  const url = `${osBaseUrl}/api/public/currency-rates?workspace=${encodeURIComponent(workspace)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`OS FX API HTTP ${res.status}`);
  const data = (await res.json()) as { rates?: Record<string, number> };
  if (!data.rates || typeof data.rates !== "object") {
    throw new Error("OS FX API returned no rates");
  }
  const result: Partial<Record<SupportedCurrency, number>> = {};
  for (const code of OS_CURRENCIES) {
    const r = data.rates[code];
    if (typeof r === "number" && r > 0) result[code] = r;
  }
  return result;
}

/**
 * Fetch all non-LBP rates from open.er-api.com.
 * Returns the raw rates map on success, or rejects on failure.
 */
async function fetchErApiRates(): Promise<Record<string, number>> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ER_API FX HTTP ${res.status}`);
  const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
  if (data.result !== "success" || !data.rates) {
    throw new Error("ER_API FX returned no rates");
  }
  return data.rates;
}

async function fetchLiveRates(): Promise<RateCache> {
  try {
    // Start from embedded fallback; overwrite with live values below.
    const rates: Record<SupportedCurrency, number> = { ...FALLBACK_RATES };

    // Fetch from both upstreams in parallel to minimise latency.
    const [osResult, erResult] = await Promise.allSettled([
      fetchOsRates(),
      fetchErApiRates(),
    ]);

    const osOk = osResult.status === "fulfilled";
    const erOk = erResult.status === "fulfilled";

    if (!osOk) {
      logger.warn(
        { err: (osResult as PromiseRejectedResult).reason?.message },
        "fx: Presentail OS rates fetch failed; falling back to open.er-api.com for those currencies",
      );
    }

    if (osOk) {
      // Primary path: apply OS rates for OS_CURRENCIES.
      const osRates = (osResult as PromiseFulfilledResult<Partial<Record<SupportedCurrency, number>>>).value;
      for (const code of OS_CURRENCIES) {
        const r = osRates[code];
        if (typeof r === "number" && r > 0) rates[code] = r;
      }
    }

    if (erOk) {
      const erRates = (erResult as PromiseFulfilledResult<Record<string, number>>).value;
      // Always apply ER_API rates for CAD/AUD/CHF.
      // If OS failed, also apply ER_API rates for OS_CURRENCIES as a fallback.
      const codesFromEr = osOk ? ER_API_CURRENCIES : [...OS_CURRENCIES, ...ER_API_CURRENCIES];
      for (const code of codesFromEr) {
        const r = erRates[code];
        if (typeof r === "number" && r > 0) rates[code] = r;
      }
    } else {
      logger.warn(
        { err: (erResult as PromiseRejectedResult).reason?.message },
        "fx: open.er-api.com fetch failed",
      );
      // If both sources failed, fall through to the catch path.
      if (!osOk) {
        throw (erResult as PromiseRejectedResult).reason ?? new Error("Both FX upstreams failed");
      }
      // OS succeeded but ER_API failed — CAD/AUD/CHF remain on embedded fallback values.
      // Still treat the result as "live" since the majority of rates are fresh.
    }

    rates.USD = 1;
    // LBP is always the static peg; no upstream provides it.
    rates.LBP = FALLBACK_RATES.LBP;

    consecutiveFailures = 0;
    lastLiveAt = Date.now();
    return {
      base: "USD",
      rates,
      fetchedAt: Date.now(),
      source: "live",
    };
  } catch (err: any) {
    consecutiveFailures += 1;
    logger.warn(
      { err: err?.message, consecutiveFailures },
      "fx: failed to fetch live rates from all sources, using fallback",
    );
    return {
      base: "USD",
      rates: { ...FALLBACK_RATES },
      fetchedAt: Date.now(),
      source: "fallback",
    };
  }
}

export async function getRates(): Promise<RateCache> {
  // Live rates are fresh for LIVE_TTL_MS; fallback results are cached for
  // FALLBACK_RETRY_MS so we don't retry on every request (see above).
  const ttl = cache.source === "live" ? LIVE_TTL_MS : FALLBACK_RETRY_MS;
  const fresh = Date.now() - cache.fetchedAt < ttl;
  if (fresh) return cache;
  if (!inflight) {
    inflight = fetchLiveRates().then((next) => {
      cache = next;
      inflight = null;
      return next;
    });
  }
  return inflight;
}

export async function getRate(currency: SupportedCurrency): Promise<number> {
  const c = await getRates();
  return c.rates[currency] ?? 1;
}

/** Convert a USD amount into the target currency using live rates. */
export async function convertFromUsd(
  usdAmount: number,
  currency: SupportedCurrency,
): Promise<number> {
  const rate = await getRate(currency);
  return Number(usdAmount) * rate;
}

/** Round a converted amount to the currency's display decimals. */
export function roundForCurrency(amount: number, currency: SupportedCurrency): number {
  const decimals = currencyDecimals(currency);
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor) / factor;
}

/**
 * Convert a USD amount into the smallest unit Stripe expects for the given
 * currency. Delegates to the shared `@workspace/display-currency` helper so the
 * server and clients use identical rounding (LBP 0-decimal, standard 2-decimal).
 */
export function toStripeMinorUnits(
  convertedAmount: number,
  currency: SupportedCurrency,
): number {
  return sharedToStripeMinorUnits(convertedAmount, currency);
}

// PayPal supports a fixed list of presentment currencies. Anything outside
// this set has to fall back to USD so the order can still be created.
const PAYPAL_SUPPORTED: SupportedCurrency[] = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF"];

export function paypalCurrencyFor(currency: SupportedCurrency): SupportedCurrency {
  return PAYPAL_SUPPORTED.includes(currency) ? currency : "USD";
}
