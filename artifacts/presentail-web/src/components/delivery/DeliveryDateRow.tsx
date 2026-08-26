import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, Moon, Zap, AlertTriangle } from "lucide-react";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { trackEvent, trackWebEvent } from "@/lib/analytics";
import { buildFeeNode } from "@/lib/feeNode";
import { DeliveryPickerModal } from "./DeliveryPickerModal";
import { useCityTimeSlots, useDeliveryPromise } from "./deliveryPromise";
import { FormattedPrice } from "@/components/FormattedPrice";
import type { CartDeliveryInvalidationReason } from "./cartDeliveryAvailability";

interface Props {
  className?: string;
  /** Override the click behaviour. When omitted, opens DeliveryPickerModal. */
  onChangeClick?: () => void;
  /**
   * When true, the internally-managed picker opens with express preselected
   * (used by the Order Summary express upsell). Reset via onExpressPreselectConsumed.
   */
  openWithExpress?: boolean;
  onExpressPreselectConsumed?: () => void;
  /**
   * Resolved surcharge (USD) for the booked Midnight slot, shown as "+$20"-style
   * pricing on the Midnight card. Pass the date-aware resolved slot fee — never
   * a hardcoded value. Ignored for non-midnight selections; omit/null hides
   * the price line.
   */
  midnightFeeUsd?: number | null;
  invalidReason?: CartDeliveryInvalidationReason | null;
  expressArrival?: string | null;
  expressFeeUsd?: number;
  onExpiredExpress?: () => void;
  /** Imperative cart CTA recovery path; opens Schedule without selecting it. */
  openScheduleRequest?: boolean;
  onOpenScheduleRequestConsumed?: () => void;
}

export function DeliveryDateRow({ className = "", onChangeClick, openWithExpress = false, onExpressPreselectConsumed, midnightFeeUsd = null, invalidReason = null, expressArrival = null, expressFeeUsd = 0, onExpiredExpress, openScheduleRequest = false, onOpenScheduleRequestConsumed }: Props) {
  const { t } = useLocale();
  const { city } = useLocationSelection();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preselectExpress, setPreselectExpress] = useState(false);

  const cityTimeSlots = useCityTimeSlots();
  const promise = useDeliveryPromise();

  // Emit one delivery_summary_viewed per promise type shown (standard/express),
  // not on every re-render.
  const lastTrackedType = useRef<string | null>(null);
  useEffect(() => {
    const type = promise?.type ?? null;
    if (type && type !== lastTrackedType.current) {
      lastTrackedType.current = type;
      trackEvent({ name: "delivery_summary_viewed", surface: "cart", deliveryMethod: type });
    }
  }, [promise?.type]);

  // External request (express upsell) to open the picker with express preselected.
  useEffect(() => {
    if (openWithExpress && !onChangeClick) {
      setPreselectExpress(true);
      setPickerOpen(true);
      onExpressPreselectConsumed?.();
    }
  }, [openWithExpress, onChangeClick, onExpressPreselectConsumed]);

  useEffect(() => {
    if (!openScheduleRequest || onChangeClick) return;
    setPreselectExpress(false);
    setPickerOpen(true);
    onOpenScheduleRequestConsumed?.();
  }, [openScheduleRequest, onChangeClick, onOpenScheduleRequestConsumed]);

  const handleClick = () => {
    trackEvent({
      name: "delivery_change_opened",
      surface: "cart",
      ...(promise ? { deliveryMethod: promise.type } : {}),
    });
    trackWebEvent({
      type: "delivery_change_opened",
      properties: { surface: "cart", ...(promise ? { delivery_method: promise.type } : {}) },
    });
    if (onChangeClick) {
      onChangeClick();
    } else {
      setPreselectExpress(false);
      setPickerOpen(true);
    }
  };

  if (invalidReason) {
    const expired = invalidReason === "expired";
    const openSchedule = () => {
      setPreselectExpress(false);
      setPickerOpen(true);
    };
    return (
      <>
        <div
          className={`rounded-xl border border-[#E8D7B8] bg-[#FFF8EA] px-4 py-4 ${className}`}
          data-testid="cart-delivery-invalid"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#B87924]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#6C4A1E]">
                {expired ? t("cart.deliveryExpired.title") : t("cart.deliveryUnavailable.title")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#7A5A32]">
                {expired ? t("cart.deliveryExpired.body") : t("cart.deliveryUnavailable.body")}
              </p>
              {expired && expressArrival && (
                <div className="mt-3 rounded-lg border border-[#E8D7B8] bg-white/70 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">{t("checkout.expressDelivery")}</p>
                      <p className="text-xs text-muted-foreground">{expressArrival}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{t("checkout.promise.within90")}</p>
                    </div>
                    {expressFeeUsd > 0 && <FormattedPrice usdValue={expressFeeUsd} className="shrink-0 text-sm font-semibold text-primary" />}
                  </div>
                  <button
                    type="button"
                    onClick={onExpiredExpress}
                    className="mt-2.5 min-h-10 w-full rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    disabled={!onExpiredExpress}
                    data-testid="button-deliver-today"
                  >
                    {t("cart.deliveryExpired.expressCta")}
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={openSchedule}
                className="mt-3 min-h-10 w-full rounded-lg border border-[#B87924] bg-transparent px-3 text-sm font-semibold text-[#6C4A1E] transition-colors hover:bg-[#FFF1D6]"
                data-testid="button-schedule-another-date"
              >
                {t("cart.deliveryExpired.scheduleCta")}
              </button>
            </div>
          </div>
        </div>
        {!onChangeClick && (
          <DeliveryPickerModal
            open={pickerOpen}
            onOpenChange={(o) => {
              setPickerOpen(o);
              if (!o) setPreselectExpress(false);
            }}
            timeSlots={cityTimeSlots}
            cityExpressAvailable={city?.expressAvailable === true}
            initialModeOverride="schedule"
            requireExplicitSelection
          />
        )}
      </>
    );
  }

  const isMidnight = promise?.type === "midnight";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={
          promise
            ? `${promise.title} — ${promise.arrival} — ${t("delivery.row.change")}`
            : t("delivery.row.selectDate")
        }
        className={`w-full flex items-center gap-3 rounded-xl border text-left transition-colors ${
          isMidnight
            ? "border-primary/15 bg-[#FFF8EE] px-4 py-2.5 hover:bg-[#FBF2E3]"
            : "border-primary/20 bg-primary/5 px-4 py-2.5 hover:bg-primary/10"
        } ${className}`}
        data-testid="delivery-date-row"
      >
        {isMidnight ? (
          <Moon className="h-4 w-4 shrink-0 text-primary fill-primary" aria-hidden="true" />
        ) : promise?.type === "express" ? (
          <Zap className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        )}
        <span className="flex-1 min-w-0" data-testid={isMidnight ? "card-midnight-delivery" : undefined}>
          {promise ? (
            <>
              <span className="block text-xs font-medium text-muted-foreground" data-testid="text-delivery-service">
                {promise.title}
              </span>
              <span className="block text-sm font-semibold text-foreground whitespace-normal break-words" data-testid="text-delivery-arrival">
                {promise.arrival}
              </span>
              <span className="block text-[11px] text-muted-foreground" data-testid="text-delivery-caption">
                {promise.caption}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              {t("delivery.row.selectDate")}
            </span>
          )}
        </span>
        {promise ? (
          isMidnight ? (
            <span className="shrink-0 self-stretch flex flex-col items-end justify-center gap-1 min-h-11 -my-2.5 -me-4 ps-2 pe-4">
              {typeof midnightFeeUsd === "number" && midnightFeeUsd > 0 && (
                <span
                  className="whitespace-nowrap text-sm font-semibold text-primary tabular-nums"
                  data-testid="text-midnight-fee"
                >
                  {buildFeeNode(t("cart.expressDelta"), { amount: midnightFeeUsd })}
                </span>
              )}
              <span className="text-xs font-medium text-primary">
                {t("delivery.row.change")}
              </span>
            </span>
          ) : (
            <span className="shrink-0 self-stretch flex items-center min-h-11 -my-2.5 -me-4 ps-2 pe-4 text-xs font-medium text-primary">
              {t("delivery.row.change")}
            </span>
          )
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-primary rtl:rotate-180" aria-hidden="true" />
        )}
      </button>

      {!onChangeClick && (
        <DeliveryPickerModal
          open={pickerOpen}
          onOpenChange={(o) => {
            setPickerOpen(o);
            if (!o) setPreselectExpress(false);
          }}
          timeSlots={cityTimeSlots}
          cityExpressAvailable={city?.expressAvailable === true}
          initialModeOverride={preselectExpress ? "express" : undefined}
        />
      )}
    </>
  );
}
