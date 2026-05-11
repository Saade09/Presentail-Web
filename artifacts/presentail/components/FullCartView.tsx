import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CartUpsells } from "@/components/CartUpsells";
import { CheckoutLoginSheet } from "@/components/CheckoutLoginSheet";
import { Price } from "@/components/Price";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useColors } from "@/hooks/useColors";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import {
  dayLabels,
  expressSurchargeForCountry,
  formatDeliveryRow,
  getCountryHour,
  resolveSlotLabel,
  timeSlotsForCountry,
} from "@workspace/delivery";
import { freeDeliveryThresholdUsd } from "@/lib/freeDelivery";

type FullCartViewProps = {
  showBackButton?: boolean;
  /**
   * Bottom offset (in px) the pinned footer must clear, e.g. the height of a
   * floating bottom tab bar that overlays this screen. When omitted we fall
   * back to BottomTabBarHeightContext (set by @react-navigation/bottom-tabs
   * when this view is mounted inside the tab navigator) and ultimately to the
   * safe-area inset for the standalone (back-button) variant.
   */
  bottomOffset?: number;
};

export function FullCartView({ showBackButton = true, bottomOffset }: FullCartViewProps) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ctxTabBarHeight = React.useContext(BottomTabBarHeightContext) ?? 0;
  // Height of any overlay sitting above this screen's content (e.g. the
  // floating bottom tab bar). Prefer an explicit value passed in, otherwise
  // fall back to the navigator context, otherwise the bare safe-area inset.
  const overlay = Math.max(bottomOffset ?? ctxTabBarHeight, insets.bottom);
  const [footerHeight, setFooterHeight] = React.useState(0);
  const { user } = useAuth();
  const [loginSheetVisible, setLoginSheetVisible] = React.useState(false);
  const { detailed, total, setQty, remove, clear } = useCart();
  const { selectedCountry } = useDeliveryLocation();
  const { currencyCode, convert } = useCurrency();
  const t = useT();
  const deliverySelection = useDeliverySelection();

  const countryCode =
    selectedCountry?.code ||
    (currencyCode === "AED" ? "AE" : currencyCode === "EUR" ? "CY" : "LB");
  const thresholdUsd = freeDeliveryThresholdUsd(countryCode);
  const remainingUsd = Math.max(thresholdUsd - total, 0);
  const unlocked = total >= thresholdUsd;
  const progress = thresholdUsd > 0 ? Math.min(total / thresholdUsd, 1) : 1;

  const days = React.useMemo(
    () => dayLabels(t.checkoutDayToday, t.checkoutDayTomorrow),
    [t.checkoutDayToday, t.checkoutDayTomorrow],
  );
  const expressSurchargeUsd = expressSurchargeForCountry(countryCode);
  const isExpress = deliverySelection.mode === "express";
  const expressFeeUsd = isExpress ? expressSurchargeUsd : 0;
  const grandTotalUsd = total + expressFeeUsd;
  // Resolve the persisted slot label against the current country's slot list
  // and country-local hour so a previously-picked AE slot stays AE (not
  // rewritten to LB) and a today-slot whose cutoff has already passed
  // displays as the next available slot instead of one that can no longer
  // be booked. The persisted state itself is left untouched here — checkout's
  // mount effect repairs it when the user opens checkout.
  const displaySlotLabel = React.useMemo(() => {
    if (deliverySelection.mode !== "today_slot") return deliverySelection.slotLabel;
    const slots = timeSlotsForCountry(countryCode);
    const isToday = deliverySelection.date === days[0]?.iso;
    return resolveSlotLabel(
      deliverySelection.slotLabel,
      slots,
      isToday,
      getCountryHour(countryCode),
    );
  }, [deliverySelection.mode, deliverySelection.slotLabel, deliverySelection.date, countryCode, days]);
  const deliveryRowValue = formatDeliveryRow({
    mode: deliverySelection.mode,
    date: deliverySelection.date,
    slotLabel: displaySlotLabel,
    days,
    expressLabel: t.expressDelivery,
  });

  const goPickDeliveryTime = React.useCallback(() => {
    router.push({ pathname: "/checkout", params: { step: "1" } });
  }, [router]);

  return (
    <>
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 24,
          paddingBottom: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {showBackButton ? (
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Feather name="arrow-left" size={22} color={colors.primary} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, color: colors.primary }}>
          {t.cartTitleBag}
        </Text>
        <Pressable onPress={clear} hitSlop={10}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground }}>
            {t.cartClear}
          </Text>
        </Pressable>
      </View>

      {detailed.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 36, gap: 14 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 999,
              backgroundColor: colors.secondary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="shopping-bag" size={28} color={colors.primary} />
          </View>
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: colors.primary, textAlign: "center" }}>
            {t.cartEmptyBag}
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
            {t.cartEmptyBagDesc}
          </Text>
          <Pressable
            onPress={() => router.replace("/(tabs)/catalog")}
            style={{ marginTop: 8, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 999, backgroundColor: colors.primary }}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", color: "#fff", letterSpacing: 1, textTransform: "uppercase", fontSize: 12, textAlign: "center" }}>
              {t.cartBrowseBoutique}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingBottom: footerHeight + overlay + 24,
              gap: 14,
            }}
          >
            {detailed.map(({ product, qty, lineTotal }) => (
              <View
                key={product.id}
                style={{
                  flexDirection: "row",
                  gap: 14,
                  backgroundColor: "#fff",
                  borderRadius: 18,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Pressable onPress={() => router.push({ pathname: "/product/[slug]", params: { slug: product.id } })}>
                  <Image
                    source={product.image}
                    style={{ width: 84, height: 84, borderRadius: 12, backgroundColor: colors.muted }}
                    contentFit="cover"
                  />
                </Pressable>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text numberOfLines={2} style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.primary }}>
                    {product.name}
                  </Text>
                  <Price
                    value={lineTotal}
                    native
                    style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 16, color: colors.primary }}
                  />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 999 }}>
                      <Pressable onPress={() => setQty(product.id, qty - 1)} style={styles.qtyBtn}>
                        <Feather name="minus" size={12} color={colors.primary} />
                      </Pressable>
                      <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.primary, paddingHorizontal: 12, fontSize: 12 }}>
                        {qty}
                      </Text>
                      <Pressable onPress={() => setQty(product.id, qty + 1)} style={styles.qtyBtn}>
                        <Feather name="plus" size={12} color={colors.primary} />
                      </Pressable>
                    </View>
                    <Pressable onPress={() => remove(product.id)} hitSlop={8}>
                      <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}

            <View style={{ marginTop: 10 }}>
              <CartUpsells />
            </View>
          </ScrollView>

          <View
            onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: overlay,
              backgroundColor: "#fff",
              borderTopWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 24,
              paddingTop: 16,
              paddingBottom: 16,
              gap: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                backgroundColor: colors.secondary,
                borderRadius: 16,
                padding: 12,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  backgroundColor: "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="truck" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                {unlocked ? (
                  <Text
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 12,
                      color: colors.primary,
                    }}
                  >
                    {t.cartFreeDeliveryUnlocked}
                  </Text>
                ) : (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_500Medium",
                        fontSize: 12,
                        color: colors.primary,
                      }}
                    >
                      {t.cartFreeDeliveryRemainingPrefix}{" "}
                    </Text>
                    <Price
                      value={convert(remainingUsd)}
                      native
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 12,
                        color: colors.primary,
                      }}
                      symbolSize={11}
                    />
                    <Text
                      style={{
                        fontFamily: "Inter_500Medium",
                        fontSize: 12,
                        color: colors.primary,
                      }}
                    >
                      {" "}{t.cartFreeDeliveryRemainingSuffix}
                    </Text>
                  </View>
                )}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      height: 6,
                      borderRadius: 999,
                      backgroundColor: "#fff",
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
                    native
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 11,
                      color: colors.primary,
                    }}
                    symbolSize={10}
                  />
                </View>
              </View>
            </View>
            <Pressable
              onPress={goPickDeliveryTime}
              accessibilityRole="button"
              accessibilityLabel={deliveryRowValue ?? t.cartSelectDateTimePrompt}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                backgroundColor: colors.secondary,
                borderRadius: 14,
                paddingVertical: 12,
                paddingHorizontal: 14,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  backgroundColor: "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="calendar" size={14} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 11,
                    color: colors.mutedForeground,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}
                >
                  {t.cartDeliveryWhenLabel}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: deliveryRowValue ? "Inter_600SemiBold" : "Inter_400Regular",
                    fontSize: 13,
                    color: deliveryRowValue ? colors.primary : colors.mutedForeground,
                  }}
                >
                  {deliveryRowValue ?? t.cartSelectDateTimePrompt}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
                {t.subtotal}
              </Text>
              <Price
                value={total}
                native
                style={{ fontFamily: "Inter_500Medium", color: colors.primary, fontSize: 13 }}
              />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
                {t.cartDelivery}
              </Text>
              <Text style={{ fontFamily: "Inter_500Medium", color: colors.gold, fontSize: 13 }}>
                {t.cartFree}
              </Text>
            </View>
            {isExpress ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
                  {t.expressDelivery}
                </Text>
                <Price
                  value={expressFeeUsd}
                  native
                  style={{ fontFamily: "Inter_500Medium", color: colors.primary, fontSize: 13 }}
                />
              </View>
            ) : null}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: "PlayfairDisplay_500Medium", color: colors.primary, fontSize: 18 }}>
                {t.cartTotal}
              </Text>
              <Price
                value={grandTotalUsd}
                native
                style={{ fontFamily: "PlayfairDisplay_500Medium", color: colors.primary, fontSize: 22 }}
              />
            </View>
            <Pressable
              onPress={() => {
                if (!user) {
                  setLoginSheetVisible(true);
                  return;
                }
                router.push("/checkout");
              }}
              style={({ pressed }) => [
                {
                  backgroundColor: colors.primary,
                  paddingVertical: 16,
                  borderRadius: 999,
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 10,
                  opacity: pressed ? 0.9 : 1,
                  marginTop: 4,
                },
              ]}
            >
              <Feather name="lock" size={14} color="#fff" />
              <Text style={{ fontFamily: "Inter_600SemiBold", color: "#fff", letterSpacing: 1.5, textTransform: "uppercase", fontSize: 12, textAlign: "center" }}>
                {t.cartProceed}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
    <CheckoutLoginSheet
      visible={loginSheetVisible}
      onClose={() => setLoginSheetVisible(false)}
      onAuthSuccess={() => {
        setLoginSheetVisible(false);
        router.push("/checkout");
      }}
      onContinueAsGuest={() => {
        setLoginSheetVisible(false);
        router.push("/checkout");
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  qtyBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
});
