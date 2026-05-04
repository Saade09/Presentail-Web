type CurrencyConfig = {
  symbol: string;
  position: "left" | "right";
  space: boolean;
  decimals: number;
};

const STORE_CURRENCIES: Record<string, CurrencyConfig> = {
  LB: { symbol: "$", position: "left", space: false, decimals: 2 },
  AE: { symbol: "AED", position: "left", space: true, decimals: 2 },
  CY: { symbol: "€", position: "left", space: true, decimals: 2 },
};

const FALLBACK: CurrencyConfig = STORE_CURRENCIES.LB;

export function getStoreCurrency(countryCode: string | null | undefined): CurrencyConfig {
  const code = (countryCode ?? "").toUpperCase();
  return STORE_CURRENCIES[code] ?? FALLBACK;
}

export function formatStorePrice(amount: number, countryCode: string | null | undefined): string {
  const cfg = getStoreCurrency(countryCode);
  const v = Number(amount) || 0;
  const numStr = v.toFixed(cfg.decimals);
  const sep = cfg.space ? " " : "";
  return cfg.position === "left"
    ? `${cfg.symbol}${sep}${numStr}`
    : `${numStr}${sep}${cfg.symbol}`;
}
