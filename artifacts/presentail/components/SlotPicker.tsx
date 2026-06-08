/**
 * SlotPicker — time-slot grid used in checkout (today_slot and schedule modes).
 *
 * Renders a wrapping row of time-slot tiles. Slots whose `cutoffHour` has
 * already passed on today's date are visually disabled (dimmed, struck through)
 * and their press is suppressed. The active slot is highlighted with the
 * primary colour. Pressing an available slot calls `onSelectSlot` with the
 * full `TimeSlot` object.
 *
 * Extracted from `app/checkout.tsx` so the component can be unit-tested in
 * isolation without pulling in the full checkout screen's dependencies.
 */

import React from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";

import type { TimeSlot } from "@workspace/delivery";

function fmtHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export type SlotPickerColors = {
  primary: string;
  border: string;
  mutedForeground: string;
};

export type SlotPickerProps = {
  slots: TimeSlot[];
  selectedSlotLabel: string | null;
  date: string;
  todayIso: string;
  localHour: number;
  onSelectSlot: (slot: TimeSlot) => void;
  colors: SlotPickerColors;
};

export function SlotPicker({
  slots,
  selectedSlotLabel,
  date,
  todayIso,
  localHour,
  onSelectSlot,
  colors,
}: SlotPickerProps) {
  const isToday = date === todayIso;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {slots.map((s) => {
        const past = isToday && localHour >= s.cutoffHour;
        const active = selectedSlotLabel === s.label;
        const hasHours = s.startHour !== undefined && s.endHour !== undefined;
        return (
          <Pressable
            key={s.label}
            onPress={() => {
              if (!past) onSelectSlot(s);
            }}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
              backgroundColor: active ? colors.primary : past ? "#f5f5f5" : "#fff",
              opacity: past ? 0.55 : 1,
            }}
          >
            {hasHours ? (
              <>
                <AppText
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: active ? "#fff" : past ? colors.mutedForeground : colors.primary,
                    textDecorationLine: past ? "line-through" : "none",
                  }}
                >
                  {fmtHour(s.startHour!)}–{fmtHour(s.endHour!)}
                </AppText>
                <AppText
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 10,
                    color: active ? "rgba(255,255,255,0.75)" : colors.mutedForeground,
                    marginTop: 1,
                  }}
                >
                  {s.label}
                </AppText>
              </>
            ) : (
              <AppText
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: active ? "#fff" : past ? colors.mutedForeground : colors.primary,
                  textDecorationLine: past ? "line-through" : "none",
                }}
              >
                {s.label}
              </AppText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
