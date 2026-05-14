// Display formatting for currencies, backed by a runtime snapshot
// populated from the API's `/currencies` endpoint at app boot.

type CurrencyConfig = {
  symbol: string;
  position: "left" | "right";
  space: boolean;
  decimals: number;
};

export type CurrencySnapshotItem = {
  code: string;
  name: string;
  symbol: string;
  symbolPosition: "left" | "right";
  spaceBetween: boolean;
  decimals: number;
};

export type CurrencySnapshot = {
  currencies: CurrencySnapshotItem[];
  fallbackCode: string;
  countryToCurrency: Record<string, string>;
};

const WEB_DECIMAL_OVERRIDES: Record<string, number> = {
  KWD: 3,
  OMR: 3,
};

const FALLBACK_SNAPSHOT: CurrencySnapshot = {
  currencies: [
    {
      code: "USD",
      name: "United States dollar",
      symbol: "$",
      symbolPosition: "left",
      spaceBetween: false,
      decimals: 2,
    },
  ],
  fallbackCode: "USD",
  countryToCurrency: {},
};

let snapshot: CurrencySnapshot = FALLBACK_SNAPSHOT;
let formatTable: Record<string, CurrencyConfig> = buildFormatTable(snapshot);
const listeners = new Set<() => void>();

function buildFormatTable(snap: CurrencySnapshot): Record<string, CurrencyConfig> {
  const out: Record<string, CurrencyConfig> = {};
  for (const c of snap.currencies) {
    out[c.code] = {
      symbol: c.symbol,
      position: c.symbolPosition,
      space: c.spaceBetween,
      decimals: WEB_DECIMAL_OVERRIDES[c.code] ?? 2,
    };
  }
  return out;
}

export function setCurrencySnapshot(next: CurrencySnapshot): void {
  snapshot = next;
  formatTable = buildFormatTable(next);
  for (const fn of listeners) fn();
}

export function getCurrencySnapshot(): CurrencySnapshot {
  return snapshot;
}

export function subscribeCurrencySnapshot(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const STORE_COUNTRY_CODES = ["LB", "AE", "CY"] as const;
function storeNativeCurrencyFor(country: string): string {
  return snapshot.countryToCurrency[country] ?? snapshot.fallbackCode;
}

export function currencyForStoreCountry(
  countryCode: string | null | undefined,
): string {
  const code = (countryCode ?? "").toUpperCase();
  if (!STORE_COUNTRY_CODES.includes(code as (typeof STORE_COUNTRY_CODES)[number])) {
    return snapshot.fallbackCode;
  }
  return storeNativeCurrencyFor(code);
}

function configFor(currencyCode: string | null | undefined): CurrencyConfig {
  const code = (currencyCode ?? "").toUpperCase();
  return formatTable[code] ?? formatTable[snapshot.fallbackCode] ?? {
    symbol: "$",
    position: "left",
    space: false,
    decimals: 2,
  };
}

export function formatPriceInCurrency(
  amount: number,
  currencyCode: string | null | undefined,
): string {
  const cfg = configFor(currencyCode);
  const v = Number(amount) || 0;
  const numStr = v.toFixed(cfg.decimals).replace(/\.0+$/, "");
  const sep = cfg.space ? " " : "";
  return cfg.position === "left"
    ? `${cfg.symbol}${sep}${numStr}`
    : `${numStr}${sep}${cfg.symbol}`;
}

/**
 * Format a price expressed in the active store's currency using the symbol
 * and decimal layout for the supplied delivery `countryCode`. Kept for
 * components that only know the country (e.g. checkout totals derived
 * from the WooCommerce store currency).
 */
export function formatStorePrice(
  amount: number,
  countryCode: string | null | undefined,
): string {
  return formatPriceInCurrency(amount, currencyForStoreCountry(countryCode));
}
