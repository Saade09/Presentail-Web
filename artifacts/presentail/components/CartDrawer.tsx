import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
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

import { CartUpsells } from "@/components/CartUpsells";
import { CheckoutLoginSheet } from "@/components/CheckoutLoginSheet";
import { Price } from "@/components/Price";
import { RescheduleDeliverySheet } from "@/components/RescheduleDeliverySheet";
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
  isExpressDeliveryAvailable,
  resolveSlotLabel,
  timeSlotsForCountry,
} from "@workspace/delivery";
import { freeDeliveryThresholdUsd } from "@/lib/freeDelivery";
import { trackEvent } from "@/lib/analytics";

export function CartDrawer() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [loginSheetVisible, setLoginSheetVisible] = React.useState(false);
  const [rescheduleVisible, setRescheduleVisible] = React.useState(false);
  const { isCartOpen, closeCart, requestNavigation, detailed, count, total, remove, setQty } = useCart();
  // CartDrawer is rendered outside RootLayoutNav (sibling), so router.push from
  // here has no Stack navigator to push onto. Instead we call requestNavigation()
  // which sets pendingNavigation in CartContext + closes the modal. The
  // CartNavigationHandler component (inside the Stack in _layout.tsx) picks up
  // that signal and fires router.push once the modal is gone.
  const goToCheckout = React.useCallback(() => {
    requestNavigation("/checkout");
  }, [requestNavigation]);

  // Emit one cart_viewed funnel event each time the drawer opens. Using
  // a wasOpen ref so quick re-renders while the drawer is already open
  // don't duplicate the entry-point event.
  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (isCartOpen && !wasOpenRef.current) {
      trackEvent({ name: "cart_viewed", surface: "cart" });
    }
    wasOpenRef.current = isCartOpen;
  }, [isCartOpen]);
  const { formatNative, currencyCode, convert } = useCurrency();
  const { selectedCountry } = useDeliveryLocation();
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
  const isExpress = deliverySelection.mode === "express";
  const expressFeeUsd = isExpress ? expressSurchargeForCountry(countryCode) : 0;
  const grandTotalUsd = total + expressFeeUsd;
  // Resolve persisted slot against current country + country-local hour for
  // display; see FullCartView for the rationale (do not rewrite persisted
  // state here — checkout's mount effect repairs it).
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
    setRescheduleVisible(true);
  }, []);

  return (
    <>
    <Modal
      visible={isCartOpen}
      transparent
      animationType="slide"
      onRequestClose={closeCart}
    >
      <TouchableWithoutFeedback onPress={closeCart}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} />
      </TouchableWithoutFeedback>

      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: "80%",
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
            paddingTop: 20,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, color: colors.primary }}>
            Your Cart {count > 0 ? `(${count})` : ""}
          </Text>
          <Pressable onPress={closeCart} hitSlop={12}>
            <Feather name="x" size={22} color={colors.primary} />
          </Pressable>
        </View>

        {detailed.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 48, gap: 12 }}>
            <Feather name="shopping-bag" size={40} color={colors.mutedForeground} />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.mutedForeground }}>
              Your cart is empty
            </Text>
          </View>
        ) : (
          <>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 14, gap: 14 }}
              showsVerticalScrollIndicator={false}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  backgroundColor: "#fff",
                  borderRadius: 16,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
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

              {detailed.map(({ product, qty, lineTotal }) => (
                <View
                  key={product.id}
                  style={{
                    flexDirection: "row",
                    gap: 14,
                    backgroundColor: "#fff",
                    borderRadius: 16,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Image
                    source={product.image}
                    style={{ width: 70, height: 70, borderRadius: 10 }}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.primary }}
                    >
                      {product.name}
                    </Text>
                    <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 15, color: colors.primary }}>
                      {formatNative(lineTotal)}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Pressable
                        onPress={() => setQty(product.id, qty - 1)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          backgroundColor: colors.background,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        hitSlop={6}
                      >
                        <Feather name="minus" size={12} color={colors.primary} />
                      </Pressable>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primary, minWidth: 20, textAlign: "center" }}>
                        {qty}
                      </Text>
                      <Pressable
                        onPress={() => setQty(product.id, qty + 1)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          backgroundColor: colors.background,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        hitSlop={6}
                      >
                        <Feather name="plus" size={12} color={colors.primary} />
                      </Pressable>
                      <Pressable onPress={() => remove(product.id)} hitSlop={8} style={{ marginLeft: "auto" }}>
                        <Feather name="trash-2" size={14} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}

              <View style={{ marginTop: 8 }}>
                <CartUpsells />
              </View>
            </ScrollView>

            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 14,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                gap: 12,
              }}
            >
              <Pressable
                onPress={goPickDeliveryTime}
                accessibilityRole="button"
                accessibilityLabel={deliveryRowValue ?? t.cartSelectDateTimePrompt}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  backgroundColor: colors.background,
                  borderRadius: 14,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    backgroundColor: "#fff",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="calendar" size={12} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 10,
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
                      fontSize: 12,
                      color: deliveryRowValue ? colors.primary : colors.mutedForeground,
                    }}
                  >
                    {deliveryRowValue ?? t.cartSelectDateTimePrompt}
                  </Text>
                </View>
                <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
              </Pressable>
              {isExpress ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                    {t.expressDelivery}
                  </Text>
                  <Price
                    value={expressFeeUsd}
                    native
                    style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.primary }}
                  />
                </View>
              ) : null}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.mutedForeground }}>
                  Total
                </Text>
                <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, color: colors.primary }}>
                  {formatNative(grandTotalUsd)}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  if (!user) {
                    setLoginSheetVisible(true);
                    return;
                  }
                  goToCheckout();
                }}
                style={({ pressed }) => ({
                  backgroundColor: colors.primary,
                  borderRadius: 999,
                  paddingVertical: 16,
                  alignItems: "center",
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff", letterSpacing: 1 }}>
                  CHECKOUT · {formatNative(grandTotalUsd)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  requestNavigation("/(tabs)/cart");
                }}
                style={{ alignItems: "center", paddingVertical: 4 }}
              >
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>
                  View full cart
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
    <RescheduleDeliverySheet
      visible={rescheduleVisible}
      onClose={() => setRescheduleVisible(false)}
      initialMode={deliverySelection.mode}
      expressAvailable={isExpressDeliveryAvailable(countryCode)}
      expressSurchargeUsd={expressSurchargeForCountry(countryCode)}
    />
    <CheckoutLoginSheet
      visible={loginSheetVisible}
      surface="cart"
      onClose={() => setLoginSheetVisible(false)}
      onAuthSuccess={() => {
        setLoginSheetVisible(false);
        goToCheckout();
      }}
      onContinueAsGuest={() => {
        setLoginSheetVisible(false);
        goToCheckout();
      }}
    />
    </>
  );
}
