import { useMemo, useState } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { dayLabels, formatDeliveryRow, slotTimeRangeForLabel, timeSlotsForCountry } from "@workspace/delivery";
import { DeliveryPickerModal } from "./DeliveryPickerModal";

interface Props {
  className?: string;
  /** Override the displayed text (e.g. from local checkout state). When omitted, reads from DeliverySelectionContext. */
  rowText?: string | null;
  /** Override the click behaviour. When omitted, opens DeliveryPickerModal. */
  onChangeClick?: () => void;
}

export function DeliveryDateRow({ className = "", rowText: rowTextProp, onChangeClick }: Props) {
  const { t } = useLocale();
  const { mode, date, slotLabel } = useDeliverySelection();
  const { city } = useLocationSelection();
  const [pickerOpen, setPickerOpen] = useState(false);

  const summaryDays = useMemo(
    () => dayLabels(t("checkout.day.today"), t("checkout.day.tomorrow")),
    [t],
  );

  const cityTimeSlots = useMemo(() => {
    let raw: ReturnType<typeof timeSlotsForCountry> = [];
    if (city?.timeSlots?.length) {
      raw = city.timeSlots;
    } else if (city?.slotsByDay) {
      raw = Object.values(city.slotsByDay)
        .flat()
        .filter((s, i, arr) => arr.findIndex((t) => t.cutoffHour === s.cutoffHour) === i);
    }
    if (!raw.length) return timeSlotsForCountry(null);
    // Deduplicate by label — the OS may return two Night slots (same-day / next-day
    // configs) with identical labels; keep the first occurrence of each label.
    const seen = new Set<string>();
    return raw.filter((s) => {
      if (seen.has(s.label)) return false;
      seen.add(s.label);
      return true;
    });
  }, [city]);

  const contextRowText =
    mode != null
      ? formatDeliveryRow({
          mode,
          date,
          slotLabel,
          slotTimeRange: slotTimeRangeForLabel(slotLabel, cityTimeSlots),
          days: summaryDays,
          expressLabel: t("checkout.expressDeliveryLabel"),
        })
      : null;

  const displayText = rowTextProp !== undefined ? rowTextProp : contextRowText;

  const handleClick = () => {
    if (onChangeClick) {
      onChangeClick();
    } else {
      setPickerOpen(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={displayText ? `${displayText} — ${t("delivery.row.change")}` : t("delivery.row.selectDate")}
        className={`w-full flex items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10 ${className}`}
        data-testid="delivery-date-row"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1 text-sm">
          {displayText ?? (
            <span className="text-muted-foreground">
              {t("delivery.row.selectDate")}
            </span>
          )}
        </span>
        {displayText ? (
          <span className="text-xs font-medium text-primary shrink-0">
            {t("delivery.row.change")}
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        )}
      </button>

      {!onChangeClick && (
        <DeliveryPickerModal
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          timeSlots={cityTimeSlots}
          cityExpressAvailable={city?.expressAvailable === true}
        />
      )}
    </>
  );
}
