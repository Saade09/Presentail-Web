import { Calendar, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";

type Props = {
  mode: "express" | "scheduled";
  // Express-specific
  expressLabel?: string;           // "Arrives in approximately 90 minutes"
  expressEtaLine?: string | null;  // "Estimated by 1:30 PM Lebanon time"
  expressFeeLabel?: string;        // "$22 delivery fee"
  expressFeeSubLabel?: string;     // "$7 standard + $15 express upgrade"
  // Scheduled-specific
  dateLabel?: string;              // "Today, 6 Aug"
  slotWithTimezone?: string | null; // "6 PM–10 PM Lebanon time"
  scheduledFeeLabel?: string;      // "$23 delivery fee"
  scheduledIsFree?: boolean;
  // Common
  cartItemCount: number;
  onChangeDelivery: () => void;
};

export function InheritedDeliverySummary({
  mode,
  expressLabel,
  expressEtaLine,
  expressFeeLabel,
  expressFeeSubLabel,
  dateLabel,
  slotWithTimezone,
  scheduledFeeLabel,
  scheduledIsFree,
  cartItemCount,
  onChangeDelivery,
}: Props) {
  const { t } = useLocale();
  const isExpress = mode === "express";

  const explainKey = isExpress
    ? (cartItemCount === 1
        ? "product.delivery.inheritedExpressOne"
        : "product.delivery.inheritedExpressMany")
    : (cartItemCount === 1
        ? "product.delivery.inheritedScheduledOne"
        : "product.delivery.inheritedScheduledMany");

  const feeLabel = isExpress ? expressFeeLabel : scheduledFeeLabel;
  const changeKey = isExpress
    ? "product.delivery.changeDelivery"
    : "product.delivery.changeDateOrTime";

  return (
    <div className="space-y-3 lg:space-y-2" data-testid="inherited-delivery-summary">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {t("product.delivery.deliveryForThisOrder")}
      </p>

      <div className="w-full rounded-2xl border border-primary/40 bg-primary/[0.04] p-4 lg:p-3">
        {/* Header: icon + method name + "Selected in cart" pill */}
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 lg:w-8 lg:h-8 rounded-full flex items-center justify-center shrink-0 bg-primary text-primary-foreground">
            {isExpress ? <Zap className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
          </span>
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">
              {t(isExpress ? "product.delivery.expressDelivery" : "product.delivery.scheduledDelivery")}
            </span>
            <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary leading-none">
              {t("product.delivery.selectedInCart")}
            </span>
          </div>
        </div>

        {/* Detail lines — indented to align with text after the icon */}
        <div className="mt-2.5 ms-[calc(2.25rem+0.75rem)] lg:ms-[calc(2rem+0.75rem)] space-y-1">
          {isExpress ? (
            <>
              {expressLabel && (
                <p className="text-xs text-foreground/80">{expressLabel}</p>
              )}
              {expressEtaLine && (
                <p className="text-xs text-muted-foreground">{expressEtaLine}</p>
              )}
            </>
          ) : (
            <>
              {dateLabel && (
                <p className="text-xs font-medium text-foreground">{dateLabel}</p>
              )}
              {slotWithTimezone && (
                <p className="text-xs text-muted-foreground">{slotWithTimezone}</p>
              )}
            </>
          )}

          {/* Fee */}
          {feeLabel && (
            <div className="pt-1">
              <p className={cn(
                "text-sm font-semibold",
                scheduledIsFree && !isExpress ? "text-primary" : "text-foreground",
              )}>
                {feeLabel}
              </p>
              {isExpress && expressFeeSubLabel && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{expressFeeSubLabel}</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("product.delivery.alreadyApplied")}
              </p>
            </div>
          )}
        </div>

        {/* Separator + explanatory copy + change action */}
        <div className="mt-3 pt-3 border-t border-primary/20 flex items-start justify-between gap-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed flex-1">
            {t(explainKey)}
          </p>
          <button
            type="button"
            onClick={onChangeDelivery}
            className="shrink-0 text-[11px] font-medium text-primary underline-offset-2 hover:underline whitespace-nowrap"
            data-testid="change-delivery-btn"
          >
            {t(changeKey)}
          </button>
        </div>
      </div>
    </div>
  );
}
