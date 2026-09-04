import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { useFxRates } from "@/lib/queries";
import { DirhamSymbol } from "./DirhamSymbol";
import { RiyalSymbol } from "./RiyalSymbol";
import { roundToNearestFive } from "@workspace/display-currency";
// @ts-expect-error Root server/client shared JS module has no TS package entry.
import { isExactAedDecimal } from "../../native-aed-price.mjs";

function aedNumStr(usdValue: number, rates: Record<string, number>): string {
  const v = Number(usdValue) || 0;
  const rate = Number(rates["AED"] ?? 0);
  const converted = rate > 0 ? roundToNearestFive(v * rate, "AED") : roundToNearestFive(v, "AED");
  return converted.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function sarNumStr(usdValue: number, rates: Record<string, number>): string {
  const v = Number(usdValue) || 0;
  const rate = Number(rates["SAR"] ?? 0);
  const converted = rate > 0 ? roundToNearestFive(v * rate, "SAR") : roundToNearestFive(v, "SAR");
  return converted.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

type Props = {
  usdValue: number;
  /** OS-native AED regular price, used exactly when AED is active. */
  priceAed?: number | null;
  priceAedExact?: string | null;
  className?: string;
  symbolSize?: number | string;
  currencyCodeOverride?: string;
};

/**
 * Renders a price in the visitor's active display currency.
 *
 * For AED: shows the dirham SVG symbol beside the number instead of the
 * plain "AED" text suffix. The `symbolSize` prop (default "1em") lets the
 * symbol scale with the surrounding font — no manual size tuning needed.
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
export function FormattedPrice({
  usdValue,
  priceAed,
  priceAedExact,
  className,
  symbolSize = "0.75em",
  currencyCodeOverride,
}: Props) {
  const { currencyCode: detectedCurrencyCode, formatPrice } = useDisplayCurrency();
  const currencyCode = currencyCodeOverride ?? detectedCurrencyCode;
  const { data: fxData } = useFxRates();
  const rates = (fxData?.rates ?? {}) as Record<string, number>;

  if (currencyCode === "AED") {
    if (isExactAedDecimal(priceAedExact)) {
      return <span style={{ whiteSpace: "nowrap" }} className={className}><DirhamSymbol size={symbolSize} />{priceAedExact}</span>;
    }
    if (priceAed != null && priceAed > 0) {
      return (
        <span style={{ whiteSpace: "nowrap" }} className={className}>
          <DirhamSymbol size={symbolSize} />
          {priceAed.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
        </span>
      );
    }
    const rate = Number((rates as Record<string, number>)["AED"] ?? 0);
    if (rate > 0) {
      return (
        <span style={{ whiteSpace: "nowrap" }} className={className}>
          <DirhamSymbol size={symbolSize} />
          {aedNumStr(usdValue, rates)}
        </span>
      );
    }
  }

  if (currencyCode === "SAR") {
    const rate = Number((rates as Record<string, number>)["SAR"] ?? 0);
    if (rate > 0) {
      return (
        <span style={{ whiteSpace: "nowrap" }} className={className}>
          <RiyalSymbol size={symbolSize} />
          {sarNumStr(usdValue, rates)}
        </span>
      );
    }
  }

  return <span style={{ whiteSpace: "nowrap" }} className={className}>{formatPrice(usdValue)}</span>;
}
