/**
 * DateStrip — horizontal date selector used in checkout schedule mode.
 *
 * Renders a scrollable row of day tiles. The tile for `selectedDate` is
 * highlighted with the primary colour; all others use the default border style.
 * Pressing a tile calls `onSelectDate` with that day's ISO string.
 *
 * Extracted from `app/checkout.tsx` so the component can be unit-tested in
 * isolation without pulling in the full checkout screen's dependencies.
 */

import React from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { AppText } from "@/components/AppText";

import type { DeliveryDay } from "@workspace/delivery";

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
};

export function DateStrip({ days, selectedDate, onSelectDate, colors }: DateStripProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {days.map((d) => {
        const active = d.iso === selectedDate;
        return (
          <Pressable
            key={d.iso}
            onPress={() => onSelectDate(d.iso)}
            style={{
              width: 56,
              paddingVertical: 8,
              borderRadius: 10,
              alignItems: "center",
              backgroundColor: active ? colors.primary : "#fff",
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
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
                fontFamily: "PlayfairDisplay_500Medium",
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
