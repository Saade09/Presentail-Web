export type CurrencyCode =
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

export type Currency = {
  code: CurrencyCode;
  name: string;
  flag: string;
  symbol: string;
  symbolPosition: "left" | "right";
  spaceBetween: boolean;
  rate: number;
  decimals: number;
};

export const FALLBACK_CURRENCY_CODE: CurrencyCode = "USD";

export const CURRENCIES: Currency[] = [
  {
    code: "USD",
    name: "United States (US) dollar",
    flag: "🇺🇸",
    symbol: "$",
    symbolPosition: "left",
    spaceBetween: false,
    rate: 1,
    decimals: 0,
  },
  {
    code: "AED",
    name: "United Arab Emirates dirham",
    flag: "🇦🇪",
    symbol: "AED",
    symbolPosition: "left",
    spaceBetween: true,
    rate: 3.673,
    decimals: 0,
  },
  {
    code: "EUR",
    name: "Euro",
    flag: "🇪🇺",
    symbol: "€",
    symbolPosition: "left",
    spaceBetween: true,
    rate: 0.855,
    decimals: 0,
  },
  {
    code: "GBP",
    name: "Pound sterling",
    flag: "🇬🇧",
    symbol: "£",
    symbolPosition: "left",
    spaceBetween: false,
    rate: 0.741,
    decimals: 0,
  },
  {
    code: "CAD",
    name: "Canadian dollar",
    flag: "🇨🇦",
    symbol: "CAD",
    symbolPosition: "left",
    spaceBetween: true,
    rate: 1.388,
    decimals: 0,
  },
  {
    code: "AUD",
    name: "Australian dollar",
    flag: "🇦🇺",
    symbol: "AUD",
    symbolPosition: "left",
    spaceBetween: true,
    rate: 1.399,
    decimals: 0,
  },
  {
    code: "QAR",
    name: "Qatari riyal",
    flag: "🇶🇦",
    symbol: "QAR",
    symbolPosition: "left",
    spaceBetween: true,
    rate: 3.648,
    decimals: 0,
  },
  {
    code: "SAR",
    name: "Saudi riyal",
    flag: "🇸🇦",
    symbol: "SAR",
    symbolPosition: "left",
    spaceBetween: true,
    rate: 3.751,
    decimals: 0,
  },
  {
    code: "KWD",
    name: "Kuwaiti dinar",
    flag: "🇰🇼",
    symbol: "KWD",
    symbolPosition: "left",
    spaceBetween: true,
    rate: 0.305,
    decimals: 2,
  },
  {
    code: "OMR",
    name: "Omani rial",
    flag: "🇴🇲",
    symbol: "OMR",
    symbolPosition: "left",
    spaceBetween: true,
    rate: 0.384,
    decimals: 2,
  },
  {
    code: "CHF",
    name: "Swiss franc",
    flag: "🇨🇭",
    symbol: "CHF",
    symbolPosition: "left",
    spaceBetween: true,
    rate: 0.785,
    decimals: 0,
  },
];

export function getCurrency(code: CurrencyCode): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

/**
 * Replace the in-memory FX rates with values from the server. The static
 * `rate` values above act only as a cold-start fallback — actual conversion
 * (both for display and for charging) is anchored on the same live rates the
 * server uses, so what the customer sees in-app matches what they're charged
 * by Stripe / Mamo / PayPal / WooCommerce.
 */
export function applyFxRates(rates: Partial<Record<CurrencyCode, number>>): void {
  for (const c of CURRENCIES) {
    const r = rates[c.code];
    if (typeof r === "number" && r > 0) c.rate = r;
  }
}

export function isSupportedCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && CURRENCIES.some((c) => c.code === value);
}

export const COUNTRY_TO_CURRENCY_MAP: Record<string, CurrencyCode> = {
  AE: "AED",
  US: "USD",
  GB: "GBP",
  IM: "GBP",
  JE: "GBP",
  GG: "GBP",
  CA: "CAD",
  AU: "AUD",
  QA: "QAR",
  SA: "SAR",
  KW: "KWD",
  OM: "OMR",
  CH: "CHF",
  LI: "CHF",
  // Eurozone
  AT: "EUR",
  BE: "EUR",
  CY: "EUR",
  DE: "EUR",
  EE: "EUR",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  GR: "EUR",
  HR: "EUR",
  IE: "EUR",
  IT: "EUR",
  LT: "EUR",
  LU: "EUR",
  LV: "EUR",
  MT: "EUR",
  NL: "EUR",
  PT: "EUR",
  SI: "EUR",
  SK: "EUR",
  AD: "EUR",
  MC: "EUR",
  SM: "EUR",
  VA: "EUR",
  ME: "EUR",
  XK: "EUR",
};

export function currencyForCountry(countryCode: string | null | undefined): CurrencyCode {
  if (!countryCode) return FALLBACK_CURRENCY_CODE;
  const upper = countryCode.trim().toUpperCase();
  return COUNTRY_TO_CURRENCY_MAP[upper] ?? FALLBACK_CURRENCY_CODE;
}
