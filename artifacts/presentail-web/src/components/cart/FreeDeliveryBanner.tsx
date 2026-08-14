import React from "react";
import { Truck, Check } from "lucide-react";
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
  /**
   * When true and the threshold is met, renders a compact success banner
   * ("Free standard delivery unlocked" / "Express delivery is also
   * available") with no completed progress bar or goal labels. Below the
   * threshold, the normal progress behavior is preserved.
   */
  compactUnlocked?: boolean;
};

function parseThresholdAmount(label: string): number {
  const match = label.match(/[\d.,]+/);
  if (!match) return Number.NaN;
  return parseFloat(match[0].replace(/,/g, ""));
}

/** Splits a translation string on the `{amount}` placeholder and renders a
 * FormattedPrice component in its place. Falls back gracefully when the
 * placeholder is absent. */
function RemainingText({ template, usdValue }: { template: string; usdValue: number }) {
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

export function FreeDeliveryBanner({ className, subtotal, overrideThresholdUsd, compactUnlocked = false }: Props) {
  const { t } = useLocale();
  const { freeDeliveryThreshold, freeDeliveryThresholdUsd, expressDeliveryTimeLabel } =
    useDeliveryConfig();

  // When the caller provides an explicit city-level threshold (USD), use it;
  // then the config's raw USD value; only parse the formatted string as a
  // last resort.
  const effectiveThresholdAmount =
    typeof overrideThresholdUsd === "number" && overrideThresholdUsd > 0
      ? overrideThresholdUsd
      : typeof freeDeliveryThresholdUsd === "number" && freeDeliveryThresholdUsd > 0
        ? freeDeliveryThresholdUsd
        : parseThresholdAmount(freeDeliveryThreshold);
  // For the display label: when we have a raw USD value, convert it to the
  // visitor's display currency (FormattedPrice renders the dirham SVG for
  // AED). Only fall back to the pre-formatted string when no USD value exists.
  const effectiveThresholdLabel: React.ReactNode =
    Number.isFinite(effectiveThresholdAmount) && effectiveThresholdAmount > 0
      ? <FormattedPrice usdValue={effectiveThresholdAmount} />
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
      className={`flex items-start gap-3 rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3 ${className ?? ""}`}
    >
      {/* Icon — bare truck (in-progress) or bare checkmark (unlocked) */}
      <span
        role="img"
        aria-label={unlocked ? t("cart.banner.unlockedAria") : t("cart.banner.truckAria")}
        className="shrink-0 mt-0.5 flex items-center justify-center"
      >
        {unlocked
          ? <Check className="w-[18px] h-[18px] text-primary" aria-hidden="true" />
          : <Truck className="w-[18px] h-[18px] text-primary" aria-hidden="true" />}
      </span>

      <div className="min-w-0 text-xs flex-1">
        {showProgress && hasThreshold && unlocked && compactUnlocked ? (
          <div data-testid="free-delivery-banner-compact-unlocked">
            <p className="font-semibold text-foreground leading-snug">
              {t("cart.banner.unlocked")}
            </p>
            <p className="text-muted-foreground mt-0.5 leading-snug">
              {t("cart.banner.expressAlsoAvailable")}
            </p>
          </div>
        ) : showProgress && hasThreshold ? (
          <>
            {/* Headline */}
            <p className="font-semibold text-foreground leading-snug">
              {unlocked
                ? t("cart.banner.unlocked")
                : <RemainingText template={t("cart.banner.remaining")} usdValue={remaining} />}
            </p>

            {/* Helper text */}
            <p className="text-muted-foreground mt-0.5 leading-snug">
              {unlocked
                ? t("cart.banner.expressUnlockedHelper")
                : t("cart.banner.expressStillApplies")}
            </p>

            {/* Progress bar */}
            <div
              role="progressbar"
              aria-valuenow={Math.round(progressPct)}
              aria-valuemax={100}
              aria-label={unlocked ? t("cart.banner.unlockedAria") : t("cart.banner.truckAria")}
              className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  unlocked ? "bg-primary" : "bg-[#d97706]"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Bottom labels: current subtotal (left) and goal / goal reached (right) */}
            <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground">
              <span>
                <FormattedPrice usdValue={subtotal!} />
              </span>
              <span>
                {unlocked
                  ? t("cart.banner.goalReached")
                  : <><FormattedPrice usdValue={thresholdAmount} />{" "}{t("cart.banner.goal")}</>}
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
