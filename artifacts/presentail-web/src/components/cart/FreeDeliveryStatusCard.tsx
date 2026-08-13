import React from "react";
import { Truck, Check } from "lucide-react";
import { FormattedPrice } from "@/components/FormattedPrice";
import { useLocale } from "@/contexts/LocaleContext";

/**
 * Contextual three-state free-delivery component for the cart page.
 *
 * hidden   → cart is far from the threshold, config not loaded, free delivery
 *            disabled, or express delivery selected. Renders nothing (no
 *            reserved space).
 * close    → remaining amount is > 0 and ≤ CLOSE_RANGE_PCT of the threshold.
 *            Compact progress prompt with a "Shop add-ons" secondary action.
 * unlocked → qualifying subtotal ≥ threshold. Restrained success card.
 */
export type FreeDeliveryState = "hidden" | "close" | "unlocked";

/**
 * Close-range percentage: the progress prompt appears only when the remaining
 * qualifying amount is ≤ this fraction of the active threshold. Single tuning
 * lever — adjust here after testing (spec default 25%).
 */
export const FREE_DELIVERY_CLOSE_RANGE_PCT = 0.25;

export function resolveFreeDeliveryState(args: {
  /** Qualifying merchandise subtotal in USD. */
  subtotalUsd: number;
  /** Active free-delivery threshold in USD (server-driven). */
  thresholdUsd: number | undefined;
  /** Market/config free-delivery enabled flag. */
  enabled: boolean | undefined;
  /** True once the delivery-config query resolved with real server data. */
  configLoaded: boolean;
  /** Currently selected delivery mode; hidden while express is selected. */
  deliveryMode: string | null;
  /** Close-range fraction of the threshold (default FREE_DELIVERY_CLOSE_RANGE_PCT). */
  closeRangePct?: number;
}): FreeDeliveryState {
  const {
    subtotalUsd,
    thresholdUsd,
    enabled,
    configLoaded,
    deliveryMode,
    closeRangePct = FREE_DELIVERY_CLOSE_RANGE_PCT,
  } = args;
  // Fail safe to hidden: config not loaded yet / eligibility unknown / disabled.
  if (!configLoaded) return "hidden";
  if (enabled === false) return "hidden";
  if (typeof thresholdUsd !== "number" || !Number.isFinite(thresholdUsd) || thresholdUsd <= 0) {
    return "hidden";
  }
  if (deliveryMode === "express") return "hidden";
  if (!Number.isFinite(subtotalUsd) || subtotalUsd < 0) return "hidden";
  if (subtotalUsd >= thresholdUsd) return "unlocked";
  const remaining = thresholdUsd - subtotalUsd;
  if (remaining <= thresholdUsd * closeRangePct) return "close";
  return "hidden";
}

/** Splits a translation string on the `{amount}` placeholder and renders a
 * FormattedPrice component in its place. Falls back gracefully when the
 * placeholder is absent. */
function AmountText({ template, usdValue }: { template: string; usdValue: number }) {
  const parts = template.split("{amount}");
  if (parts.length === 1) {
    return <>{template} <FormattedPrice usdValue={usdValue} /></>;
  }
  return (
    <>
      {parts[0]}
      <FormattedPrice usdValue={usdValue} />
      {parts[1]}
    </>
  );
}

type Props = {
  state: FreeDeliveryState;
  /** Qualifying subtotal in USD. */
  subtotalUsd: number;
  /** Active threshold in USD. */
  thresholdUsd: number;
  /** Standard-delivery charge removed when unlocked (USD). Null/unknown → fallback copy. */
  standardFeeUsd?: number | null;
  /** Called when the shopper clicks "Shop add-ons". Action hidden when omitted. */
  onShopAddons?: () => void;
  className?: string;
};

export function FreeDeliveryStatusCard({
  state,
  subtotalUsd,
  thresholdUsd,
  standardFeeUsd,
  onShopAddons,
  className,
}: Props) {
  const { t } = useLocale();

  if (state === "hidden") return null;

  if (state === "unlocked") {
    return (
      <div
        data-testid="free-delivery-banner"
        data-state="unlocked"
        className={`flex items-center gap-3 rounded-2xl bg-white border border-primary/20 shadow-sm px-4 py-3 ${className ?? ""}`}
      >
        <span
          aria-hidden="true"
          className="shrink-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center"
        >
          <Check className="w-3.5 h-3.5 text-white" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug" data-testid="text-free-delivery-headline">
            {t("cart.banner.unlockedTitle")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug" data-testid="text-free-delivery-saving">
            {typeof standardFeeUsd === "number" && standardFeeUsd > 0 ? (
              <AmountText template={t("cart.banner.chargeRemoved")} usdValue={standardFeeUsd} />
            ) : (
              t("cart.banner.nowFree")
            )}
          </p>
        </div>
      </div>
    );
  }

  // Close state — compact progress prompt.
  const remaining = Math.max(thresholdUsd - subtotalUsd, 0);
  const progressPct = Math.min((subtotalUsd / thresholdUsd) * 100, 100);

  return (
    <div
      data-testid="free-delivery-banner"
      data-state="close"
      className={`rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Truck className="w-[18px] h-[18px] text-primary shrink-0" aria-hidden="true" />
        <p
          className="text-sm font-semibold text-foreground leading-snug flex-1 min-w-0 basis-52"
          data-testid="text-free-delivery-headline"
        >
          <AmountText template={t("cart.banner.addMore")} usdValue={remaining} />
        </p>
        {onShopAddons && (
          <button
            type="button"
            onClick={onShopAddons}
            className="shrink-0 min-h-[44px] -my-2 text-xs font-medium text-primary underline underline-offset-2 hover:opacity-75 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
            data-testid="button-shop-addons"
          >
            {t("cart.banner.shopAddons")}
          </button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={t("cart.banner.progressAria")}
        aria-valuemin={0}
        aria-valuenow={Math.round(subtotalUsd)}
        aria-valuemax={Math.round(thresholdUsd)}
        className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-[#d97706] motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground">
        <span data-testid="text-free-delivery-current">
          <FormattedPrice usdValue={subtotalUsd} />
        </span>
        <span data-testid="text-free-delivery-goal">
          <FormattedPrice usdValue={thresholdUsd} /> {t("cart.banner.goal")}
        </span>
      </div>
    </div>
  );
}
