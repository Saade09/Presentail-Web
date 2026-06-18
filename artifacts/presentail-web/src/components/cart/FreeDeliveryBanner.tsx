import React from "react";
import { Truck } from "lucide-react";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { FormattedPrice } from "@/components/FormattedPrice";
import { useLocale } from "@/contexts/LocaleContext";

type Props = {
  className?: string;
  /**
   * When provided, renders a dynamic progress banner showing how much more the
   * shopper needs to add (or a celebratory unlocked message). When omitted,
   * falls back to the static "Free delivery on orders above X" message.
   */
  subtotal?: number;
  /**
   * When provided, overrides the threshold amount from useDeliveryConfig with
   * the per-city value. Pass the raw USD amount; the banner converts it to the
   * visitor's selected display currency via formatPrice.
   */
  overrideThresholdUsd?: number;
};

function parseThresholdAmount(label: string): number {
  const match = label.match(/[\d.,]+/);
  if (!match) return Number.NaN;
  return parseFloat(match[0].replace(/,/g, ""));
}

export function FreeDeliveryBanner({ className, subtotal, overrideThresholdUsd }: Props) {
  const { t } = useLocale();
  const { freeDeliveryThreshold, expressDeliveryTimeLabel } =
    useDeliveryConfig();

  // When the caller provides an explicit city-level threshold (USD), use it;
  // otherwise fall back to the formatted string from useDeliveryConfig.
  const effectiveThresholdAmount =
    typeof overrideThresholdUsd === "number" && overrideThresholdUsd > 0
      ? overrideThresholdUsd
      : parseThresholdAmount(freeDeliveryThreshold);
  // For the display label: when we have a raw USD value, convert it to the
  // visitor's display currency. Otherwise fall back to the pre-formatted string
  // from useDeliveryConfig (no raw USD available to convert).
  const effectiveThresholdLabel: React.ReactNode =
    typeof overrideThresholdUsd === "number" && overrideThresholdUsd > 0
      ? <FormattedPrice usdValue={overrideThresholdUsd} />
      : freeDeliveryThreshold;

  const showProgress = typeof subtotal === "number" && subtotal >= 0;
  const thresholdAmount = effectiveThresholdAmount;
  const hasThreshold = Number.isFinite(thresholdAmount) && thresholdAmount > 0;

  // Progress math stays in USD — subtotal and thresholdAmount are both USD.
  const remaining = showProgress && hasThreshold
    ? Math.max(thresholdAmount - subtotal!, 0)
    : 0;
  const unlocked = showProgress && hasThreshold && subtotal! >= thresholdAmount;
  const progressPct = showProgress && hasThreshold
    ? Math.min((subtotal! / thresholdAmount) * 100, 100)
    : 0;

  return (
    <div
      data-testid="free-delivery-banner"
      className={`flex items-center gap-3 rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3 ${className ?? ""}`}
    >
      <span className="w-9 h-9 rounded-full bg-secondary/40 flex items-center justify-center text-primary shrink-0">
        <Truck className="w-4 h-4" />
      </span>
      <div className="min-w-0 text-xs flex-1">
        {showProgress && hasThreshold ? (
          <>
            <p className="font-semibold text-foreground">
              {unlocked
                ? t("cart.banner.unlocked")
                : <>{t("cart.banner.remaining.prefix")} <FormattedPrice usdValue={remaining} /> {t("cart.banner.remaining.suffix")}</>}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#d97706] transition-[width] duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="font-semibold text-foreground text-[11px] shrink-0">
                <FormattedPrice usdValue={subtotal!} />
              </span>
            </div>
          </>
        ) : (
          <>
            <p className="font-semibold text-foreground">
              {t("cart.banner.staticAbove")} {effectiveThresholdLabel}
            </p>
            <p className="text-muted-foreground mt-0.5">
              {expressDeliveryTimeLabel} {t("cart.banner.withExpress")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
