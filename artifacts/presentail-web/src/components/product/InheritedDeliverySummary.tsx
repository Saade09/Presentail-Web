import type { ReactNode } from "react";
import { Calendar, Zap } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

type Props = {
  mode: "express" | "scheduled";
  /**
   * Detail line under the title:
   * - express:   "Arrives by {time} Lebanon time"
   * - scheduled: "{date} · {window} Lebanon time"
   */
  detailLine?: string | null;
  /**
   * Fee line, already localized/formatted:
   * - express:   "Express upgrade: {fee} · already included"
   * - scheduled: "Delivery: Free · already included" (or the paid fee)
   */
  feeLine?: ReactNode;
  onChangeDelivery: () => void;
};

/**
 * Compact PDP delivery summary card shown when the cart already carries an
 * order-level delivery selection. One card covers both the Express and
 * Scheduled states; the "Change" action reopens the full selector flow.
 */
export function InheritedDeliverySummary({
  mode,
  detailLine,
  feeLine,
  onChangeDelivery,
}: Props) {
  const { t } = useLocale();
  const isExpress = mode === "express";

  return (
    <div className="space-y-2" data-testid="inherited-delivery-summary">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {t("product.delivery.header")}
      </p>

      <div className="w-full rounded-2xl border border-primary/25 bg-[#F7F7F5] p-4 lg:p-3">
        {/* Row 1: icon + method title + right-aligned Change action */}
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 lg:w-8 lg:h-8 rounded-full flex items-center justify-center shrink-0 bg-primary text-primary-foreground" aria-hidden="true">
            {isExpress ? <Zap className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
          </span>
          <span className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate">
            {t(isExpress ? "product.delivery.expressTitle" : "product.delivery.scheduledTitle")}
          </span>
          <button
            type="button"
            onClick={onChangeDelivery}
            aria-label={t("product.delivery.changeAria")}
            className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline whitespace-nowrap"
            data-testid="change-delivery-btn"
          >
            {t("product.delivery.change")}
          </button>
        </div>

        {/* Detail lines — indented to align with the title */}
        <div className="mt-2 ms-[calc(2.25rem+0.75rem)] lg:ms-[calc(2rem+0.75rem)] space-y-1">
          {detailLine && (
            <p className="text-xs font-medium text-foreground break-words">{detailLine}</p>
          )}
          <p className="text-xs text-neutral-600 break-words">
            {t("product.delivery.joinCart")}
          </p>
          {feeLine && (
            <p className="text-xs text-neutral-600 break-words" data-testid="delivery-fee-line">
              {feeLine}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
