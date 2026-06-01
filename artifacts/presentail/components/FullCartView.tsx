import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CartCardMessageSheet } from "@/components/CartCardMessageSheet";
import { CartUpsells } from "@/components/CartUpsells";
import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";
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
  timeSlotsForCountry,
} from "@workspace/delivery";
import { useDeliveryConfig } from "@/hooks/useDeliveryConfig";
import { trackEvent } from "@/lib/analytics";

type CartItemRowProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product: { id: string; name: string; image: any };
  qty: number;
  lineTotal: number;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  router: ReturnType<typeof import("expo-router").useRouter>;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
};

function CartItemRow({ product, qty, lineTotal, colors, router, setQty, remove }: CartItemRowProps) {
  const headingFontMedium = useHeadingFont("500Medium");
  const [imageLoaded, setImageLoaded] = React.useState(false);
  return (
    <View
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
        <View style={{ width: 84, height: 84, borderRadius: 12, overflow: "hidden", backgroundColor: colors.imagePlaceholder }}>
          {!imageLoaded && <ShimmerPlaceholder />}
          <Image
            source={product.image}
            style={{ width: 84, height: 84, borderRadius: 12 }}
            contentFit="cover"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(true)}
          />
        </View>
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText numberOfLines={2} style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.primary }}>
          {product.name}
        </AppText>
        <Price
          value={lineTotal}
          style={{ fontFamily: headingFontMedium, fontSize: 16, color: colors.primary }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
          <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 999 }}>
            <Pressable onPress={() => setQty(product.id, qty - 1)} style={cartItemStyles.qtyBtn}>
              <Feather name="minus" size={12} color={colors.primary} />
            </Pressable>
            <AppText style={{ fontFamily: "Inter_600SemiBold", color: colors.primary, paddingHorizontal: 12, fontSize: 12 }}>
              {qty}
            </AppText>
            <Pressable onPress={() => setQty(product.id, qty + 1)} style={cartItemStyles.qtyBtn}>
              <Feather name="plus" size={12} color={colors.primary} />
            </Pressable>
          </View>
          <Pressable onPress={() => remove(product.id)} hitSlop={8}>
            <Feather name="trash-2" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const cartItemStyles = StyleSheet.create({
  qtyBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
});

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
  const headingFontMedium = useHeadingFont("500Medium");
  // Funnel entry: shoppers landing on the cart tab/screen. Counted once
  // per mount so navigating away and returning correctly registers a
  // fresh cart_viewed.
  React.useEffect(() => {
    trackEvent({ name: "cart_viewed", surface: "cart-screen" });
  }, []);
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
  const [rescheduleVisible, setRescheduleVisible] = React.useState(false);
  const [cardMessageSheetVisible, setCardMessageSheetVisible] = React.useState(false);
  const { detailed, total, setQty, remove, clear, cartMessage, setCartMessage } = useCart();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const { currencyCode, convert } = useCurrency();
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
    days,
    expressLabel: t.expressDelivery,
  });

  const goPickDeliveryTime = React.useCallback(() => {
    setRescheduleVisible(true);
  }, []);

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
        <Text style={{ fontFamily: headingFontMedium, fontSize: 20, color: colors.primary }}>
          {t.cartTitle}
        </AppText>
        <Pressable
          onPress={() => {
            Alert.alert(
              t.cartClearConfirmTitle,
              t.cartClearConfirmMessage,
              [
                { text: t.cartClearConfirmCancel, style: "cancel" },
                { text: t.cartClearConfirmAction, style: "destructive", onPress: clear },
              ]
            );
          }}
          hitSlop={10}
        >
          <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground }}>
            {t.cartClear}
          </AppText>
        </Pressable>
      </View>

      {detailed.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 36, gap: 14 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 999,
              backgroundColor: colors.background,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="shopping-bag" size={28} color={colors.primary} />
          </View>
          <Text style={{ fontFamily: headingFontMedium, fontSize: 22, color: colors.primary, textAlign: "center" }}>
            {t.cartEmpty}
          </AppText>
          <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
            {t.cartEmptyDesc}
          </AppText>
          <Pressable
            onPress={() => router.replace("/(tabs)/catalog")}
            style={{ marginTop: 8, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 999, backgroundColor: colors.primary }}
          >
            <AppText style={{ fontFamily: "Inter_600SemiBold", color: "#fff", letterSpacing: 1, textTransform: "uppercase", fontSize: 12, textAlign: "center" }}>
              {t.cartBrowseBoutique}
            </AppText>
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

            {detailed.map(({ product, qty, lineTotal }) => (
              <CartItemRow
                key={product.id}
                product={product}
                qty={qty}
                lineTotal={lineTotal}
                colors={colors}
                router={router}
                setQty={setQty}
                remove={remove}
              />
            ))}

            {/* Gift Card & Message row */}
            <View style={{ marginTop: 10 }}>
              <Pressable
                onPress={() => setCardMessageSheetVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t.cartGiftCardLabel}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  backgroundColor: colors.background,
                  borderRadius: 14,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderWidth: cartMessage ? 0 : 1,
                  borderStyle: "dashed",
                  borderColor: colors.border,
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
                  <Feather name="mail" size={14} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 11,
                      color: colors.mutedForeground,
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                    }}
                  >
                    {t.cartGiftCardLabel}
                  </AppText>
                  <AppText
                    numberOfLines={1}
                    style={{
                      fontFamily: cartMessage ? "Inter_600SemiBold" : "Inter_400Regular",
                      fontSize: 13,
                      color: cartMessage ? colors.primary : colors.mutedForeground,
                    }}
                  >
                    {cartMessage
                      ? [cartMessage.to && `${t.toLabel}: ${cartMessage.to}`, cartMessage.from && `${t.fromLabel}: ${cartMessage.from}`]
                          .filter(Boolean)
                          .join(" · ") || cartMessage.body.slice(0, 40)
                      : t.cartGiftCardPrompt}
                  </AppText>
                </View>
                {cartMessage ? (
                  <Pressable
                    onPress={() => setCartMessage(null)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t.cartRemoveMessage}
                  >
                    <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                  </Pressable>
                ) : (
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                )}
              </Pressable>
            </View>

            <View style={{ marginTop: 6 }}>
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
                <AppText
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 11,
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
                    fontSize: 13,
                    color: deliveryRowValue ? colors.primary : colors.mutedForeground,
                  }}
                >
                  {deliveryRowValue ?? t.cartSelectDateTimePrompt}
                </AppText>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <AppText style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
                {t.subtotal}
              </AppText>
              <Price
                value={total}
                style={{ fontFamily: "Inter_500Medium", color: colors.primary, fontSize: 13 }}
              />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <AppText style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
                {t.cartDelivery}
              </AppText>
              <AppText style={{ fontFamily: "Inter_500Medium", color: colors.gold, fontSize: 13 }}>
                {t.cartFree}
              </AppText>
            </View>
            {isExpress ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <AppText style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
                  {t.expressDelivery}
                </AppText>
                <Price
                  value={expressFeeUsd}
                  style={{ fontFamily: "Inter_500Medium", color: colors.primary, fontSize: 13 }}
                />
              </View>
            ) : null}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: headingFontMedium, color: colors.primary, fontSize: 18 }}>
                {t.cartTotal}
              </AppText>
              <Price
                value={grandTotalUsd}
                style={{ fontFamily: headingFontMedium, color: colors.primary, fontSize: 22 }}
              />
            </View>
            <Pressable
              onPress={() => {
                trackEvent({ name: "upsell_checkout_proceeded", surface: "upsell_cart" });
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
              <AppText style={{ fontFamily: "Inter_600SemiBold", color: "#fff", letterSpacing: 1.5, textTransform: "uppercase", fontSize: 12, textAlign: "center" }}>
                {t.cartProceed}
              </AppText>
            </Pressable>
          </View>
        </>
      )}
    </View>
    <CartCardMessageSheet
      visible={cardMessageSheetVisible}
      onClose={() => setCardMessageSheetVisible(false)}
      initial={cartMessage}
      onSave={setCartMessage}
    />
    <RescheduleDeliverySheet
      visible={rescheduleVisible}
      onClose={() => setRescheduleVisible(false)}
      initialMode={deliverySelection.mode}
      expressAvailable={expressAvailableForCity}
      expressSurchargeUsd={expressSurchargeUsd}
    />
    <CheckoutLoginSheet
      visible={loginSheetVisible}
      surface="cart"
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

