import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  slotTimeRangeForLabel,
  timeSlotsForCountry,
} from "@workspace/delivery";
import { useDeliveryConfig } from "@/hooks/useDeliveryConfig";
import { trackEvent } from "@/lib/analytics";
import { isDiscountActive } from "@/lib/salePriceHelpers";

type CartItemRowProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product: { id: string; name: string; image: any; hasInputField?: boolean; priceValue: number; discountPriceValue?: number | null; discountPriceAed?: number | null };
  qty: number;
  lineTotal: number;
  customNote?: string;
  setCustomNote: (id: string, note: string) => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  router: ReturnType<typeof import("expo-router").useRouter>;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
};

function CartItemRow({ product, qty, lineTotal, customNote, setCustomNote, colors, router, setQty, remove }: CartItemRowProps) {
  const headingFontMedium = useHeadingFont("500Medium");
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const t = useT();
  const { currencyCode } = useCurrency();
  const onSale = isDiscountActive(currencyCode, product.discountPriceValue, product.discountPriceAed);
  const regularLineTotal = product.priceValue * qty;
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
        <Pressable onPress={() => router.push({ pathname: "/product/[slug]", params: { slug: product.id } })} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <AppText numberOfLines={2} style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.primary }}>
            {product.name}
          </AppText>
        </Pressable>
        {product.hasInputField && (
          <View style={{ position: "relative" }}>
            <TextInput
              value={customNote ?? ""}
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
                paddingVertical: 6,
                paddingEnd: 42,
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                color: colors.primary,
              }}
              returnKeyType="done"
            />
            <Text style={{ position: "absolute", end: 8, top: "50%", transform: [{ translateY: -7 }], fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>
              {(customNote ?? "").length}/22
            </Text>
          </View>
        )}
        {onSale ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Price
              value={lineTotal}
              style={{ fontFamily: headingFontMedium, fontSize: 16, color: "#e11d48" }}
            />
            <Price
              value={regularLineTotal}
              style={{ fontFamily: headingFontMedium, fontSize: 13, color: colors.mutedForeground, textDecorationLine: "line-through" }}
            />
          </View>
        ) : (
          <Price
            value={lineTotal}
            style={{ fontFamily: headingFontMedium, fontSize: 16, color: colors.primary }}
          />
        )}
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

const CART_COUPON_KEY = "@presentail/coupon_v1";

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
  const [stickyBarHeight, setStickyBarHeight] = React.useState(68);
  const { user } = useAuth();
  const [loginSheetVisible, setLoginSheetVisible] = React.useState(false);

  // Promo code — persisted to AsyncStorage so checkout picks it up automatically.
  const [promoOpen, setPromoOpen] = React.useState(false);
  const [promoInput, setPromoInput] = React.useState("");
  const [promoApplied, setPromoApplied] = React.useState(false);

  React.useEffect(() => {
    AsyncStorage.getItem(CART_COUPON_KEY).then((val) => {
      if (val) {
        setPromoInput(val);
        setPromoApplied(true);
        setPromoOpen(true);
      }
    }).catch(() => {});
  }, []);

  const handlePromoApply = React.useCallback(async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    try { await AsyncStorage.setItem(CART_COUPON_KEY, code); } catch { /* best-effort */ }
    setPromoInput(code);
    setPromoApplied(true);
  }, [promoInput]);

  const handlePromoRemove = React.useCallback(async () => {
    try { await AsyncStorage.removeItem(CART_COUPON_KEY); } catch { /* best-effort */ }
    setPromoInput("");
    setPromoApplied(false);
    setPromoOpen(false);
  }, []);
  const [rescheduleVisible, setRescheduleVisible] = React.useState(false);
  const [cardMessageSheetVisible, setCardMessageSheetVisible] = React.useState(false);
  const { items, detailed, total, setQty, remove, setCustomNote, clear, cartMessage, setCartMessage, priceUpdatedProductIds, dismissPriceUpdated } = useCart();
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
    slotTimeRange: slotTimeRangeForLabel(displaySlotLabel, cityTimeSlots),
    days,
    expressLabel: t.expressDelivery,
  });

  const goPickDeliveryTime = React.useCallback(() => {
    setRescheduleVisible(true);
  }, []);

  const handleProceed = React.useCallback(() => {
    trackEvent({ name: "upsell_checkout_proceeded", surface: "upsell_cart" });
    if (!user) {
      setLoginSheetVisible(true);
      return;
    }
    router.push("/checkout");
  }, [user, router]);

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
        <AppText style={{ fontFamily: headingFontMedium, fontSize: 20, color: colors.primary }}>
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
          <AppText style={{ fontFamily: headingFontMedium, fontSize: 22, color: colors.primary, textAlign: "center" }}>
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
              paddingBottom: footerHeight + stickyBarHeight + overlay + 24,
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
                <Feather name="info" size={15} color="#B88A00" style={{ marginTop: 1 }} />
                <AppText style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: "#7A5A00", lineHeight: 18 }}>
                  {t.cartPriceUpdatedBanner}
                </AppText>
                <Pressable onPress={dismissPriceUpdated} hitSlop={10}>
                  <Feather name="x" size={15} color="#B88A00" />
                </Pressable>
              </View>
            )}

            {detailed.map(({ product, qty, lineTotal }) => (
              <CartItemRow
                key={product.id}
                product={product}
                qty={qty}
                lineTotal={lineTotal}
                customNote={items.find((i) => i.productId === product.id)?.customNote}
                setCustomNote={setCustomNote}
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
              bottom: overlay + stickyBarHeight,
              backgroundColor: "#fff",
              borderTopWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 24,
              paddingTop: 16,
              paddingBottom: 16,
              gap: 12,
            }}
          >
            {/* Promo Code Accordion */}
            <Pressable
              onPress={() => setPromoOpen((o) => !o)}
              accessibilityRole="button"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                borderWidth: 1,
                borderColor: promoApplied ? colors.gold : colors.border,
                borderRadius: 12,
                paddingVertical: 11,
                paddingHorizontal: 14,
                backgroundColor: promoApplied ? "rgba(200,160,80,0.06)" : "#fff",
              }}
            >
              <Feather name="tag" size={14} color={promoApplied ? colors.gold : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                {promoApplied ? (
                  <AppText style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.primary }}>
                    {promoInput}
                    <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.gold }}> {t.cartPromoCodeApplied}</AppText>
                  </AppText>
                ) : (
                  <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>
                    {t.cartPromoCode}
                  </AppText>
                )}
              </View>
              <Feather name={promoOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
            </Pressable>

            {promoOpen && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={promoInput}
                  onChangeText={(v) => {
                    setPromoInput(v);
                    if (promoApplied) setPromoApplied(false);
                  }}
                  placeholder={t.cartPromoCodePlaceholder}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="characters"
                  returnKeyType="done"
                  onSubmitEditing={handlePromoApply}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontFamily: "Inter_500Medium",
                    fontSize: 13,
                    color: colors.primary,
                    backgroundColor: "#fff",
                  }}
                />
                {promoApplied ? (
                  <Pressable
                    onPress={handlePromoRemove}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      justifyContent: "center",
                    }}
                  >
                    <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.mutedForeground }}>
                      {t.cartPromoCodeRemove}
                    </AppText>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={handlePromoApply}
                    disabled={!promoInput.trim()}
                    style={({ pressed }) => ({
                      backgroundColor: colors.primary,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      justifyContent: "center",
                      opacity: !promoInput.trim() ? 0.4 : pressed ? 0.85 : 1,
                    })}
                  >
                    <AppText style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" }}>
                      {t.cartPromoCodeApply}
                    </AppText>
                  </Pressable>
                )}
              </View>
            )}

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
              <Feather name={deliveryRowValue ? "edit-2" : "chevron-right"} size={14} color={colors.mutedForeground} />
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
              <AppText style={{ fontFamily: headingFontMedium, color: colors.primary, fontSize: 18 }}>
                {t.cartTotal}
              </AppText>
              <Price
                value={grandTotalUsd}
                style={{ fontFamily: headingFontMedium, color: colors.primary, fontSize: 22 }}
              />
            </View>
          </View>

          {/* Sticky proceed-to-checkout pill bar */}
          <View
            onLayout={(e) => setStickyBarHeight(e.nativeEvent.layout.height)}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: overlay,
              backgroundColor: "#fff",
              paddingHorizontal: 20,
              paddingTop: 10,
              paddingBottom: Math.max(overlay - insets.bottom, 10),
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: -2 },
              elevation: 6,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
            }}
          >
            <Pressable
              onPress={handleProceed}
              accessibilityRole="button"
              accessibilityLabel={t.cartProceed}
              style={({ pressed }) => ({
                backgroundColor: colors.primary,
                borderRadius: 999,
                paddingVertical: 15,
                paddingHorizontal: 22,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                opacity: pressed ? 0.9 : 1,
                shadowColor: colors.primary,
                shadowOpacity: 0.18,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 4,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="lock" size={14} color="#fff" />
                <AppText style={{ fontFamily: "Inter_600SemiBold", color: "#fff", letterSpacing: 1.5, textTransform: "uppercase", fontSize: 12 }}>
                  {t.cartProceed}
                </AppText>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Price
                  value={grandTotalUsd}
                  style={{ fontFamily: headingFontMedium, color: "#fff", fontSize: 15 }}
                />
                <Feather name="chevron-right" size={16} color="#fff" />
              </View>
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

