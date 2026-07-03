import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
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
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
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
  timeSlotsForCountry,
} from "@workspace/delivery";
import { useDeliveryConfig } from "@/hooks/useDeliveryConfig";
import { trackEvent } from "@/lib/analytics";
import { loadCheckoutScreen, prefetchOnIdle } from "@/lib/prefetchScreens";

export function CartDrawer() {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const insets = useSafeAreaInsets();
  const { user: _user } = useAuth();
  const [loginSheetVisible, setLoginSheetVisible] = React.useState(false);
  const [rescheduleVisible, setRescheduleVisible] = React.useState(false);
  const { isCartOpen, closeCart, items, detailed, count, total, remove, setQty, setCustomNote, priceUpdatedProductIds, dismissPriceUpdated } = useCart();

  // Navigation from inside a Modal portal is unreliable — the native view
  // sits above the Stack navigator and router.push is silently swallowed.
  // Instead: store the destination in a ref, call closeCart(), then fire the
  // navigation in a useEffect 350 ms after isCartOpen becomes false (giving
  // the native slide-out animation time to fully complete).
  const pendingNavRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!isCartOpen && pendingNavRef.current) {
      const path = pendingNavRef.current;
      pendingNavRef.current = null;
      const t = setTimeout(() => {
        router.navigate(path as any);
      }, 350);
      return () => clearTimeout(t);
    }
  }, [isCartOpen]);

  const goToCart = React.useCallback(() => {
    pendingNavRef.current = "/(tabs)/cart";
    closeCart();
  }, [closeCart]);

  // Emit one cart_viewed funnel event each time the drawer opens. Using
  // a wasOpen ref so quick re-renders while the drawer is already open
  // don't duplicate the entry-point event.
  // Also kick off a checkout-screen prefetch — opening the cart is a
  // strong signal that the user may proceed to checkout.
  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (isCartOpen && !wasOpenRef.current) {
      trackEvent({ name: "cart_viewed", surface: "cart" });
      prefetchOnIdle([loadCheckoutScreen]);
    }
    wasOpenRef.current = isCartOpen;
  }, [isCartOpen]);
  const { formatPrice, currencyCode, convert } = useCurrency();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const t = useT();
  const deliverySelection = useDeliverySelection();

  const countryCode =
    selectedCountry?.code ||
    (currencyCode === "AED" ? "AE" : currencyCode === "EUR" ? "CY" : "LB");
  const { freeDeliveryEnabled, freeDeliveryThresholdUsd: thresholdUsd } = useDeliveryConfig();
  const remainingUsd = Math.max(thresholdUsd - total, 0);
  const unlocked = total >= thresholdUsd;
  const progress = thresholdUsd > 0 ? Math.min(total / thresholdUsd, 1) : 1;

  const days = React.useMemo(
    () => dayLabels(t.checkoutDayToday, t.checkoutDayTomorrow),
    [t.checkoutDayToday, t.checkoutDayTomorrow],
  );
  const isExpress = deliverySelection.mode === "express";
  const expressFeeUsd = isExpress ? expressSurchargeForCountry(countryCode) : 0;
  // Resolve persisted slot against current country + country-local hour for
  // display; see FullCartView for the rationale (do not rewrite persisted
  // state here — checkout's mount effect repairs it).
  // Use OS-configured slots for the selected city when available, falling back
  // to the hardcoded per-country table so existing behaviour is preserved.
  const cityTimeSlots = React.useMemo(
    () =>
      selectedCity?.timeSlots?.length
        ? selectedCity.timeSlots
        : timeSlotsForCountry(countryCode),
    [selectedCity, countryCode],
  );
  // Express availability: honour the OS flag/cutoff when the city has OS config,
  // otherwise fall back to the hardcoded 8 AM–10 PM window.
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
          <AppText style={{ fontFamily: headingFontMedium, fontSize: 20, color: colors.primary }}>
            {t.cartTitle}{count > 0 ? ` (${count})` : ""}
          </AppText>
          <Pressable onPress={closeCart} hitSlop={12}>
            <Feather name="x" size={22} color={colors.primary} />
          </Pressable>
        </View>

        {detailed.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 48, gap: 12 }}>
            <Feather name="shopping-bag" size={40} color={colors.mutedForeground} />
            <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.mutedForeground }}>
              {t.cartEmpty}
            </AppText>
          </View>
        ) : (
          <>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 14, gap: 14 }}
              showsVerticalScrollIndicator={false}
            >
              {priceUpdatedProductIds.length > 0 && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 10,
                    backgroundColor: "#FEF9EC",
                    borderRadius: 14,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: "#F5D97A",
                  }}
                >
                  <Feather name="info" size={14} color="#B88A00" style={{ marginTop: 1 }} />
                  <AppText style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: "#7A5A00", lineHeight: 17 }}>
                    {t.cartPriceUpdatedBanner}
                  </AppText>
                  <Pressable onPress={dismissPriceUpdated} hitSlop={10}>
                    <Feather name="x" size={14} color="#B88A00" />
                  </Pressable>
                </View>
              )}
              {freeDeliveryEnabled && (
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
                    <AppText
                      style={{
                        fontFamily: "Inter_500Medium",
                        fontSize: 12,
                        color: colors.primary,
                      }}
                    >
                      {t.cartFreeDeliveryUnlocked}
                    </AppText>
                  ) : (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <AppText
                        style={{
                          fontFamily: "Inter_500Medium",
                          fontSize: 12,
                          color: colors.primary,
                        }}
                      >
                        {t.cartFreeDeliveryRemainingPrefix}{" "}
                      </AppText>
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
                      <AppText
                        style={{
                          fontFamily: "Inter_500Medium",
                          fontSize: 12,
                          color: colors.primary,
                        }}
                      >
                        {" "}{t.cartFreeDeliveryRemainingSuffix}
                      </AppText>
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
              )}

              {detailed.map(({ product, qty, lineTotal, regularLineTotal }) => (
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
                    <AppText
                      numberOfLines={1}
                      style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.primary }}
                    >
                      {product.name}
                    </AppText>
                    {(product as any).hasInputField && (
                      <View style={{ position: "relative" }}>
                        <TextInput
                          value={items.find((i) => i.productId === product.id)?.customNote ?? ""}
                          onChangeText={(text) => { if (text.length <= 22) setCustomNote(product.id, text); }}
                          placeholder={t.customNotePlaceholder}
                          placeholderTextColor={colors.mutedForeground}
                          maxLength={22}
                          style={{
                            backgroundColor: colors.background,
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: colors.border,
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            paddingEnd: 42,
                            fontFamily: "Inter_400Regular",
                            fontSize: 11,
                            color: colors.primary,
                          }}
                          returnKeyType="done"
                        />
                        <Text style={{ position: "absolute", end: 8, top: "50%", transform: [{ translateY: -6 }], fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>
                          {(items.find((i) => i.productId === product.id)?.customNote ?? "").length}/22
                        </Text>
                      </View>
                    )}
                    {(product as any).hasLetterField && (
                      <TextInput
                        value={items.find((i) => i.productId === product.id)?.customNote ?? ""}
                        onChangeText={(text) => {
                          const v = text.replace(/[^a-zA-Z]/g, "").slice(0, 1).toUpperCase();
                          setCustomNote(product.id, v);
                        }}
                        placeholder={t.letterNotePlaceholder}
                        placeholderTextColor={colors.mutedForeground}
                        maxLength={1}
                        autoCapitalize="characters"
                        style={{
                          backgroundColor: colors.background,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: colors.border,
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          fontFamily: "Inter_400Regular",
                          fontSize: 13,
                          color: colors.primary,
                          textAlign: "center",
                          width: 48,
                          letterSpacing: 2,
                        }}
                        returnKeyType="done"
                      />
                    )}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <AppText style={{ fontFamily: headingFontMedium, fontSize: 15, color: colors.primary }}>
                        {formatPrice(lineTotal)}
                      </AppText>
                      {regularLineTotal !== null && (
                        <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, textDecorationLine: "line-through" }}>
                          {formatPrice(regularLineTotal)}
                        </AppText>
                      )}
                    </View>
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
                      <AppText style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primary, minWidth: 20, textAlign: "center" }}>
                        {qty}
                      </AppText>
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
                  <AppText
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 10,
                      color: colors.mutedForeground,
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                    }}
                  >
                    {t.cartDeliveryWhenLabel}
                  </AppText>
                  <AppText
                    numberOfLines={1}
                    style={{
                      fontFamily: deliveryRowValue ? "Inter_600SemiBold" : "Inter_400Regular",
                      fontSize: 12,
                      color: deliveryRowValue ? colors.primary : colors.mutedForeground,
                    }}
                  >
                    {deliveryRowValue ?? t.cartSelectDateTimePrompt}
                  </AppText>
                </View>
                <Feather name={deliveryRowValue ? "edit-2" : "chevron-right"} size={14} color={colors.mutedForeground} />
              </Pressable>
              {isExpress ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                    {t.expressDelivery}
                  </AppText>
                  <Price
                    value={expressFeeUsd}
                    style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.primary }}
                  />
                </View>
              ) : null}
              <Pressable
                onPress={goToCart}
                style={({ pressed }) => ({
                  backgroundColor: colors.primary,
                  borderRadius: 999,
                  paddingVertical: 16,
                  alignItems: "center",
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <AppText style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff", letterSpacing: 1 }}>
                  {t.cartViewFullCart}
                </AppText>
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
      expressAvailable={expressAvailableForCity}
      expressSurchargeUsd={expressSurchargeForCountry(countryCode)}
    />
    <CheckoutLoginSheet
      visible={loginSheetVisible}
      surface="cart"
      onClose={() => setLoginSheetVisible(false)}
      onAuthSuccess={() => {
        setLoginSheetVisible(false);
        goToCart();
      }}
      onContinueAsGuest={() => {
        setLoginSheetVisible(false);
        goToCart();
      }}
    />
    </>
  );
}
