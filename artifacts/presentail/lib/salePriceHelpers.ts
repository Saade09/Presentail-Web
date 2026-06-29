/**
 * Sale price helpers shared across FullCartView, checkout CollapsibleOrderSummary,
 * and ProductCard.
 *
 * The key branching rule:
 *   - AED shoppers: an active discount exists when EITHER discountPriceAed OR
 *     discountPriceValue is populated (the AED-native field takes priority in
 *     rendering, but USD-only discounts are also honoured so we never hide a
 *     sale from UAE shoppers).
 *   - Every other currency: only discountPriceValue (USD, FX-converted by
 *     CurrencyContext) drives the sale badge. discountPriceAed is irrelevant
 *     because CurrencyContext has no AED-native path for non-AED currencies.
 *
 * This logic must be kept in sync with the CartContext effectiveUsdPrice helper
 * which computes the numeric lineTotal — if that function changes its branching
 * the display logic here must change too.
 */

/**
 * Returns true when there is an active discount to display for the given
 * currency.  Pass the raw field values from the product/catalog object;
 * no FX conversion is performed here — that is the caller's responsibility.
 *
 * @param currencyCode  ISO-4217 code of the shopper's active display currency.
 * @param discountPriceValue  USD-based discount price (used for all non-AED currencies).
 * @param discountPriceAed    AED-native discount price (used when currencyCode === "AED").
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

// ---------------------------------------------------------------------------
// ProductCard sale price view-model
// ---------------------------------------------------------------------------

/**
 * Describes what ProductCard should render for the price area.
 *
 * When onSale is false the caller renders a single price using the regular
 * (non-discounted) unit price with no strikethrough.
 *
 * When onSale is true the caller renders two prices:
 *   1. Sale price: `saleUnitPrice` passed to <Price native={saleNative} />
 *   2. Regular price: `regularUnitPrice` passed to <Price /> with strikethrough
 *
 * ProductCard line 121–134: AED shoppers with a native AED price use the
 * `discountPriceAed` field directly (native=true, no FX conversion). All other
 * cases use `discountPriceValue` (USD, FX-converted by CurrencyContext).
 */
export type ProductCardSaleDisplay =
  | { onSale: false; regularUnitPrice: number }
  | {
      onSale: true;
      /**
       * True when saleUnitPrice is already in the active currency (AED-native)
       * and must be passed to <Price native /> with no further FX conversion.
       * False when saleUnitPrice is USD and must be FX-converted by <Price />.
       */
      saleNative: boolean;
      /** The discount unit-price to pass to <Price />. */
      saleUnitPrice: number;
      /** The non-discounted unit-price to pass to <Price /> with strikethrough styling. */
      regularUnitPrice: number;
    };

/**
 * Compute the sale price display parameters for ProductCard.
 *
 * Mirrors the rendering branch in ProductCard.tsx lines 119–147 so that the
 * logic is testable in isolation — currency changes re-evaluate the branch
 * deterministically without re-mounting the component.
 */
export function computeProductCardSaleDisplay(
  currencyCode: string,
  priceValue: number,
  discountPriceValue?: number | null,
  discountPriceAed?: number | null,
): ProductCardSaleDisplay {
  const onSale = isDiscountActive(currencyCode, discountPriceValue, discountPriceAed);
  if (!onSale) {
    return { onSale: false, regularUnitPrice: priceValue };
  }

  const isAed = currencyCode === "AED";
  const saleNative = isAed && discountPriceAed != null && discountPriceAed > 0;

  return {
    onSale: true,
    saleNative,
    saleUnitPrice: saleNative ? discountPriceAed! : (discountPriceValue ?? 0),
    regularUnitPrice: priceValue,
  };
}

// ---------------------------------------------------------------------------
// CartItemRow / CollapsibleOrderSummary sale price view-model
// ---------------------------------------------------------------------------

/**
 * Describes what CartItemRow and CollapsibleOrderSummary should render.
 *
 * Both components receive a pre-computed `lineTotal` from CartContext (always
 * USD-based, FX-converted by the <Price> component at render time) and display
 * a strikethrough `regularLineTotal = priceValue * qty` when on sale.
 *
 * "onSale" determines whether the strikethrough layout is shown; when false a
 * single price is rendered without decoration.
 */
export type CartRowSaleDisplay =
  | { onSale: false; lineTotal: number }
  | {
      onSale: true;
      /** The discounted line total (USD, FX-converted by <Price>). */
      lineTotal: number;
      /** The regular (non-discounted) line total (USD, FX-converted by <Price>) shown with strikethrough. */
      regularLineTotal: number;
    };

/**
 * Compute the sale price display parameters for CartItemRow /
 * CollapsibleOrderSummary.
 *
 * `lineTotal` is already the effective (discounted) line total in USD as
 * provided by CartContext. `priceValue` is the non-discounted unit price.
 */
export function computeCartRowSaleDisplay(
  currencyCode: string,
  priceValue: number,
  qty: number,
  lineTotal: number,
  discountPriceValue?: number | null,
  discountPriceAed?: number | null,
): CartRowSaleDisplay {
  const onSale = isDiscountActive(currencyCode, discountPriceValue, discountPriceAed);
  if (!onSale) {
    return { onSale: false, lineTotal };
  }
  return {
    onSale: true,
    lineTotal,
    regularLineTotal: priceValue * qty,
  };
}
