import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { FormattedPrice } from "./FormattedPrice";
import { DirhamSymbol } from "./DirhamSymbol";
// @ts-expect-error Root server/client shared JS module has no TS package entry.
import { isExactAedDecimal, resolveExactAedPrice } from "../../native-aed-price.mjs";

type Props = {
  priceValue: number;
  priceAed?: number | null;
  priceAedExact?: string | null;
  discountPriceValue?: number | null;
  discountPriceAed?: number | null;
  discountPriceAedExact?: string | null;
  className?: string;
  symbolSize?: number | string;
  currencyCodeOverride?: string;
};

/**
 * Returns true when there is an active discount displayable in the given currency.
 * - Non-AED: requires a USD discount (`discountPriceValue > 0`).
 * - AED: prefers native AED discount; falls back to USD discount converted via FX.
 */
export function isDiscountActive(
  currencyCode: string,
  discountPriceValue?: number | null,
  discountPriceAed?: number | null,
): boolean {
  const hasUsdDiscount = discountPriceValue != null && discountPriceValue > 0;
  const hasAedDiscount = discountPriceAed != null && discountPriceAed > 0;
  if (currencyCode === "AED") return hasAedDiscount || hasUsdDiscount;
  return hasUsdDiscount;
}

function aedFormatNum(aedValue: number): string {
  return aedValue
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Renders a product price with optional sale/discount treatment.
 *
 * When a discount is active for the visitor's currency:
 *   - Discount price is shown prominently.
 *   - Regular price is rendered with a strikethrough beside it.
 *   - For AED shoppers with `discountPriceAed`: rendered directly via DirhamSymbol
 *     (no FX conversion — the value is already in AED).
 *   - For AED shoppers without `discountPriceAed`: `discountPriceValue` is passed
 *     to FormattedPrice which converts it from USD via FX.
 *   - For all other currencies: `discountPriceValue` is converted from USD via FX.
 *
 * When no displayable discount exists for the visitor's currency, renders a plain
 * <FormattedPrice> with no visual change.
 */
export function SalePrice({
  priceValue,
  priceAed,
  priceAedExact,
  discountPriceValue,
  discountPriceAed,
  discountPriceAedExact,
  className,
  symbolSize = "0.75em",
  currencyCodeOverride,
}: Props) {
  const { currencyCode: detectedCurrencyCode } = useDisplayCurrency();
  const currencyCode = currencyCodeOverride ?? detectedCurrencyCode;

  const active = isDiscountActive(currencyCode, discountPriceValue, discountPriceAed);
  const exactAed = currencyCode === "AED"
    ? resolveExactAedPrice(priceAedExact, discountPriceAedExact)
    : null;
  const exactActive = exactAed?.sale != null;
  const useExactAed = currencyCode === "AED" && isExactAedDecimal(priceAedExact);

  if ((!active && !exactActive) || (useExactAed && !exactActive)) {
    return (
      <FormattedPrice
        usdValue={priceValue}
        priceAed={priceAed}
        priceAedExact={priceAedExact}
        className={className}
        symbolSize={symbolSize}
        currencyCodeOverride={currencyCodeOverride}
      />
    );
  }

  const regularPrice = (
    <span className="text-muted-foreground line-through text-[0.8em]">
      <FormattedPrice
        usdValue={priceValue}
        priceAed={priceAed}
        priceAedExact={priceAedExact}
        symbolSize={symbolSize}
        currencyCodeOverride={currencyCodeOverride}
      />
    </span>
  );

  if (currencyCode === "AED" && exactActive) {
    return <span className={`inline-flex items-baseline gap-2 flex-wrap ${className ?? ""}`}><span style={{ whiteSpace: "nowrap" }}><DirhamSymbol size={symbolSize} />{exactAed.sale}</span>{regularPrice}</span>;
  }
  if (currencyCode === "AED" && discountPriceAed != null && discountPriceAed > 0) {
    return (
      <span className={`inline-flex items-baseline gap-2 flex-wrap ${className ?? ""}`}>
        <span style={{ whiteSpace: "nowrap" }}>
          <DirhamSymbol size={symbolSize} />
          {aedFormatNum(discountPriceAed)}
        </span>
        {regularPrice}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-baseline gap-2 flex-wrap ${className ?? ""}`}>
      <FormattedPrice
        usdValue={discountPriceValue!}
        symbolSize={symbolSize}
        currencyCodeOverride={currencyCodeOverride}
      />
      {regularPrice}
    </span>
  );
}
