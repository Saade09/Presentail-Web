import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { CartUpsells } from "@/components/CartUpsells";
import { Price } from "@/components/Price";
import { RescheduleDeliverySheet } from "@/components/RescheduleDeliverySheet";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useColors } from "@/hooks/useColors";
import { useDeliveryConfig } from "@/hooks/useDeliveryConfig";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizedCityName } from "@/data/countryNamesLocalized";
import { trackEvent } from "@/lib/analytics";
import { loadCheckoutScreen, prefetchOnIdle } from "@/lib/prefetchScreens";
import {
  EXPRESS_CLOSE_HOUR,
  EXPRESS_OPEN_HOUR,
  dayLabels,
  expressSurchargeForCountry,
  formatDeliveryRow,
  getCountryHour,
  isExpressDeliveryAvailable,
  resolveSlotLabel,
  slotTimeRangeForLabel,
} from "@workspace/delivery";

function CartAddedScreen() {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const insets = useSafeAreaInsets();
  const t = useT();
  const { lang } = useLanguage();
  const { count, total, detailed } = useCart();
  const { currencyCode, convert } = useCurrency();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const deliverySelection = useDeliverySelection();
  const { freeDeliveryEnabled, freeDeliveryThresholdUsd: thresholdUsd } = useDeliveryConfig();
  const [rescheduleVisible, setRescheduleVisible] = React.useState(false);

  const countryCode =
    selectedCountry?.code ||
    (currencyCode === "AED" ? "AE" : currencyCode === "EUR" ? "CY" : "LB");

  const remainingUsd = Math.max(thresholdUsd - total, 0);
  const unlocked = total >= thresholdUsd;
  const progress = thresholdUsd > 0 ? Math.min(total / thresholdUsd, 1) : 1;

  const isExpress = deliverySelection.mode === "express";
  const expressFeeUsd = isExpress ? expressSurchargeForCountry(countryCode) : 0;
  const grandTotalUsd = total + expressFeeUsd;

  const days = React.useMemo(
    () => dayLabels(t.checkoutDayToday, t.checkoutDayTomorrow),
    [t.checkoutDayToday, t.checkoutDayTomorrow],
  );

  // Use only OS-configured slots for the selected city. An empty array means
  // no schedule has been published for this area yet.
  const cityTimeSlots = React.useMemo(
    () => selectedCity?.timeSlots ?? [],
    [selectedCity],
  );

  const expressAvailableForCity = React.useMemo(() => {
    if (selectedCity?.expressAvailable === false) return false;
    const h = getCountryHour(countryCode);
    const closeHour =
      typeof selectedCity?.sameDayCutoffHour === "number"
        ? selectedCity.sameDayCutoffHour
        : EXPRESS_CLOSE_HOUR;
    if (typeof selectedCity?.expressAvailable === "boolean") {
      return h >= EXPRESS_OPEN_HOUR && h < closeHour;
    }
    return isExpressDeliveryAvailable(countryCode);
  }, [selectedCity, countryCode]);

  const displaySlotLabel = React.useMemo(() => {
    if (deliverySelection.mode !== "today_slot") return deliverySelection.slotLabel;
    const isToday = deliverySelection.date === days[0]?.iso;
    return resolveSlotLabel(
      deliverySelection.slotLabel,
      cityTimeSlots,
      isToday,
      getCountryHour(countryCode),
    );
  }, [deliverySelection.mode, deliverySelection.slotLabel, deliverySelection.date, countryCode, days, cityTimeSlots]);

  const deliveryRowValue = formatDeliveryRow({
    mode: deliverySelection.mode,
    date: deliverySelection.date,
    slotLabel: displaySlotLabel,
    slotTimeRange: slotTimeRangeForLabel(displaySlotLabel, cityTimeSlots),
    days,
    expressLabel: t.expressDelivery,
  });

  React.useEffect(() => {
    trackEvent({ name: "cart_viewed", surface: "cart" });
    prefetchOnIdle([loadCheckoutScreen]);
  }, []);

  if (detailed.length === 0) {
    router.replace("/(tabs)/cart");
    return null;
  }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* ── Header ── */}
        <View
          style={{
            paddingTop: insets.top + 14,
            paddingBottom: 14,
            paddingHorizontal: 20,
            backgroundColor: colors.background,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <AppText
              style={{
                fontFamily: headingFontMedium,
                fontSize: 18,
                color: colors.primary,
              }}
            >
              {t.cartAddedBanner}
            </AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <AppText
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: colors.mutedForeground,
                }}
              >
                {t.cartTotalLabel}:{" "}
              </AppText>
              <Price
                value={grandTotalUsd}
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                  color: colors.primary,
                }}
                symbolSize={11}
              />
            </View>
          </View>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t.previewCardClose}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 32,
              height: 32,
              borderRadius: 999,
              backgroundColor: pressed ? colors.primary + "1A" : colors.muted,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Feather name="x" size={16} color={colors.primary} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20, gap: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Free delivery nudge ── */}
          {freeDeliveryEnabled && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
                backgroundColor: "#fff",
                borderRadius: 14,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Feather name="truck" size={18} color={colors.primary} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, gap: 6 }}>
                {unlocked ? (
                  <AppText
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 13,
                      color: colors.primary,
                    }}
                  >
                    {t.cartFreeDeliveryUnlocked}
                  </AppText>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                    <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}>
                      {t.cartFreeDeliveryRemainingPrefix}{" "}
                    </AppText>
                    <Price
                      value={convert(remainingUsd)}
                      native
                      style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.primary }}
                      symbolSize={11}
                    />
                    <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}>
                      {" "}{t.cartFreeDeliveryRemainingSuffix}
                    </AppText>
                  </View>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View
                    style={{
                      flex: 1,
                      height: 6,
                      borderRadius: 999,
                      backgroundColor: colors.background,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        width: `${Math.round(progress * 100)}%`,
                        height: "100%",
                        backgroundColor: colors.gold,
                      }}
                    />
                  </View>
                  <Price
                    value={total}
                    style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.primary }}
                    symbolSize={10}
                  />
                </View>
                <AppText
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 11,
                    color: colors.mutedForeground,
                  }}
                >
                  {t.cartFreeDeliveryExpressNote}
                </AppText>
              </View>
            </View>
          )}

          <CartUpsells />

          {/* ── Delivery slot row ── */}
          <Pressable
            onPress={() => setRescheduleVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={deliveryRowValue ?? t.cartSelectDateTimePrompt}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              backgroundColor: colors.primary + "0D",
              borderRadius: 14,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: colors.primary + "33",
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                backgroundColor: colors.primary + "1A",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="calendar" size={12} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText
                numberOfLines={1}
                style={{
                  fontFamily: deliveryRowValue ? "Inter_600SemiBold" : "Inter_400Regular",
                  fontSize: 13,
                  color: deliveryRowValue ? colors.primary : colors.mutedForeground,
                }}
              >
                {deliveryRowValue
                  ? `${t.cartDelivery}: ${deliveryRowValue}`
                  : t.cartSelectDateTimePrompt}
              </AppText>
              {selectedCity?.name ? (
                <AppText
                  numberOfLines={1}
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 11,
                    color: colors.mutedForeground,
                  }}
                >
                  {localizedCityName(lang, selectedCity.id, selectedCity.name)}
                </AppText>
              ) : null}
            </View>
            <Feather name={deliveryRowValue ? "edit-2" : "chevron-right"} size={14} color={colors.mutedForeground} />
          </Pressable>
        </ScrollView>

        {/* ── Sticky bottom bar ── */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: insets.bottom + 16,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
            flexDirection: "row",
            gap: 12,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 999,
              paddingVertical: 14,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1.5,
              borderColor: colors.primary,
              backgroundColor: pressed ? colors.primary + "12" : "transparent",
            })}
          >
            <AppText
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                color: colors.primary,
                letterSpacing: 0.6,
              }}
            >
              {t.continueShopping}
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => router.replace("/(tabs)/cart")}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 999,
              paddingVertical: 14,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 4,
              backgroundColor: colors.primary,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <AppText
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                color: "#fff",
                letterSpacing: 0.6,
              }}
            >
              {t.cartAddedViewCart} ·{" "}
            </AppText>
            <Price
              value={grandTotalUsd}
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                color: "#fff",
                letterSpacing: 0.6,
              }}
              symbolSize={11}
            />
          </Pressable>
        </View>
      </View>

      <RescheduleDeliverySheet
        visible={rescheduleVisible}
        onClose={() => setRescheduleVisible(false)}
        initialMode={deliverySelection.mode}
        expressAvailable={expressAvailableForCity}
        expressSurchargeUsd={expressSurchargeForCountry(countryCode)}
      />
    </>
  );
}

export default withRouteErrorBoundary(CartAddedScreen, "cart-added");
