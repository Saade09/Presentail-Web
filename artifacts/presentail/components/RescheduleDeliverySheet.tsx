import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useColors } from "@/hooks/useColors";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import { useCurrency } from "@/contexts/CurrencyContext";
import {
  dayLabels,
  firstAvailableSlot,
  getCountryHour,
  timeSlotsForCountry,
  type TimeSlot,
} from "@workspace/delivery";

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * In-place reschedule sheet for the cart. Renders the same day picker +
 * time-slot picker shape as checkout step 1 but writes back to the shared
 * delivery selection so the cart total drops the express surcharge as
 * soon as the shopper confirms.
 *
 * Confirming with today's date persists `today_slot`; any future date
 * persists `schedule`. "Keep Express" dismisses without changing state.
 */
export function RescheduleDeliverySheet({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useT();
  const deliverySelection = useDeliverySelection();
  const { selectedCountry } = useDeliveryLocation();
  const { currencyCode } = useCurrency();

  const countryCode =
    selectedCountry?.code ||
    (currencyCode === "AED" ? "AE" : currencyCode === "EUR" ? "CY" : "LB");

  const days = React.useMemo(
    () => dayLabels(t.checkoutDayToday, t.checkoutDayTomorrow),
    [t.checkoutDayToday, t.checkoutDayTomorrow],
  );
  const timeSlots = React.useMemo(
    () => timeSlotsForCountry(countryCode),
    [countryCode],
  );
  const localHour = React.useMemo(
    () => getCountryHour(countryCode),
    [countryCode],
  );
  const todayIso = days[0]?.iso ?? new Date().toISOString().slice(0, 10);

  // Local draft state — not persisted until the shopper hits Confirm.
  const [date, setDate] = React.useState<string>(todayIso);
  const [slotLabel, setSlotLabel] = React.useState<string | null>(null);

  // Each time the sheet opens, seed the draft with a sensible default:
  // today + the first slot whose cutoff hasn't passed. (Avoids carrying
  // a stale slot from a previous open.)
  React.useEffect(() => {
    if (!visible) return;
    setDate(todayIso);
    const initial = firstAvailableSlot(timeSlots, true, localHour);
    setSlotLabel(initial?.label ?? timeSlots[0]?.label ?? null);
  }, [visible, todayIso, timeSlots, localHour]);

  // If the shopper picks a future date, all slots are bookable; if they
  // jump back to today and their previously selected slot is now past,
  // bump them to the next available one.
  React.useEffect(() => {
    if (!visible) return;
    const isToday = date === todayIso;
    if (!slotLabel) {
      const initial = firstAvailableSlot(timeSlots, isToday, localHour);
      if (initial) setSlotLabel(initial.label);
      return;
    }
    const found = timeSlots.find((s) => s.label === slotLabel);
    if (!found) {
      const initial = firstAvailableSlot(timeSlots, isToday, localHour);
      setSlotLabel(initial?.label ?? null);
      return;
    }
    if (isToday && localHour >= found.cutoffHour) {
      const initial = firstAvailableSlot(timeSlots, true, localHour);
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
    onClose();
  };

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
            <Text
              style={{
                fontFamily: "PlayfairDisplay_500Medium",
                fontSize: 18,
                color: colors.primary,
              }}
            >
              {t.rescheduleSheetTitle}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                color: colors.mutedForeground,
                marginTop: 2,
              }}
            >
              {t.rescheduleSheetSubtitle}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={20} color={colors.primary} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
          <View
            style={{
              gap: 12,
              padding: 14,
              borderRadius: 14,
              backgroundColor: colors.secondary,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {days.map((d) => {
                const active = d.iso === date;
                return (
                  <Pressable
                    key={d.iso}
                    onPress={() => {
                      setDate(d.iso);
                      setSlotLabel(null);
                    }}
                    style={{
                      width: 56,
                      paddingVertical: 8,
                      borderRadius: 12,
                      alignItems: "center",
                      backgroundColor: active ? colors.primary : "#fff",
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_500Medium",
                        fontSize: 10,
                        color: active ? colors.goldSoft : colors.mutedForeground,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      {d.label}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "PlayfairDisplay_500Medium",
                        fontSize: 16,
                        color: active ? "#fff" : colors.primary,
                      }}
                    >
                      {d.date}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

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
                    <Text
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
                      {s.label}
                    </Text>
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
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                color: "#fff",
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              {t.rescheduleConfirm}
            </Text>
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
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: colors.primary,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              {t.rescheduleKeepExpress}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
