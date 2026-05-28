import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AmexBadge, ApplePayBadge, GooglePayBadge, MastercardBadge, PayPalBadge, VisaBadge, WhishBadge } from "@/components/PaymentBadges";
import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";
import { Price } from "@/components/Price";
import { RescheduleDeliverySheet } from "@/components/RescheduleDeliverySheet";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useWooProducts } from "@/contexts/WooProductsContext";
import { getCategory } from "@/data/catalog";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";
import {
  getCountryHour,
  isExpressDeliveryAvailable,
  timeSlotsForCountry,
} from "@workspace/delivery";
import { calcRewardPoints } from "@workspace/display-currency";
import { useNow } from "@/lib/useNow";

const { width: SCREEN_W } = Dimensions.get("window");

// Public web storefront origin used to build shareable product links.
// Share URLs always point to the production web storefront so iOS/Android
// can resolve OG tags (product name, logo) for the share sheet preview.
// EXPO_PUBLIC_DOMAIN is the API server domain — do NOT use it here.
// presentail.com does not yet have locale-prefixed routes; new.presentail.com
// is the deployed Replit storefront that serves them correctly.
const WEB_BASE_URL = "https://new.presentail.com";

type ImageSource = number | { uri: string };

/**
 * Normalises the product image into a value `<Image>` can safely consume.
 * `Product.image` is loosely typed (`any`) because it may be either an
 * `Asset`-style require number or a remote `{ uri }` object. A stale cart
 * row, deleted WC media, or an empty-string uri can otherwise reach the
 * native image loader and synchronously throw on iOS, hard-closing the
 * app before any error boundary can catch it.
 */
function toSafeImageSource(source: unknown): ImageSource | null {
  if (typeof source === "number") return source;
  if (
    source !== null &&
    typeof source === "object" &&
    "uri" in source &&
    typeof (source as { uri: unknown }).uri === "string" &&
    (source as { uri: string }).uri.length > 0
  ) {
    return { uri: (source as { uri: string }).uri };
  }
  return null;
}

function ProductDetail() {
  // `useLocalSearchParams` can return a string, an array of strings, or
  // undefined depending on how the route was reached (deep links and
  // some navigations can pass arrays). Coerce defensively so downstream
  // `find(p => p.id === String(slug))` doesn't compare against
  // "foo,bar" or undefined and synchronously throw on TestFlight.
  const rawParams = useLocalSearchParams<{ slug: string | string[] }>();
  const slug = Array.isArray(rawParams.slug)
    ? rawParams.slug[0] ?? ""
    : rawParams.slug ?? "";
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { add } = useCart();
  const t = useT();
  const { user } = useAuth();
  const { isFavorited, toggleFavorite } = useFavorites();
  const [copiedVisible, setCopiedVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState(t.shareLinkCopied);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const copiedOpacity = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const showToast = (message: string) => {
    if (Platform.OS === "android") {
      try {
        ToastAndroid.show(message, ToastAndroid.SHORT);
      } catch {
        // ToastAndroid is part of react-native core; this is just defensive.
      }
      return;
    }
    try {
      setToastMessage(message);
      setCopiedVisible(true);
      Animated.timing(copiedOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        Animated.timing(copiedOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => setCopiedVisible(false));
      }, 1600);
    } catch {
      // Animated/setState path is best-effort; never crash the screen.
    }
  };

  // Read delivery location so we can build a locale-prefixed share URL.
  // `selectedCountry.code` is e.g. "LB"; `selectedCity.id` is e.g. "lb-beirut".
  // Both are used only inside handleShareProduct (not during render) so there
  // is no risk of a synchronous throw on the critical product-detail path.
  const { selectedCountry, selectedCity } = useDeliveryLocation();

  const handleShareProduct = async (productSlug: string, productName: string) => {
    // Use React Native's built-in Share API (native iOS/Android share sheet).
    // It is part of react-native core, so no extra native module is required —
    // this works on every shipped binary, unlike expo-clipboard which was
    // added after TestFlight build 13 was compiled and previously crashed
    // the app at the native layer when invoked.
    try {
      // Build a locale-prefixed URL so the web server's injectSeoTagsAsync
      // fires the per-product OG tag injection and iMessage / WhatsApp / iOS
      // share sheet shows the product name instead of the bare domain.
      // countryCode "LB" → country slug "lb"; city id "lb-beirut" → "beirut".
      const countrySlug = selectedCountry?.code?.toLowerCase() ?? "lb";
      const citySlug =
        selectedCity?.id?.replace(/^[a-z]{2}-/, "") ?? "beirut";
      const encodedSlug = encodeURIComponent(String(productSlug ?? ""));
      const url = `${WEB_BASE_URL}/en-${countrySlug}/${citySlug}/product/${encodedSlug}`;
      // On iOS: pass `message` (product name only, no URL) and `url` as
      // separate fields. iOS renders them as two distinct items — the name
      // appears as visible text above the link card. Putting the URL inside
      // `message` causes iOS to extract it and show only the domain card,
      // hiding the product name entirely.
      // On Android: `url` is not supported by Share.share, so combine name
      // and URL into a single message string (Android shows it as plain text).
      const sharePayload =
        Platform.OS === "ios"
          ? { message: productName, url }
          : { message: `${productName}\n${url}` };
      await Share.share(sharePayload);
    } catch {
      showToast(t.shareUnavailable);
    }
  };

  const { products: allProducts } = useWooProducts();
  const found = allProducts.find((p) => p.id === slug) ?? null;
  // Hide products that the live WC payload reports as out-of-stock so the
  // direct product URL behaves the same as the listings (which already
  // filter OOS items out server-side). `inStock` is propagated from the
  // WC payload by `WooProductsContext.mergeProducts`; a missing value
  // means we have only the static seed for this product and we keep the
  // existing fallback behaviour.
  const product = found && found.inStock === false ? null : found;
  if (!product) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <Text style={{ fontFamily: "PlayfairDisplay_400Regular", color: colors.primary, fontSize: 18 }}>
          {t.productNotFound}
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.gold, fontFamily: "Inter_500Medium" }}>{t.goBack}</Text>
        </Pressable>
      </View>
    );
  }

  const cat = getCategory(product.category);
  const safeImageSource = toSafeImageSource(product.image);
  // Guard the price against NaN / non-finite values so anything we feed to
  // `Math.round` / `formatNative` / `<Price>` is always a real number.
  const safePriceValue = Number.isFinite(Number(product.priceValue))
    ? Number(product.priceValue)
    : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: SCREEN_W, backgroundColor: colors.imagePlaceholder }}>
          {!heroLoaded && <ShimmerPlaceholder />}
          {safeImageSource ? (
            <Image
              source={safeImageSource}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              onLoad={() => setHeroLoaded(true)}
            />
          ) : null}
          <LinearGradient
            colors={["rgba(0,0,0,0.25)", "transparent", "rgba(0,0,0,0.05)"]}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={{
              position: "absolute",
              top: insets.top + 12,
              left: 18,
              right: 18,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Pressable
              onPress={() => router.back()}
              style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}
            >
              <Feather name="arrow-left" size={20} color={colors.primary} />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {user && (
                <Pressable
                  onPress={() => void toggleFavorite(product.id)}
                  accessibilityRole="button"
                  accessibilityLabel={isFavorited(product.id) ? "Remove from favorites" : "Add to favorites"}
                  style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}
                >
                  <Ionicons
                    name={isFavorited(product.id) ? "heart" : "heart-outline"}
                    size={20}
                    color={isFavorited(product.id) ? "#e11d48" : colors.primary}
                  />
                </Pressable>
              )}
              <Pressable
                onPress={() => handleShareProduct(String(slug || product.id), product.name)}
                accessibilityRole="button"
                accessibilityLabel={t.shareProductAria}
                style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}
              >
                <Feather name="share-2" size={18} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        </View>

        <ProductBody
          product={product}
          safePriceValue={safePriceValue}
          cat={cat}
          colors={colors}
          router={router}
        />
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 24,
          paddingTop: 14,
          paddingBottom: insets.bottom + 14,
          backgroundColor: "#fff",
          borderTopWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
        }}
      >
        <Pressable
          onPress={() => add(product.id, 1)}
          style={({ pressed }) => [
            {
              alignSelf: "stretch",
              backgroundColor: colors.primary,
              paddingVertical: 16,
              borderRadius: 999,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Feather name="shopping-bag" size={16} color="#fff" />
          <Text
            style={{
              fontFamily: "Inter_600SemiBold",
              color: "#fff",
              fontSize: 13,
              letterSpacing: 1.4,
              textTransform: "uppercase",
            }}
          >
            {t.addLabel}
          </Text>
        </Pressable>
      </View>

      {Platform.OS !== "android" && copiedVisible ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: insets.top + 64,
            left: 0,
            right: 0,
            alignItems: "center",
            opacity: copiedOpacity,
          }}
        >
          <View
            style={{
              backgroundColor: "rgba(20,20,20,0.92)",
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 999,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontFamily: "Inter_500Medium",
                fontSize: 13,
              }}
            >
              {toastMessage}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function ProductBody({ product, safePriceValue, cat, colors, router }: any) {
  const deliverySelection = useDeliverySelection();
  const { formatNative, currencyCode } = useCurrency();
  const { selectedCountry } = useDeliveryLocation();
  // Coerce to a string before `.toUpperCase()` / fallback comparisons so
  // a malformed delivery payload (e.g. `code: null`) can't synchronously
  // throw during render on the product detail screen.
  const rawCc = selectedCountry?.code;
  // Derive the active store country from the explicit delivery selection
  // first; only fall back to a *non-LB* currency-based hint so a USD shopper
  // outside our delivery zone (e.g. CA, GB) does NOT incorrectly default to
  // Lebanon and see the Lebanon-only Whish badge / Beirut delivery slots.
  // When nothing is known, default to "" (treated as non-LB everywhere
  // below) so the safer PayPal badge is shown.
  const cc = (typeof rawCc === "string" && rawCc.length > 0
    ? rawCc
    : currencyCode === "AED" ? "AE" : currencyCode === "EUR" ? "CY" : "").toUpperCase();
  const now = useNow();
  const expressAvailable = isExpressDeliveryAvailable(cc, now);
  const initialDelivery: "express" | "scheduled" =
    deliverySelection.mode === "schedule" || deliverySelection.mode === "today_slot"
      ? "scheduled"
      : expressAvailable
        ? "express"
        : "scheduled";
  const [delivery, setDeliveryLocal] = useState<"express" | "scheduled">(initialDelivery);
  // Persist the implicit default ("express") into the shared delivery
  // selection on first visit, so adding to cart without ever toggling
  // the option still results in the cart correctly showing
  // "Express Delivery" + applying the surcharge. Only fires when no
  // selection has been made yet — never overwrites a real choice.
  useEffect(() => {
    if (
      deliverySelection.mode == null &&
      initialDelivery === "express" &&
      expressAvailable
    ) {
      deliverySelection.setMode("express");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Auto-fall back to scheduled if Express is currently selected but
  // unavailable for the recipient country (e.g. shopper sat across the
  // 10 PM cutoff). Mirrors the web checkout behaviour and keeps the
  // shared `isExpressDeliveryAvailable` rule the single source of truth.
  useEffect(() => {
    if (delivery === "express" && !expressAvailable) {
      setDeliveryLocal("scheduled");
      deliverySelection.setSelection({
        mode: "schedule",
        date: defaultDate,
        slotLabel: defaultSlot,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery, expressAvailable]);
  // Keep the local delivery toggle in sync with the shared selection so
  // that confirming the reschedule sheet (which writes
  // `today_slot` / `schedule`) flips the PDP into the scheduled state,
  // and an external switch back to express (e.g. from the cart) flips
  // it back here too.
  useEffect(() => {
    if (deliverySelection.mode === "schedule" || deliverySelection.mode === "today_slot") {
      if (delivery !== "scheduled") setDeliveryLocal("scheduled");
    } else if (deliverySelection.mode === "express" && expressAvailable) {
      if (delivery !== "express") setDeliveryLocal("express");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliverySelection.mode]);
  const setDelivery = (next: "express" | "scheduled") => {
    if (next === "express" && !expressAvailable) return;
    setDeliveryLocal(next);
    if (next === "express") {
      deliverySelection.setMode("express");
    } else {
      // Seed a sensible default so adding to cart without opening the
      // reschedule sheet still produces a valid schedule selection. The
      // sheet overrides this with the shopper's pick on Confirm.
      const hasExisting =
        (deliverySelection.mode === "schedule" || deliverySelection.mode === "today_slot") &&
        deliverySelection.date &&
        deliverySelection.slotLabel;
      if (!hasExisting) {
        deliverySelection.setSelection({
          mode: "schedule",
          date: defaultDate,
          slotLabel: defaultSlot,
        });
      }
    }
  };
  const [tab, setTab] = useState<"description" | "care">("description");
  const t = useT();
  const priceValue = Number.isFinite(safePriceValue) ? safePriceValue : 0;
  const points = calcRewardPoints(priceValue);

  // Seed defaults used when the shopper switches to scheduled delivery
  // without opening the reschedule sheet (e.g. the express-unavailable
  // auto-fallback). The sheet overwrites these on Confirm.
  const PROD_SLOTS = timeSlotsForCountry(cc);
  const localH = getCountryHour(cc);
  const nextSlot = PROD_SLOTS.find((s) => s.cutoffHour > localH);
  const todayIso = new Date().toISOString().slice(0, 10);
  const tomorrowIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const defaultDate = nextSlot ? todayIso : tomorrowIso;
  const defaultSlot = (nextSlot ?? PROD_SLOTS[0]).label;
  const [rescheduleVisible, setRescheduleVisible] = useState(false);

  const careTips: string[] = [
    "Trim 2cm off stems at a 45° angle every 2–3 days.",
    "Refresh the water daily; keep away from direct sunlight.",
    "Remove any leaves below the waterline to prevent bacteria.",
    "Display in a cool spot, away from fruit bowls and AC vents.",
  ];

  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 22, gap: 14 }}>
      <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 28, color: colors.primary, lineHeight: 34 }}>
        {product.name}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
          <Price
            value={priceValue}
            native
            style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 24, color: colors.primary }}
          />
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 }}>
            {t.taxInclusive}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <MaterialCommunityIcons name="star-four-points" size={14} color={colors.gold} />
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.gold }}>
            {t.earnPointsPrefix} {points} {t.earnPointsSuffix}
          </Text>
        </View>
      </View>

      {/* Delivery options */}
      <View style={{ marginTop: 8, gap: 10 }}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground, letterSpacing: 1.6, textTransform: "uppercase" }}>
          {t.deliveryOptionsLabel}
        </Text>

        <DeliveryOption
          colors={colors}
          active={delivery === "express"}
          onPress={() => setDelivery("express")}
          icon="flash-outline"
          title={t.expressDelivery}
          subtitle={expressAvailable ? t.arrivesIn90 : t.opensAt8AM}
          badge={expressAvailable ? t.fastest : undefined}
          disabled={!expressAvailable}
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ height: 1, backgroundColor: colors.border, flex: 1 }} />
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: colors.mutedForeground, letterSpacing: 1.5 }}>
            OR
          </Text>
          <View style={{ height: 1, backgroundColor: colors.border, flex: 1 }} />
        </View>

        <DeliveryOption
          colors={colors}
          active={delivery === "scheduled"}
          onPress={() => {
            // Open the sheet first; only flip to scheduled on Confirm.
            // Dismissing the sheet leaves the current mode unchanged so
            // "Keep Express" really does keep express on the PDP.
            setRescheduleVisible(true);
          }}
          icon="calendar-clock"
          title={t.selectDateAndTime}
          subtitle={
            delivery === "scheduled" && deliverySelection.date && deliverySelection.slotLabel
              ? `${deliverySelection.date} · ${deliverySelection.slotLabel}`
              : t.pickAWindow
          }
        />
      </View>
      <RescheduleDeliverySheet
        visible={rescheduleVisible}
        onClose={() => setRescheduleVisible(false)}
      />

      {/* Trust badges — informational, intentionally non-button */}
      <View
        style={{
          marginTop: 14,
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 16,
          paddingHorizontal: 14,
        }}
      >
        {[
          { icon: "truck-fast", title: t.freeStandardDelivery, sub: `${t.onOrdersAbove} ${formatNative(cc === "AE" ? 330 : cc === "CY" ? 120 : 130)}.` },
          { icon: "map-marker-question", title: t.noAddressHassle, sub: t.collectAddressForYou },
          { icon: "map-marker-path", title: t.liveOrderTracking, sub: t.realTimeUpdates },
        ].map((b, i, arr) => (
          <View
            key={b.title}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              paddingVertical: 14,
              borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
            }}
          >
            <MaterialCommunityIcons name={b.icon as any} size={20} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}>{b.title}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>{b.sub}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Payment methods */}
      <View style={{ marginTop: 6, gap: 8 }}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground, letterSpacing: 1.6, textTransform: "uppercase" }}>
          {t.waysToPayLabel}
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            rowGap: 8,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <ApplePayBadge />
          <GooglePayBadge />
          <VisaBadge />
          <MastercardBadge />
          <AmexBadge />
          {cc.toUpperCase() === "LB" ? <WhishBadge /> : <PayPalBadge />}
        </View>
      </View>

      {/* Tabs */}
      <View style={{ marginTop: 18 }}>
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: colors.border }}>
          {[
            { id: "description", label: t.descriptionTab },
            { id: "care", label: t.careTipsTab },
          ].map((tabItem) => {
            const a = tab === tabItem.id;
            return (
              <Pressable key={tabItem.id} onPress={() => setTab(tabItem.id as any)} style={{ paddingVertical: 12, marginRight: 24, borderBottomWidth: 2, borderColor: a ? colors.gold : "transparent" }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: a ? colors.primary : colors.mutedForeground, letterSpacing: 1, textTransform: "uppercase" }}>
                  {tabItem.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "description" ? (
          <View style={{ paddingTop: 16, gap: 10 }}>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 22, color: colors.mutedForeground }}>
              {product.description ??
                `The "${product.name}" is a captivating Presentail piece — hand-arranged in our Beirut atelier with the freshest seasonal blooms, finished with our boutique wrapping and a personal note card.`}
            </Text>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: colors.primary, marginTop: 4 }}>
              {t.thisArrangementIncludes}
            </Text>
            {[t.includedStem, t.includedWrap, t.includedCard, t.includedDelivery].map((b) => (
              <View key={b} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <Text style={{ color: colors.gold, fontSize: 14, lineHeight: 20 }}>•</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.primary, flex: 1, lineHeight: 20 }}>
                  {b}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ paddingTop: 16, gap: 10 }}>
            {careTips.map((c) => (
              <View key={c} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <MaterialCommunityIcons name="flower-tulip" size={14} color={colors.gold} style={{ marginTop: 3 }} />
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.primary, flex: 1, lineHeight: 20 }}>
                  {c}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function DeliveryOption({ colors, active, onPress, icon, title, subtitle, badge, disabled }: any) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={!!disabled}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: "#fff",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? colors.primary : colors.background,
        }}
      >
        <MaterialCommunityIcons name={icon} size={18} color={active ? colors.goldSoft : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primary }}>{title}</Text>
          {badge ? (
            <View style={{ backgroundColor: colors.gold, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: "#fff", letterSpacing: 1 }}>
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
      <Feather name={active ? "check-circle" : "circle"} size={20} color={active ? colors.gold : colors.border} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default withRouteErrorBoundary(ProductDetail, "product/[slug]");
