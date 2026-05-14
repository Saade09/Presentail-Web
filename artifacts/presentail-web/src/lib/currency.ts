type CurrencyConfig = {
  symbol: string;
  position: "left" | "right";
  space: boolean;
  decimals: number;
};

// Display formatting per ISO 4217 currency code. Mirrors the symbol/decimals
// table the mobile app uses in `data/currencies.ts` so the same currency
// looks identical on web and mobile. Anything not listed here falls back to
// USD formatting (which is also the safe global default the IP-based
// detector returns when it can't map a country).
const CURRENCY_FORMAT: Record<string, CurrencyConfig> = {
  USD: { symbol: "$", position: "left", space: false, decimals: 2 },
  AED: { symbol: "AED", position: "left", space: true, decimals: 2 },
  EUR: { symbol: "€", position: "left", space: true, decimals: 2 },
  GBP: { symbol: "£", position: "left", space: false, decimals: 2 },
  CAD: { symbol: "CAD", position: "left", space: true, decimals: 2 },
  AUD: { symbol: "AUD", position: "left", space: true, decimals: 2 },
  QAR: { symbol: "QAR", position: "left", space: true, decimals: 2 },
  SAR: { symbol: "SAR", position: "left", space: true, decimals: 2 },
  KWD: { symbol: "KWD", position: "left", space: true, decimals: 3 },
  OMR: { symbol: "OMR", position: "left", space: true, decimals: 3 },
  CHF: { symbol: "CHF", position: "left", space: true, decimals: 2 },
};

// Per-store native currency, used when the visitor has explicitly picked a
// delivery country (so checkout, cart and storefront all stay denominated in
// the currency of that store).
const STORE_NATIVE_CURRENCY: Record<string, string> = {
  LB: "USD",
  AE: "AED",
  CY: "EUR",
};

const FALLBACK_CURRENCY = "USD";

export function currencyForStoreCountry(
  countryCode: string | null | undefined,
): string {
  const code = (countryCode ?? "").toUpperCase();
  return STORE_NATIVE_CURRENCY[code] ?? FALLBACK_CURRENCY;
}

function configFor(currencyCode: string | null | undefined): CurrencyConfig {
  const code = (currencyCode ?? "").toUpperCase();
  return CURRENCY_FORMAT[code] ?? CURRENCY_FORMAT[FALLBACK_CURRENCY];
}

export function formatPriceInCurrency(
  amount: number,
  currencyCode: string | null | undefined,
): string {
  const cfg = configFor(currencyCode);
  const v = Number(amount) || 0;
  const rawNumStr = v.toFixed(cfg.decimals);
  // Display-only: strip a trailing all-zero decimal block (e.g. ".00", ".000")
  // so whole-currency amounts render as "$175" / "AED 80" / "KWD 1" instead
  // of "$175.00" / "AED 80.00" / "KWD 1.000". Non-zero fractional digits are
  // preserved verbatim ($12.50 stays $12.50, KWD 1.234 stays KWD 1.234).
  const numStr = rawNumStr.replace(/\.0+$/, "");
  const sep = cfg.space ? " " : "";
  return cfg.position === "left"
    ? `${cfg.symbol}${sep}${numStr}`
    : `${numStr}${sep}${cfg.symbol}`;
}

/**
 * Format a price expressed in the active store's currency using the symbol
 * and decimal layout for the supplied delivery `countryCode`. Kept for
 * components that only know the country (e.g. checkout totals derived from
 * the WooCommerce store currency).
 */
export function formatStorePrice(
  amount: number,
  countryCode: string | null | undefined,
): string {
  return formatPriceInCurrency(amount, currencyForStoreCountry(countryCode));
}
