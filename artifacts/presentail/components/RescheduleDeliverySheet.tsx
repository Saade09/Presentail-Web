import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Alert,
  Modal,
  Pressable,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import { useCurrency } from "@/contexts/CurrencyContext";
import { DateStrip } from "@/components/DateStrip";
import {
  dayLabels,
  firstAvailableDay,
  firstAvailableSlot,
  getCountryHour,
  nearestSlotForHour,
  timeSlotsForCountry,
  type TimeSlot,
} from "@workspace/delivery";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called after the shopper confirms a scheduled slot (not express). */
  onConfirm?: () => void;
  /** The delivery mode that was active when the sheet was opened. */
  initialMode?: "express" | "today_slot" | "schedule" | null;
  /** Whether express delivery is currently available (8 AM – 10 PM window). */
  expressAvailable?: boolean;
  /** Express surcharge in USD for the current country. */
  expressSurchargeUsd?: number;
};

/**
 * In-place delivery-time picker for the cart. Works for all delivery modes:
 *
 * - Opened from a scheduled slot: shows Express tile + day/slot picker.
 *   Tapping Express immediately switches to express mode and closes.
 *   Secondary button is "Cancel".
 * - Opened from express: shows Express tile (pre-selected) + day/slot picker
 *   to switch away. Secondary button is "Keep Express Delivery".
 *
 * Confirming any slot change writes back to DeliverySelectionContext so the
 * cart total updates (express surcharge appears/disappears) without leaving
 * the cart.
 */
export function RescheduleDeliverySheet({
  visible,
  onClose,
  onConfirm,
  initialMode,
  expressAvailable = false,
  expressSurchargeUsd = 0,
}: Props) {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const insets = useSafeAreaInsets();
  const t = useT();
  const deliverySelection = useDeliverySelection();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const { currencyCode, convert, formatNative } = useCurrency();

  const countryCode =
    selectedCountry?.code ||
    (currencyCode === "AED" ? "AE" : currencyCode === "EUR" ? "CY" : "LB");

  const days = React.useMemo(
    () => dayLabels(t.checkoutDayToday, t.checkoutDayTomorrow),
    [t.checkoutDayToday, t.checkoutDayTomorrow],
  );
  // Use OS-configured slots for the selected city when available, falling back
  // to the hardcoded per-country table so existing behaviour is preserved.
  const timeSlots = React.useMemo(() => {
    const raw = selectedCity?.timeSlots?.length
      ? selectedCity.timeSlots
      : timeSlotsForCountry(countryCode);
    return [...raw].sort(
      (a, b) => (a.startHour ?? a.cutoffHour) - (b.startHour ?? b.cutoffHour),
    );
  }, [selectedCity, countryCode]);
  const localHour = React.useMemo(
    () => getCountryHour(countryCode),
    [countryCode],
  );
  const todayIso = days[0]?.iso ?? new Date().toISOString().slice(0, 10);

  const [date, setDate] = React.useState<string>(todayIso);
  const [slotLabel, setSlotLabel] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) return;
    // Seed from the existing delivery selection when one is already in place,
    // so adding a second product inherits the slot already chosen for the first.
    if (
      (deliverySelection.mode === "today_slot" || deliverySelection.mode === "schedule") &&
      deliverySelection.date &&
      deliverySelection.slotLabel
    ) {
      setDate(deliverySelection.date);
      setSlotLabel(deliverySelection.slotLabel);
      return;
    }
    const todaySlot = nearestSlotForHour(timeSlots, true, localHour);
    if (todaySlot) {
      setDate(todayIso);
      setSlotLabel(todaySlot.label);
    } else {
      const next = firstAvailableDay(todayIso, timeSlots, localHour, todayIso);
      if (next) {
        setDate(next.iso);
        setSlotLabel(next.slot.label);
      } else {
        setDate(todayIso);
        setSlotLabel(timeSlots[0]?.label ?? null);
      }
    }
  }, [visible, todayIso, timeSlots, localHour]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!visible) return;
    const isToday = date === todayIso;
    if (!slotLabel) {
      const initial = nearestSlotForHour(timeSlots, isToday, localHour);
      if (initial) setSlotLabel(initial.label);
      return;
    }
    const found = timeSlots.find((s) => s.label === slotLabel);
    if (!found) {
      const initial = nearestSlotForHour(timeSlots, isToday, localHour);
      setSlotLabel(initial?.label ?? null);
      return;
    }
    if (isToday && localHour >= found.cutoffHour) {
      const initial = nearestSlotForHour(timeSlots, true, localHour);
      setSlotLabel(initial?.label ?? null);
    }
  }, [date, todayIso, timeSlots, localHour, visible, slotLabel]);

  const handleConfirm = () => {
    if (!slotLabel) return;
    deliverySelection.setSelection({
      mode: date === todayIso ? "today_slot" : "schedule",
      date,
      slotLabel,
    });
    onConfirm?.();
    onClose();
  };

  const handlePickExpress = () => {
    if (!expressAvailable) return;
    deliverySelection.setSelection({ mode: "express", date: null, slotLabel: null });
    onClose();
  };

  const openedFromExpress = initialMode === "express";
  const subtitle = openedFromExpress
    ? t.rescheduleSheetSubtitle
    : t.rescheduleSheetSubtitleScheduled;

  const expressSurchargeDisplay = expressSurchargeUsd > 0
    ? ` · +${formatNative(convert(expressSurchargeUsd))}`
    : "";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} />
      </TouchableWithoutFeedback>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingBottom: insets.bottom + 16,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: -4 },
          elevation: 20,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: 18,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <AppText
              style={{
                fontFamily: headingFontMedium,
                fontSize: 18,
                color: colors.primary,
              }}
            >
              {t.rescheduleSheetTitle}
            </AppText>
            <AppText
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                color: colors.mutedForeground,
                marginTop: 2,
              }}
            >
              {subtitle}
            </AppText>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={20} color={colors.primary} />
          </Pressable>
        </View>

        {/* Express tile */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
          <Pressable
            onPress={handlePickExpress}
            disabled={!expressAvailable}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 14,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: openedFromExpress ? colors.primary : colors.border,
              backgroundColor: openedFromExpress
                ? colors.primary
                : expressAvailable
                  ? "#fff"
                  : "#f5f5f5",
              opacity: !expressAvailable ? 0.5 : pressed ? 0.88 : 1,
            })}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: openedFromExpress
                  ? "rgba(255,255,255,0.15)"
                  : colors.secondary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather
                name="zap"
                size={18}
                color={openedFromExpress ? "#fff" : colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppText
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                  color: openedFromExpress ? "#fff" : colors.primary,
                }}
              >
                {t.rescheduleExpressTile}
              </AppText>
              <AppText
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 11,
                  color: openedFromExpress
                    ? "rgba(255,255,255,0.75)"
                    : expressAvailable
                      ? colors.mutedForeground
                      : colors.mutedForeground,
                  marginTop: 1,
                }}
              >
                {expressAvailable
                  ? expressSurchargeDisplay
                    ? `${t.expressDelivery}${expressSurchargeDisplay}`
                    : t.expressDelivery
                  : t.rescheduleExpressUnavailable}
              </AppText>
            </View>
            {openedFromExpress && (
              <Feather name="check" size={16} color="#fff" />
            )}
            <Pressable
              onPress={(e) => { e.stopPropagation(); Alert.alert(t.expressInfoPopupTitle, expressSurchargeUsd > 0 ? `${t.expressInfoPopupBody}\n\n+${formatNative(convert(expressSurchargeUsd))}` : t.expressInfoPopupBody); }}
              hitSlop={8}
              style={{ position: "absolute", top: 8, right: 8 }}
            >
              <Feather
                name="info"
                size={14}
                color={openedFromExpress ? "rgba(255,255,255,0.7)" : colors.mutedForeground}
              />
            </Pressable>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <View
            style={{
              gap: 12,
              padding: 14,
              borderRadius: 14,
              backgroundColor: colors.background,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <DateStrip
              days={days}
              selectedDate={date}
              onSelectDate={(iso) => {
                setDate(iso);
                setSlotLabel(null);
              }}
              colors={colors}
              moreLabel={t.dateStripMoreLabel}
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {timeSlots.map((s: TimeSlot) => {
                const isToday = date === todayIso;
                const past = isToday && localHour >= s.cutoffHour;
                const active = slotLabel === s.label;
                return (
                  <Pressable
                    key={s.label}
                    onPress={() => {
                      if (!past) setSlotLabel(s.label);
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active
                        ? colors.primary
                        : past
                          ? "#f5f5f5"
                          : "#fff",
                      opacity: past ? 0.5 : 1,
                    }}
                  >
                    <AppText
                      style={{
                        fontFamily: "Inter_500Medium",
                        fontSize: 11,
                        color: active
                          ? "#fff"
                          : past
                            ? colors.mutedForeground
                            : colors.primary,
                        textDecorationLine: past ? "line-through" : "none",
                      }}
                    >
                      {s.startHour !== undefined && s.endHour !== undefined
                        ? `${String(s.startHour).padStart(2, "0")}:00–${String(s.endHour).padStart(2, "0")}:00`
                        : s.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 18,
            gap: 10,
          }}
        >
          <Pressable
            onPress={handleConfirm}
            disabled={!slotLabel}
            style={({ pressed }) => ({
              backgroundColor: colors.primary,
              borderRadius: 999,
              paddingVertical: 15,
              alignItems: "center",
              opacity: !slotLabel ? 0.5 : pressed ? 0.88 : 1,
            })}
          >
            <AppText
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                color: "#fff",
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              {t.rescheduleConfirm}
            </AppText>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({
              borderRadius: 999,
              paddingVertical: 13,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: "#fff",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <AppText
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: colors.primary,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              {openedFromExpress ? t.rescheduleKeepExpress : t.rescheduleCancel}
            </AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
