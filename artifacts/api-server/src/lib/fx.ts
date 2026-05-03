import { logger } from "./logger";

// Single source of truth for currency conversion across the server.
//
// We convert all monetary amounts received from the app (which prices its
// catalogue in USD) into the customer-facing currency *server-side* so that
// what the user sees is what they get charged. Live FX rates are fetched
// from the free open.er-api.com endpoint with a 6h TTL and an embedded
// fallback for the cold-start / offline case.

export type SupportedCurrency =
  | "USD"
  | "AED"
  | "EUR"
  | "GBP"
  | "CAD"
  | "AUD"
  | "QAR"
  | "SAR"
  | "KWD"
  | "OMR"
  | "CHF";

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  "USD",
  "AED",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "QAR",
  "SAR",
  "KWD",
  "OMR",
  "CHF",
];

// Conservative fallback if the FX API is unreachable. Kept reasonably close
// to the static rates the mobile app shipped with so prices don't lurch.
const FALLBACK_RATES: Record<SupportedCurrency, number> = {
  USD: 1,
  AED: 3.673,
  EUR: 0.92,
  GBP: 0.78,
  CAD: 1.37,
  AUD: 1.5,
  QAR: 3.64,
  SAR: 3.75,
  KWD: 0.307,
  OMR: 0.384,
  CHF: 0.88,
};

// Number of decimals we charge in for each currency. Mirrors the WC display
// convention and matches Stripe's smallest-unit handling below.
export const CURRENCY_DECIMALS: Record<SupportedCurrency, number> = {
  USD: 2,
  AED: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  QAR: 2,
  SAR: 2,
  KWD: 3,
  OMR: 3,
  CHF: 2,
};

type RateCache = {
  base: "USD";
  rates: Record<SupportedCurrency, number>;
  fetchedAt: number;
  source: "live" | "fallback";
};

const TTL_MS = 6 * 60 * 60 * 1000; // 6h

let cache: RateCache = {
  base: "USD",
  rates: { ...FALLBACK_RATES },
  fetchedAt: 0,
  source: "fallback",
};
let inflight: Promise<RateCache> | null = null;

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

async function fetchLiveRates(): Promise<RateCache> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`FX API HTTP ${res.status}`);
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== "success" || !data.rates) {
      throw new Error("FX API returned no rates");
    }
    const rates = { ...FALLBACK_RATES };
    for (const code of SUPPORTED_CURRENCIES) {
      const r = data.rates[code];
      if (typeof r === "number" && r > 0) rates[code] = r;
    }
    rates.USD = 1;
    return {
      base: "USD",
      rates,
      fetchedAt: Date.now(),
      source: "live",
    };
  } catch (err: any) {
    logger.warn({ err: err?.message }, "fx: failed to fetch live rates, using fallback");
    return {
      base: "USD",
      rates: { ...FALLBACK_RATES },
      fetchedAt: Date.now(),
      source: "fallback",
    };
  }
}

export async function getRates(): Promise<RateCache> {
  const fresh = Date.now() - cache.fetchedAt < TTL_MS && cache.source === "live";
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
  const decimals = CURRENCY_DECIMALS[currency];
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor) / factor;
}

/**
 * Convert a USD amount into the smallest unit Stripe expects for the given
 * currency. Handles three-decimal currencies (KWD/OMR) which must be rounded
 * to the nearest 10 minor units per Stripe's rules.
 */
export function toStripeMinorUnits(
  convertedAmount: number,
  currency: SupportedCurrency,
): number {
  const decimals = CURRENCY_DECIMALS[currency];
  if (decimals === 3) {
    // Stripe requires three-decimal currencies to be rounded to nearest 10.
    const minor = Math.round(convertedAmount * 1000);
    return Math.round(minor / 10) * 10;
  }
  if (decimals === 0) {
    return Math.round(convertedAmount);
  }
  return Math.round(convertedAmount * 100);
}

// PayPal supports a fixed list of presentment currencies. Anything outside
// this set has to fall back to USD so the order can still be created.
const PAYPAL_SUPPORTED: SupportedCurrency[] = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF"];

export function paypalCurrencyFor(currency: SupportedCurrency): SupportedCurrency {
  return PAYPAL_SUPPORTED.includes(currency) ? currency : "USD";
}
