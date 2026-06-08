/**
 * DateStrip — horizontal date selector used in checkout schedule mode.
 *
 * Renders a scrollable row of day tiles. The tile for `selectedDate` is
 * highlighted with the primary colour; all others use the default border style.
 * Pressing a tile calls `onSelectDate` with that day's ISO string.
 *
 * Pass a `disabledDates` Set to prevent selection of specific days (e.g. today
 * when all its time slots are already past). Disabled tiles render at reduced
 * opacity and cannot be pressed.
 *
 * Extracted from `app/checkout.tsx` so the component can be unit-tested in
 * isolation without pulling in the full checkout screen's dependencies.
 */

import React from "react";
import { Pressable, ScrollView } from "react-native";
import { AppText } from "@/components/AppText";

import type { DeliveryDay } from "@workspace/delivery";
import { useHeadingFont } from "@/hooks/useHeadingFont";

export type DateStripColors = {
  primary: string;
  border: string;
  mutedForeground: string;
  goldSoft: string;
};

export type DateStripProps = {
  days: DeliveryDay[];
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  colors: DateStripColors;
  /** ISO date strings that cannot be selected (rendered greyed-out). */
  disabledDates?: Set<string>;
};

export function DateStrip({ days, selectedDate, onSelectDate, colors, disabledDates }: DateStripProps) {
  const headingFontMedium = useHeadingFont("500Medium");
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {days.map((d) => {
        const active = d.iso === selectedDate;
        const disabled = disabledDates?.has(d.iso) ?? false;
        return (
          <Pressable
            key={d.iso}
            onPress={() => !disabled && onSelectDate(d.iso)}
            style={{
              width: 56,
              paddingVertical: 8,
              borderRadius: 10,
              alignItems: "center",
              backgroundColor: active ? colors.primary : "#fff",
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
              opacity: disabled ? 0.4 : 1,
            }}
          >
            <AppText
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 10,
                color: active ? colors.goldSoft : colors.mutedForeground,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {d.label}
            </AppText>
            <AppText
              style={{
                fontFamily: headingFontMedium,
                fontSize: 16,
                color: active ? "#fff" : colors.primary,
              }}
            >
              {d.date}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
