import { useEffect, useRef } from "react";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { displayedSlotsForDate } from "@/components/delivery/displayedSlots";
import { getLocalIso, isMidnightSlot, type TimeSlot } from "@workspace/delivery";
import { trackWebEventOnce } from "@/lib/analytics";

export function useMidnightSlotValidation(
  timeSlots: TimeSlot[],
  cityId?: string | null,
  countryCode?: string | null,
  slotsByDay?: Record<string, TimeSlot[]> | null,
) {
  const deliverySelection = useDeliverySelection();
  const {
    mode,
    date,
    slotLabel,
    slotId,
    serviceType,
    cityId: selectedCityId,
    setSelection,
  } = deliverySelection;

  const previousMidnightRef = useRef<boolean>(false);

  useEffect(() => {
    if (mode === "express" || !slotLabel) {
      previousMidnightRef.current = false;
      return;
    }

    const todayIso = getLocalIso(countryCode);
    const dateIso = date || todayIso;
    const dayIso = (n: number) => {
      const [y, m, d] = todayIso.split("-").map(Number) as [number, number, number];
      const dt = new Date(y, m - 1, d + n, 12, 0, 0);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    };

    const weekday = new Date(`${dateIso}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
    }).toLowerCase();
    const source =
      slotsByDay && Object.prototype.hasOwnProperty.call(slotsByDay, weekday)
        ? slotsByDay[weekday] ?? []
        : timeSlots;
    const displayed = displayedSlotsForDate(source, dateIso, todayIso, dayIso(1), cityId);
    
    // Find the currently selected slot in the new displayed slots
    const foundSlot = (slotId ? displayed.find(s => s.slotId === slotId) : undefined) ?? displayed.find(s => s.label === slotLabel);

    const foundIsSameMidnight =
      foundSlot &&
      isMidnightSlot(foundSlot, cityId) &&
      foundSlot.slotId === slotId &&
      selectedCityId === cityId;

    if (serviceType === "midnight" && !foundIsSameMidnight) {
      setSelection({
        slotLabel: null,
        slotId: null,
        serviceType: null,
        cityId: null,
        source: "system_reselected",
      });
      previousMidnightRef.current = false;
      trackWebEventOnce({
        type: "midnight_selection_removed_after_address_change",
        properties: {
          previous_city_id: selectedCityId,
          city_id: cityId ?? "unknown",
          occasion_date: dateIso,
          slot_id: slotId ?? undefined,
        },
      }, `${selectedCityId ?? "unknown"}|${dateIso}|${slotId ?? ""}`);
    } else if (foundSlot) {
      // If it exists and is midnight, track that we are currently on a midnight slot
      const isMidnight = isMidnightSlot(foundSlot, cityId);
      previousMidnightRef.current = isMidnight;
    } else {
      // It no longer exists. Was it a midnight slot before?
      // Since it's gone from displayed, we check if our last known state was midnight.
      if (previousMidnightRef.current || serviceType === "midnight") {
        // It was a midnight slot, and now it's invalid.
        // Clear it, require an explicit replacement, and emit the event.
        setSelection({
          slotLabel: null,
          slotId: null,
          serviceType: null,
          cityId: null,
          source: "system_reselected",
        });
        previousMidnightRef.current = false;
        
        trackWebEventOnce({
          type: "midnight_selection_removed_after_address_change",
          properties: {
            city_id: cityId ?? "unknown",
            date: dateIso,
            slot_id: slotId ?? undefined,
          }
        }, `${selectedCityId ?? "unknown"}|${dateIso}|${slotId ?? ""}`);
      }
    }
  }, [timeSlots, slotsByDay, cityId, selectedCityId, countryCode, mode, date, slotLabel, slotId, serviceType, setSelection]);
}
