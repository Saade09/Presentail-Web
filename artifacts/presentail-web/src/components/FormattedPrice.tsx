import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { useFxRates } from "@/lib/queries";
import { DirhamSymbol } from "./DirhamSymbol";

function aedNumStr(usdValue: number, rates: Record<string, number>): string {
  const v = Number(usdValue) || 0;
  const rate = Number(rates["AED"] ?? 0);
  const converted = rate > 0 ? Math.round(v * rate) : Math.round(v);
  return converted.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

type Props = {
  usdValue: number;
  className?: string;
  symbolSize?: number | string;
};

/**
 * Renders a price in the visitor's active display currency.
 *
 * For AED: shows the dirham SVG glyph beside the number instead of the
 * plain "AED" text suffix. The `symbolSize` prop (default "1em") lets the
 * glyph scale with the surrounding font — no manual size tuning needed.
 *
 * For all other currencies: falls back to the formatted string from
 * `useDisplayCurrency`, wrapped in a `<span>`.
 *
 * Pass `usdValue` — the raw USD amount from the Presentail OS API. This
 * component handles the USD → display-currency FX conversion internally.
 *
 * Use `formatPrice` from `useDisplayCurrency` instead of this component
 * for non-display contexts (aria-label, document.title, analytics payloads,
 * i18n string params) where a plain string is required.
 */
export function FormattedPrice({ usdValue, className, symbolSize = "1em" }: Props) {
  const { currencyCode, formatPrice } = useDisplayCurrency();
  const { data: fxData } = useFxRates();
  const rates = (fxData?.rates ?? {}) as Record<string, number>;

  if (currencyCode === "AED") {
    const rate = Number((rates as Record<string, number>)["AED"] ?? 0);
    if (rate > 0) {
      return (
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: "0.15em" }}
          className={className}
        >
          <DirhamSymbol size={symbolSize} color="currentColor" />
          {aedNumStr(usdValue, rates)}
        </span>
      );
    }
  }

  return <span className={className}>{formatPrice(usdValue)}</span>;
}
