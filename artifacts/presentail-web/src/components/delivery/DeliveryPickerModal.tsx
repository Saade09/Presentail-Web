import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { useNow } from "@/lib/useNow";
import {
  dayLabels,
  expressSurchargeForCountry,
  isExpressDeliveryAvailable,
  timeSlotsForCountry,
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
}

function dayMonthShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function DeliveryPickerModal({ open, onOpenChange, onConfirm }: Props) {
  const { t } = useLocale();
  const { countryCode } = useLocationSelection();
  const { formatPrice } = useDisplayCurrency();
  const now = useNow();
  const deliverySelection = useDeliverySelection();

  const timeSlots = timeSlotsForCountry(countryCode);
  const quickDays = useMemo(
    () => dayLabels(t("checkout.day.today"), t("checkout.day.tomorrow")).slice(0, 3),
    [t],
  );
  const expressAvailable = useMemo(
    () => isExpressDeliveryAvailable(countryCode, now),
    [countryCode, now],
  );
  const expressSurcharge = expressSurchargeForCountry(countryCode);

  const initialMode: "express" | "schedule" =
    deliverySelection.mode === "express" ? "express" : "schedule";
  const initialDate =
    deliverySelection.mode !== "express" && deliverySelection.date
      ? deliverySelection.date
      : "";
  const initialSlot =
    deliverySelection.slotLabel ?? timeSlots[0]?.label ?? "";

  const [mode, setMode] = useState<"express" | "schedule">(initialMode);
  const [date, setDate] = useState(initialDate);
  const [slot, setSlot] = useState(initialSlot);

  useEffect(() => {
    if (!open) return;
    setMode(deliverySelection.mode === "express" ? "express" : "schedule");
    setDate(
      deliverySelection.mode !== "express" && deliverySelection.date
        ? deliverySelection.date
        : "",
    );
    setSlot(deliverySelection.slotLabel ?? timeSlots[0]?.label ?? "");
  }, [open]);

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
            <button
              type="button"
              onClick={() => expressAvailable && setMode("express")}
              disabled={!expressAvailable}
              className={`px-3 py-3 rounded-xl border text-sm font-medium transition-colors text-left ${
                mode === "express"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-foreground/20"
              } ${!expressAvailable ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="font-semibold">{t("checkout.expressDelivery")}</div>
              <div className="text-xs opacity-80 mt-0.5">
                {expressAvailable
                  ? `+${formatPrice(expressSurcharge)}`
                  : t("checkout.expressUnavailable")}
              </div>
            </button>
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
                  {quickDays.map((d) => (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => setDate(d.iso)}
                      className={`rounded-xl border px-2 py-2 text-center text-xs font-medium transition-colors ${
                        date === d.iso
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:border-foreground/20"
                      }`}
                    >
                      <div className="font-semibold">{d.label}</div>
                      <div className="text-[10px] opacity-80 mt-0.5">{dayMonthShort(d.iso)}</div>
                    </button>
                  ))}
                </div>

                {/* Full date input for any other date */}
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("checkout.deliveryTime")}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {timeSlots.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => setSlot(s.label)}
                      className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                        slot === s.label
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:border-foreground/20"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
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
