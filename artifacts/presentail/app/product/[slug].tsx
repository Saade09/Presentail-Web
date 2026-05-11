import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { Price } from "@/components/Price";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useWooProducts } from "@/contexts/WooProductsContext";
import { getCategory } from "@/data/catalog";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

const { width: SCREEN_W } = Dimensions.get("window");

// Public web storefront origin used to build shareable product links.
// Mirrors the source used elsewhere for customer-facing links (see
// `brandShareMessage` in lib/translations.ts and the EXPO_PUBLIC_DOMAIN
// gotcha in replit.md). Falls back to the production marketing domain
// so OTA bundles without env vars still produce a valid public URL.
const WEB_BASE_URL = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "https://presentail.com";
})();

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
  const { formatNative } = useCurrency();
  const t = useT();
  const [copiedVisible, setCopiedVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState(t.shareLinkCopied);
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

  const handleShareProduct = async (productSlug: string) => {
    // Use React Native's built-in Share API (native iOS/Android share sheet).
    // It is part of react-native core, so no extra native module is required —
    // this works on every shipped binary, unlike expo-clipboard which was
    // added after TestFlight build 13 was compiled and previously crashed
    // the app at the native layer when invoked.
    try {
      const url = `${WEB_BASE_URL}/product/${encodeURIComponent(String(productSlug ?? ""))}`;
      // iOS treats `message` and `url` as two separate shareable items, which
      // makes the share sheet preview "2 Links" and pastes the URL twice.
      // Pass only the field each platform actually uses: `url` on iOS,
      // `message` on Android (Android's Share API ignores `url`).
      await Share.share(Platform.OS === "ios" ? { url } : { message: url });
    } catch {
      showToast(t.shareUnavailable);
    }
  };

  const { products: allProducts } = useWooProducts();
  const product = allProducts.find((p) => p.id === slug) ?? null;
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
        <View style={{ height: SCREEN_W, backgroundColor: colors.muted }}>
          {safeImageSource ? (
            <Image source={safeImageSource} style={StyleSheet.absoluteFill} contentFit="cover" />
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
            <Pressable
              onPress={() => handleShareProduct(String(slug || product.id))}
              accessibilityRole="button"
              accessibilityLabel={t.shareProductAria}
              style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}
            >
              <Feather name="share-2" size={18} color={colors.primary} />
            </Pressable>
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
            {t.addLabel} — {formatNative(safePriceValue)}
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
  const [delivery, setDelivery] = useState<"express" | "scheduled">("express");
  const [tab, setTab] = useState<"description" | "care">("description");
  const { formatNative, currencyCode } = useCurrency();
  const { selectedCountry } = useDeliveryLocation();
  // Coerce to a string before `.toUpperCase()` / fallback comparisons so
  // a malformed delivery payload (e.g. `code: null`) can't synchronously
  // throw during render on the product detail screen.
  const rawCc = selectedCountry?.code;
  const cc = (typeof rawCc === "string" && rawCc.length > 0
    ? rawCc
    : currencyCode === "AED" ? "AE" : currencyCode === "EUR" ? "CY" : "LB").toUpperCase();
  const t = useT();
  const priceValue = Number.isFinite(safePriceValue) ? safePriceValue : 0;
  const points = Math.max(1, Math.round(priceValue * 0.4));

  const days = useMemo(() => {
    const out: { iso: string; label: string; date: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      out.push({
        iso: d.toISOString().slice(0, 10),
        label: i === 0 ? "Today" : i === 1 ? "Tom" : d.toLocaleDateString(undefined, { weekday: "short" }),
        date: String(d.getDate()),
      });
    }
    return out;
  }, []);
  const LB_SLOTS = [
    { label: "9:00 AM – 2:00 PM", cutoffHour: 9 },
    { label: "2:00 PM – 6:00 PM", cutoffHour: 14 },
    { label: "6:00 PM – 9:00 PM", cutoffHour: 18 },
    { label: "9:00 PM – 11:00 PM", cutoffHour: 21 },
  ];
  const AE_SLOTS = [
    { label: "7:00 AM – 1:00 PM", cutoffHour: 7 },
    { label: "1:00 PM – 4:00 PM", cutoffHour: 13 },
    { label: "4:00 PM – 8:00 PM", cutoffHour: 16 },
    { label: "8:00 PM – 11:00 PM", cutoffHour: 20 },
  ];
  const PROD_SLOTS = cc === "AE" ? AE_SLOTS : LB_SLOTS;
  function getCountryHourLocal() {
    const tz = cc === "AE" ? "Asia/Dubai" : "Asia/Beirut";
    try {
      const h = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date());
      return parseInt(h, 10);
    } catch {
      const offset = cc === "AE" ? 4 : 2;
      return (new Date().getUTCHours() + offset) % 24;
    }
  }
  const localH = getCountryHourLocal();
  const nextSlot = PROD_SLOTS.find((s) => s.cutoffHour > localH);
  // `days` is the source of truth for date chips; fall back to today's ISO
  // so accessing `days[0]`/`days[1]` cannot throw on first render.
  const todayIso = days[0]?.iso ?? new Date().toISOString().slice(0, 10);
  const tomorrowIso = days[1]?.iso ?? todayIso;
  const [date, setDate] = useState(nextSlot ? todayIso : tomorrowIso);
  const [slot, setSlot] = useState(() => (nextSlot ?? PROD_SLOTS[0]).label);

  const careTips: string[] = [
    "Trim 2cm off stems at a 45° angle every 2–3 days.",
    "Refresh the water daily; keep away from direct sunlight.",
    "Remove any leaves below the waterline to prevent bacteria.",
    "Display in a cool spot, away from fruit bowls and AC vents.",
  ];

  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 22, gap: 14 }}>
      {/* Breadcrumb */}
      {cat ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Pressable onPress={() => router.push({ pathname: "/category/[slug]", params: { slug: cat.id } })}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.gold, letterSpacing: 2.2, textTransform: "uppercase" }}>
              {cat.name}
            </Text>
          </Pressable>
          <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
          <Text numberOfLines={1} style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, letterSpacing: 1.2, textTransform: "uppercase", flex: 1 }}>
            {product.name}
          </Text>
        </View>
      ) : null}

      <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 28, color: colors.primary, lineHeight: 34 }}>
        {product.name}
      </Text>

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

      {/* Loyalty */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: colors.secondary,
          padding: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" }}>
          <MaterialCommunityIcons name="star-four-points" size={16} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.primary }}>
            {t.earnPointsPrefix} {points} {t.earnPointsSuffix}
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>
            {t.presentailPointsDesc}
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
          subtitle={t.arrivesIn90}
          badge={t.fastest}
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
          onPress={() => setDelivery("scheduled")}
          icon="calendar-clock"
          title={t.selectDateAndTime}
          subtitle={delivery === "scheduled" ? `${date} · ${slot}` : t.pickAWindow}
        />

        {delivery === "scheduled" ? (
          <View style={{ gap: 12, marginTop: 4, padding: 14, borderRadius: 14, backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {days.map((d) => {
                const a = d.iso === date;
                return (
                  <Pressable key={d.iso} onPress={() => setDate(d.iso)} style={{ width: 56, paddingVertical: 8, borderRadius: 12, alignItems: "center", backgroundColor: a ? colors.primary : "#fff", borderWidth: 1, borderColor: a ? colors.primary : colors.border }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: a ? colors.goldSoft : colors.mutedForeground, letterSpacing: 1, textTransform: "uppercase" }}>
                      {d.label}
                    </Text>
                    <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 16, color: a ? "#fff" : colors.primary }}>
                      {d.date}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {PROD_SLOTS.map((s) => {
                const isToday = date === todayIso;
                const past = isToday && localH >= s.cutoffHour;
                const a = s.label === slot;
                return (
                  <Pressable
                    key={s.label}
                    onPress={() => { if (!past) setSlot(s.label); }}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: a ? colors.primary : colors.border, backgroundColor: a ? colors.primary : past ? "#f5f5f5" : "#fff", opacity: past ? 0.5 : 1 }}
                  >
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: a ? "#fff" : past ? colors.mutedForeground : colors.primary, textDecorationLine: past ? "line-through" : "none" }}>
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>

      {/* Trust badges — informational, intentionally non-button */}
      <View style={{ marginTop: 14 }}>
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

function DeliveryOption({ colors, active, onPress, icon, title, subtitle, badge }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.secondary : "#fff",
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? colors.primary : colors.muted,
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
