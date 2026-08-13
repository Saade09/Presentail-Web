import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, Zap } from "lucide-react";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { trackEvent } from "@/lib/analytics";
import { DeliveryPickerModal } from "./DeliveryPickerModal";
import { useCityTimeSlots, useDeliveryPromise } from "./deliveryPromise";

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
}

export function DeliveryDateRow({ className = "", onChangeClick, openWithExpress = false, onExpressPreselectConsumed }: Props) {
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

  const handleClick = () => {
    trackEvent({
      name: "delivery_change_opened",
      surface: "cart",
      ...(promise ? { deliveryMethod: promise.type } : {}),
    });
    if (onChangeClick) {
      onChangeClick();
    } else {
      setPreselectExpress(false);
      setPickerOpen(true);
    }
  };

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
        className={`w-full flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-left transition-colors hover:bg-primary/10 ${className}`}
        data-testid="delivery-date-row"
      >
        {promise?.type === "express" ? (
          <Zap className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        )}
        <span className="flex-1 min-w-0">
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
          <span className="shrink-0 self-stretch flex items-center min-h-11 -my-2.5 -me-4 ps-2 pe-4 text-xs font-medium text-primary">
            {t("delivery.row.change")}
          </span>
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
