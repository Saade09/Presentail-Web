import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import type { ReactNode } from "react";
import { useNow } from "@/lib/useNow";
import { FormattedPrice } from "@/components/FormattedPrice";
import {
  dayLabels,
  expressSurchargeForCountry,
  firstAvailableDay,
  firstAvailableSlot,
  getCountryHour,
  isExpressDeliveryAvailable,
  nearestSlotForHour,
  timeSlotsForCountry,
  type TimeSlot,
} from "@workspace/delivery";

export type DeliveryPickerSelection = {
  mode: "express" | "today_slot" | "schedule";
  date: string;
  slotLabel: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called synchronously with the confirmed selection before the modal closes. */
  onConfirm?: (selection: DeliveryPickerSelection) => void;
  /** OS-sourced slots for the selected city. When provided, overrides the hardcoded per-country defaults. */
  timeSlots?: TimeSlot[];
  /**
   * Whether the OS has enabled express delivery for this specific city.
   * Defaults to true when omitted (backwards-compatible) so callers that
   * don't have city data yet don't accidentally hide express globally.
   * Pass `city?.expressAvailable === true` from the parent to honour the
   * per-city OS flag — the modal ANDs this with the time-window check.
   */
  cityExpressAvailable?: boolean;
}

/** Format an hour integer as a zero-padded HH:00 string, e.g. 9 → "09:00". */
function fmtHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function dayMonthShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function DeliveryPickerModal({ open, onOpenChange, onConfirm, timeSlots: propTimeSlots, cityExpressAvailable = true }: Props) {
  const { t } = useLocale();
  const { countryCode } = useLocationSelection();
  const now = useNow();
  const deliverySelection = useDeliverySelection();

  const timeSlots = useMemo(
    () => (propTimeSlots?.length ? propTimeSlots : timeSlotsForCountry(countryCode)),
    [propTimeSlots, countryCode],
  );
  const quickDays = useMemo(
    () => dayLabels(t("checkout.day.today"), t("checkout.day.tomorrow")).slice(0, 3),
    [t],
  );
  const expressAvailable = useMemo(
    () => cityExpressAvailable && isExpressDeliveryAvailable(countryCode, now),
    [cityExpressAvailable, countryCode, now],
  );
  const expressSurcharge = expressSurchargeForCountry(countryCode);
  const currentHour = useMemo(() => getCountryHour(countryCode, now), [countryCode, now]);
  const todayIso = useMemo(() => now.toISOString().slice(0, 10), [now]);

  const todayHasSlots = useMemo(
    () => firstAvailableSlot(timeSlots, true, currentHour) !== null,
    [timeSlots, currentHour],
  );

  const initialMode: "express" | "schedule" =
    deliverySelection.mode === "express" ? "express" : "schedule";
  const initialDate =
    deliverySelection.mode !== "express" && deliverySelection.date
      ? deliverySelection.date
      : "";
  const initialIsToday = !initialDate || initialDate === todayIso;
  const initialSlot =
    deliverySelection.slotLabel ??
    nearestSlotForHour(timeSlots, initialIsToday, currentHour)?.label ??
    "";

  const [mode, setMode] = useState<"express" | "schedule">(initialMode);
  const [date, setDate] = useState(initialDate);
  const [slot, setSlot] = useState(initialSlot);

  useEffect(() => {
    if (!open) return;
    setMode(deliverySelection.mode === "express" ? "express" : "schedule");
    let newDate =
      deliverySelection.mode !== "express" && deliverySelection.date
        ? deliverySelection.date
        : "";

    const dateIsEmptyOrToday = !newDate || newDate === todayIso;
    if (dateIsEmptyOrToday && !todayHasSlots) {
      const result = firstAvailableDay(todayIso, timeSlots, currentHour, todayIso);
      if (result) {
        setDate(result.iso);
        setSlot(result.slot.label);
        return;
      }
    }

    setDate(newDate);
    const isToday = !newDate || newDate === todayIso;
    setSlot(
      deliverySelection.slotLabel ??
        nearestSlotForHour(timeSlots, isToday, currentHour)?.label ??
        "",
    );
  }, [open]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfirm = () => {
    const today = new Date().toISOString().slice(0, 10);
    let selection: DeliveryPickerSelection;
    if (mode === "express") {
      selection = { mode: "express", date: today, slotLabel: null };
    } else {
      const resolvedMode = date && date === today ? "today_slot" : "schedule";
      selection = { mode: resolvedMode, date: date || today, slotLabel: slot || null };
    }
    deliverySelection.setSelection(selection);
    onConfirm?.(selection);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-2xl font-serif">
          {t("delivery.picker.title")}
        </DialogTitle>

        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => expressAvailable && setMode("express")}
                disabled={!expressAvailable}
                className={`w-full px-3 py-3 rounded-xl border text-sm font-medium transition-colors text-left ${
                  mode === "express"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-foreground/20"
                } ${!expressAvailable ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="font-semibold pr-5">{t("checkout.expressDelivery")}</div>
                <div className="text-xs opacity-80 mt-0.5">
                  {expressAvailable
                    ? <><span>+</span><FormattedPrice usdValue={expressSurcharge} /></>
                    : t("checkout.expressUnavailable")}
                </div>
              </button>
              <ExpressInfoPopover
                infoTitle={t("checkout.expressInfo.title")}
                infoBody={t("checkout.expressInfo.body")}
                infoFee={expressAvailable ? <>+ <FormattedPrice usdValue={expressSurcharge} /></> : undefined}
                active={mode === "express"}
              />
            </div>
            <button
              type="button"
              onClick={() => setMode("schedule")}
              className={`px-3 py-3 rounded-xl border text-sm font-medium transition-colors text-left ${
                mode === "schedule"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-foreground/20"
              }`}
            >
              <div className="font-semibold">{t("checkout.scheduleDelivery")}</div>
              <div className="text-xs opacity-80 mt-0.5">
                {t("checkout.scheduleDeliveryDesc")}
              </div>
            </button>
          </div>

          {mode === "schedule" && (
            <>
              <div className="space-y-3">
                <label className="text-sm font-medium">
                  {t("checkout.deliveryDate")}
                </label>

                {/* Quick-pick chips: today / tomorrow / day after */}
                <div className="grid grid-cols-3 gap-2">
                  {quickDays.map((d) => {
                    const isDisabledToday = d.iso === todayIso && !todayHasSlots;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        disabled={isDisabledToday}
                        onClick={() => !isDisabledToday && setDate(d.iso)}
                        className={`rounded-xl border px-2 py-2 text-center text-xs font-medium transition-colors ${
                          date === d.iso
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-foreground hover:border-foreground/20"
                        } ${isDisabledToday ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        <div className="font-semibold">{d.label}</div>
                        <div className="text-[10px] opacity-80 mt-0.5">{dayMonthShort(d.iso)}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Full date input for any other date */}
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={todayHasSlots ? todayIso : (() => {
                    const tom = new Date(todayIso);
                    tom.setDate(tom.getDate() + 1);
                    return tom.toISOString().slice(0, 10);
                  })()}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("checkout.deliveryTime")}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {timeSlots.map((s) => {
                    const isPastCutoff =
                      (!date || date === todayIso) && s.cutoffHour <= currentHour;
                    return (
                      <button
                        key={s.label}
                        type="button"
                        disabled={isPastCutoff}
                        onClick={() => !isPastCutoff && setSlot(s.label)}
                        className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors text-left ${
                          slot === s.label
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-foreground hover:border-foreground/20"
                        } ${isPastCutoff ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        {s.startHour !== undefined && s.endHour !== undefined ? (
                          <>
                            <div>{fmtHour(s.startHour)} – {fmtHour(s.endHour)}</div>
                            <div className="text-xs opacity-70 mt-0.5">{s.label}</div>
                          </>
                        ) : (
                          <div>{s.label}</div>
                        )}
                        {s.extraFee && s.extraFee > 0 ? (
                          <div className="text-xs opacity-75 mt-0.5">+${s.extraFee}</div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 h-11 rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              {t("delivery.picker.cancel")}
            </Button>
            <Button
              className="flex-1 h-11 rounded-xl"
              onClick={handleConfirm}
            >
              {t("delivery.picker.confirm")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExpressInfoPopover({
  infoTitle,
  infoBody,
  infoFee,
  active,
}: {
  infoTitle: string;
  infoBody: string;
  infoFee?: ReactNode;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          aria-label={infoTitle}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((prev) => !prev);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              e.preventDefault();
              setOpen((prev) => !prev);
            }
          }}
          className={`absolute top-2 right-2 rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            active
              ? "text-primary-foreground/70 hover:text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Info className="w-3.5 h-3.5" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-64 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-semibold mb-1">{infoTitle}</p>
        <p className="text-muted-foreground leading-relaxed">{infoBody}</p>
        {infoFee && (
          <p className="font-semibold mt-2 text-foreground">{infoFee}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
