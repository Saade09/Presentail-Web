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
  | "CHF"
  | "SEK"
  | "DKK";

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
  {
    code: "SEK",
    name: "Swedish krona",
    flag: "🇸🇪",
    symbol: "kr",
    symbolPosition: "left",
    spaceBetween: true,
    rate: 9.242,
    decimals: 0,
  },
  {
    code: "DKK",
    name: "Danish krone",
    flag: "🇩🇰",
    symbol: "kr",
    symbolPosition: "left",
    spaceBetween: true,
    rate: 8.391,
    decimals: 0,
  },
];

export function getCurrency(code: CurrencyCode): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}
