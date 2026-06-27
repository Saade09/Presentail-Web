/**
 * DateStrip — horizontal date selector used in checkout schedule mode.
 *
 * Renders a scrollable row of day tiles. The tile for `selectedDate` is
 * highlighted with the primary colour; all others use the default border style.
 * Pressing a tile calls `onSelectDate` with that day's ISO string.
 *
 * A "More" button at the end of the strip opens a full-month calendar popup
 * centred in the screen (using a transparent Modal) so the shopper can pick
 * any date up to 90 days ahead. Tapping the dim backdrop dismisses it.
 *
 * Pass a `disabledDates` Set to prevent selection of specific days (e.g. today
 * when all its time slots are already past). Disabled tiles render at reduced
 * opacity and cannot be pressed.
 *
 * Extracted from `app/checkout.tsx` so the component can be unit-tested in
 * isolation without pulling in the full checkout screen's dependencies.
 */

import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { AppText } from "@/components/AppText";

import type { DeliveryDay } from "@workspace/delivery";
import { useHeadingFont } from "@/hooks/useHeadingFont";

export type DateStripColors = {
  primary: string;
  border: string;
  mutedForeground: string;
  goldSoft: string;
  /** Used to highlight today's date in the month calendar. Defaults to "#FAF6EE" if omitted. */
  secondary?: string;
};

export type DateStripProps = {
  days: DeliveryDay[];
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  colors: DateStripColors;
  /** ISO date strings that cannot be selected (rendered greyed-out). */
  disabledDates?: Set<string>;
  /** Label shown on the "More" button that opens the full-month calendar. Defaults to "More". */
  moreLabel?: string;
};

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function toIso(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function getMonthYearLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function getDayAbbrs(): string[] {
  const sunday = new Date(2026, 0, 4);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d.toLocaleDateString(undefined, { weekday: "narrow" });
  });
}

const DAY_ABBRS = getDayAbbrs();

export function DateStrip({ days, selectedDate, onSelectDate, colors, disabledDates, moreLabel = "More" }: DateStripProps) {
  const headingFontMedium = useHeadingFont("500Medium");
  const { width } = useWindowDimensions();
  const todayHighlight = colors.secondary ?? "#FAF6EE";
  const [calendarOpen, setCalendarOpen] = useState(false);

  const todayIso = new Date().toISOString().slice(0, 10);
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 90);
  const maxIso = maxDate.toISOString().slice(0, 10);

  const openCalendar = () => {
    const base = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
    setCalYear(base.getFullYear());
    setCalMonth(base.getMonth());
    setCalendarOpen(true);
  };

  const initDate = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
  const [calYear, setCalYear] = useState(initDate.getFullYear());
  const [calMonth, setCalMonth] = useState(initDate.getMonth());

  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
  };

  const today = new Date();
  const canGoPrev =
    calYear > today.getFullYear() ||
    (calYear === today.getFullYear() && calMonth > today.getMonth());
  const canGoNext =
    calYear < maxDate.getFullYear() ||
    (calYear === maxDate.getFullYear() && calMonth < maxDate.getMonth());

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDow = getFirstDayOfWeek(calYear, calMonth);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const cellSize = Math.min(Math.floor((Math.min(width - 64, 320)) / 7), 40);
  const cardWidth = cellSize * 7 + 40;

  return (
    <>
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
              accessibilityRole="button"
              accessibilityLabel={d.full ?? `${d.label} ${d.date}`}
              accessibilityState={{ disabled, selected: active }}
              accessibilityHint={disabled ? "This date is not available" : active ? "Currently selected" : "Double-tap to select this delivery date"}
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

        <Pressable
          onPress={openCalendar}
          accessibilityRole="button"
          accessibilityLabel={moreLabel}
          accessibilityHint="Opens a full-month calendar to pick any available date" // i18n-ignore
          style={{
            width: 56,
            paddingVertical: 8,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: colors.border,
            gap: 4,
          }}
        >
          <Feather name="calendar" size={16} color={colors.primary} />
          <AppText
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 10,
              color: colors.mutedForeground,
            }}
          >
            {moreLabel}
          </AppText>
        </Pressable>
      </ScrollView>

      <Modal
        visible={calendarOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarOpen(false)}
        accessibilityViewIsModal
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => setCalendarOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: cardWidth,
              backgroundColor: "#fff",
              borderRadius: 20,
              paddingVertical: 20,
              paddingHorizontal: 20,
              shadowColor: "#000",
              shadowOpacity: 0.2,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 8 },
              elevation: 24,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <Pressable
                onPress={handlePrevMonth}
                disabled={!canGoPrev}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Previous month" // i18n-ignore
                accessibilityState={{ disabled: !canGoPrev }}
                style={{ opacity: canGoPrev ? 1 : 0.25 }}
              >
                <Feather name="chevron-left" size={20} color={colors.primary} />
              </Pressable>
              <AppText
                accessibilityRole="header"
                style={{
                  fontFamily: headingFontMedium,
                  fontSize: 15,
                  color: colors.primary,
                }}
              >
                {getMonthYearLabel(calYear, calMonth)}
              </AppText>
              <Pressable
                onPress={handleNextMonth}
                disabled={!canGoNext}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Next month" // i18n-ignore
                accessibilityState={{ disabled: !canGoNext }}
                style={{ opacity: canGoNext ? 1 : 0.25 }}
              >
                <Feather name="chevron-right" size={20} color={colors.primary} />
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", marginBottom: 6 }}>
              {DAY_ABBRS.map((abbr, i) => (
                <View key={i} style={{ width: cellSize, alignItems: "center" }}>
                  <AppText
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 11,
                      color: colors.mutedForeground,
                    }}
                  >
                    {abbr}
                  </AppText>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {cells.map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={{ width: cellSize, height: cellSize }} />;
                }
                const iso = toIso(calYear, calMonth, day);
                const isPast = iso < todayIso;
                const isAfterMax = iso > maxIso;
                const isDisabled = disabledDates?.has(iso) ?? false;
                const unavailable = isPast || isAfterMax || isDisabled;
                const isSelected = iso === selectedDate;
                const isToday = iso === todayIso;

                return (
                  <Pressable
                    key={iso}
                    onPress={() => {
                      if (unavailable) return;
                      onSelectDate(iso);
                      setCalendarOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                    accessibilityState={{ disabled: unavailable, selected: isSelected }}
                    style={{ width: cellSize, height: cellSize, alignItems: "center", justifyContent: "center" }}
                  >
                    <View
                      style={{
                        width: cellSize - 4,
                        height: cellSize - 4,
                        borderRadius: (cellSize - 4) / 2,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isSelected
                          ? colors.primary
                          : isToday
                          ? todayHighlight
                          : "transparent",
                        opacity: unavailable ? 0.25 : 1,
                      }}
                    >
                      <AppText
                        style={{
                          fontFamily: isSelected ? "Inter_600SemiBold" : "Inter_400Regular",
                          fontSize: 13,
                          color: isSelected ? "#fff" : colors.primary,
                        }}
                      >
                        {day}
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
