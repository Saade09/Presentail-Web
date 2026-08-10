import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  I18nManager,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { ProductImageCarousel } from "@/components/ProductImageCarousel";
import { AppText } from "@/components/AppText";
import { DeliveryOption } from "@/components/DeliveryOption";

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
import { CATEGORY_CARE_GROUP, CATEGORY_CARE_ICON, type CareTipGroup } from "@workspace/catalog-data";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { FrequentlyBoughtTogether } from "@/components/FrequentlyBoughtTogether";
import { trackEvent, trackScreenTTID } from "@/lib/analytics";
import { trackFbMobileEvent } from "@/lib/fbPixel";
import { buildProductShareUrl } from "@/lib/productShareUrl";
import {
  getCountryHour,
  firstAvailableDay,
  isExpressDeliveryAvailable,
  nearestSlotForHour,
  timeSlotsForCountry,
  type TimeSlot,
} from "@workspace/delivery";
import { useDeliveryConfig } from "@/hooks/useDeliveryConfig";
import { useDeliveryPricing } from "@/hooks/useDeliveryPricing";
import { calcRewardPoints } from "@workspace/display-currency";
import { useNow } from "@/lib/useNow";

const { width: SCREEN_W } = Dimensions.get("window");


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

function ProductDetailSkeleton() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const LINE_SPACING = 14;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ height: SCREEN_W, backgroundColor: colors.imagePlaceholder, overflow: "hidden" }}>
        <ShimmerPlaceholder />
      </View>

      <View style={{ padding: 24, gap: LINE_SPACING }}>
        <View style={{ height: 10, width: "40%", borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" }}>
          <ShimmerPlaceholder />
        </View>
        <View style={{ height: 22, width: "75%", borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" }}>
          <ShimmerPlaceholder />
        </View>
        <View style={{ height: 18, width: "28%", borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" }}>
          <ShimmerPlaceholder />
        </View>

        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />

        <View style={{ height: 52, borderRadius: 14, backgroundColor: colors.muted, overflow: "hidden" }}>
          <ShimmerPlaceholder />
        </View>
        <View style={{ height: 52, borderRadius: 14, backgroundColor: colors.muted, overflow: "hidden" }}>
          <ShimmerPlaceholder />
        </View>

        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />

        <View style={{ gap: 10 }}>
          <View style={{ height: 10, width: "90%", borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" }}>
            <ShimmerPlaceholder />
          </View>
          <View style={{ height: 10, width: "80%", borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" }}>
            <ShimmerPlaceholder />
          </View>
          <View style={{ height: 10, width: "65%", borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" }}>
            <ShimmerPlaceholder />
          </View>
        </View>
      </View>

      <View
        style={{
          position: "absolute",
          bottom: insets.bottom + 24,
          left: 24,
          right: 24,
          height: 52,
          borderRadius: 999,
          backgroundColor: colors.muted,
          overflow: "hidden",
        }}
      >
        <ShimmerPlaceholder />
      </View>
    </View>
  );
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
  const { selectedCountry } = useDeliveryLocation();
  const { currencyCode, formatNative, formatPrice } = useCurrency();
  const cc = (selectedCountry?.code ?? "").toUpperCase();
  const headingFontRegular = useHeadingFont("400Regular");
  const [copiedVisible, setCopiedVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState(t.shareLinkCopied);
  const [customNote, setCustomNote] = useState("");
  useEffect(() => { setCustomNote(""); }, [slug]);
  const copiedOpacity = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Capture the moment this screen component mounts so we can report
  // how long it took for the product data to become available.
  const mountMsRef = useRef(Date.now());

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

  const handleShareProduct = async (productSlug: string, productName: string) => {
    // Use React Native's built-in Share API (native iOS/Android share sheet).
    // It is part of react-native core, so no extra native module is required —
    // this works on every shipped binary, unlike expo-clipboard which was
    // added after TestFlight build 13 was compiled and previously crashed
    // the app at the native layer when invoked.
    try {
      // Build the canonical share URL. The bare /product/<slug> path is
      // redirected server-side to the correct locale-prefixed route, which
      // triggers per-product OG tag injection for share sheet previews.
      const url = buildProductShareUrl(productSlug);
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

  // Used to open the reschedule sheet from the outer add-button handler when
  // scheduled is selected but no delivery window has been committed yet.
  const openRescheduleRef = useRef<(() => void) | null>(null);
  // Tracks whether express delivery is available for the current city.
  // ProductBody writes this ref during render so the outer add button guard
  // can bypass the window-commitment check in express-unavailable markets.
  const expressAvailableRef = useRef(false);
  // True once city data has loaded (selectedCity is non-null and not loading).
  // Used to distinguish "city still loading" from "express genuinely unavailable".
  const cityLoadedRef = useRef(false);
  // Holds the auto-computed default scheduled window from ProductBody.
  // Used to seed the delivery selection when standard is the only option and
  // the shopper adds to cart without an explicit window pick (no delivery UI shown).
  const seededSelectionRef = useRef<{ mode: "today_slot" | "schedule"; date: string; slotLabel: string } | null>(null);
  // Read delivery selection from context so the add button can gate on an
  // incomplete schedule without requiring state to be lifted from ProductBody.
  const deliverySelectionOuter = useDeliverySelection();

  const { products: allProducts, loading: productsLoading } = useWooProducts();
  const found = allProducts.find((p) => p.id === slug) ?? null;
  // Hide products that the live WC payload reports as out-of-stock so the
  // direct product URL behaves the same as the listings (which already
  // filter OOS items out server-side). `inStock` is propagated from the
  // WC payload by `WooProductsContext.mergeProducts`; a missing value
  // means we have only the static seed for this product and we keep the
  // existing fallback behaviour.
  const product = found && found.inStock === false ? null : found;

  // Fire a mobile TTID event the first time this product screen has data to
  // show. We place the effect before the early return so hooks are called
  // unconditionally, but skip the actual work when product is null.
  // Platform.OS check prevents double-counting on Expo web where web-vitals
  // already handles performance measurement.
  useEffect(() => {
    if (!product || Platform.OS === "web") return;
    trackScreenTTID("product", mountMsRef.current);
    if (cc) {
      trackFbMobileEvent("ViewContent", {
        countryCode: cc,
        contentIds: [product.id],
        contentName: product.name,
      });
    }
  }, [product]); // eslint-disable-line react-hooks/exhaustive-deps

  if (productsLoading && !product) {
    return <ProductDetailSkeleton />;
  }

  if (!product) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <AppText style={{ fontFamily: headingFontRegular, color: colors.primary, fontSize: 18 }}>
          {t.productNotFound}
        </AppText>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <AppText style={{ color: colors.gold, fontFamily: "Inter_500Medium" }}>{t.goBack}</AppText>
        </Pressable>
      </View>
    );
  }

  const cat = getCategory(product.category);
  // Guard the price against NaN / non-finite values so anything we feed to
  // `Math.round` / `formatNative` / `<Price>` is always a real number.
  const safePriceValue = Number.isFinite(Number(product.priceValue))
    ? Number(product.priceValue)
    : 0;
  // Determine if a sale badge should be shown on the product image.
  function parseSaleNum(raw: any): number | null {
    if (raw == null) return null;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw));
    return isFinite(n) && n > 0 ? n : null;
  }
  const saleDiscountUsd = parseSaleNum(product.discountPriceValue);
  const saleDiscountAed = parseSaleNum(product.discountPriceAed);
  const productIsOnSale =
    currencyCode === "AED"
      ? saleDiscountAed != null || saleDiscountUsd != null
      : saleDiscountUsd != null;

  // CTA price: mirrors the active selling price shown in the main price block.
  // Sale + AED + native AED discount → format as-is (already in active currency).
  // Sale + USD discount → convert from USD then format.
  // No sale → convert regular USD price then format.
  const ctaPrice = (() => {
    if (currencyCode === "AED" && saleDiscountAed != null) {
      return formatNative(saleDiscountAed);
    }
    if (saleDiscountUsd != null) {
      return formatPrice(saleDiscountUsd);
    }
    return formatPrice(safePriceValue);
  })();

  // Build the images array for the carousel. Prefer the full list from the
  // API; fall back to a single-item array from product.image so existing
  // products without a gallery still show their hero image.
  const safeFirstImage = toSafeImageSource(product.image);
  const carouselImages: Array<{ uri: string }> = (() => {
    if (Array.isArray(product.images) && product.images.length > 0) {
      return product.images.filter(
        (img) =>
          img !== null &&
          typeof img === "object" &&
          typeof img.uri === "string" &&
          img.uri.length > 0,
      );
    }
    if (
      safeFirstImage !== null &&
      typeof safeFirstImage === "object" &&
      "uri" in safeFirstImage
    ) {
      return [safeFirstImage as { uri: string }];
    }
    return [];
  })();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: SCREEN_W }}>
          <ProductImageCarousel images={carouselImages} height={SCREEN_W} />
          {productIsOnSale ? (
            <View
              style={{
                position: "absolute",
                bottom: 14,
                left: 18,
                backgroundColor: "#e11d48",
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase" }}>
                {t.saleBadge}
              </Text>
            </View>
          ) : null}
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
              <Pressable
                onPress={() => {
                  if (user) {
                    void toggleFavorite(product.id);
                  } else {
                    router.push("/auth");
                  }
                }}
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
          customNote={customNote}
          setCustomNote={setCustomNote}
          openRescheduleRef={openRescheduleRef}
          expressAvailableRef={expressAvailableRef}
          cityLoadedRef={cityLoadedRef}
          seededSelectionRef={seededSelectionRef}
        />
        <FrequentlyBoughtTogether anchorSlug={slug} />
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
          disabled={product.personalisationRequired && customNote.trim().length === 0}
          onPress={() => {
            // Guard: mode===null means no delivery window has been committed yet
            // (first-time user; context starts null and hydrates from AsyncStorage).
            if (deliverySelectionOuter.mode === null) {
              if (!cityLoadedRef.current) {
                // City data still resolving — expressAvailableRef is stale (false).
                // Do not add to cart yet; wait for city data to load.
                return;
              }
              if (expressAvailableRef.current) {
                // Express is available → delivery options UI is visible.
                // Require the shopper to explicitly pick a window via the sheet.
                openRescheduleRef.current?.();
                trackEvent({ name: "delivery_scheduler_opened", deliveryMethod: "standard", deliverySource: "auto" });
                return;
              }
              // Express unavailable → delivery options UI is hidden in this market.
              // Standard is the only option; auto-seed the computed default window
              // so the cart is never submitted with an uncommitted delivery state.
              const seeded = seededSelectionRef.current;
              if (seeded) {
                deliverySelectionOuter.setSelection(seeded);
              }
              // Fall through to add() below with the seeded window.
            }
            add(product.id, 1, customNote || undefined);
            // Internal analytics add_to_cart event with delivery method enrichment.
            trackEvent({
              name: "add_to_cart",
              deliveryMethod: deliverySelectionOuter.mode === "express" ? "express" : "standard",
              deliverySource: "user",
            });
            if (cc) {
              trackFbMobileEvent("AddToCart", {
                countryCode: cc,
                contentIds: [product.id],
                value: Number.isFinite(Number(product.priceValue)) ? Number(product.priceValue) : 0,
                currency: currencyCode,
                email: user?.email || undefined,
              });
            }
          }}
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
              opacity: (product.personalisationRequired && customNote.trim().length === 0) ? 0.4 : pressed ? 0.9 : 1,
            },
          ]}
        >
          <Feather name="shopping-bag" size={16} color="#fff" />
          <AppText
            style={{
              fontFamily: "Inter_600SemiBold",
              color: "#fff",
              fontSize: 13,
              letterSpacing: 1.4,
              textTransform: "uppercase",
            }}
          >
            {t.addLabel} · {ctaPrice}
          </AppText>
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
            <AppText
              style={{
                color: "#fff",
                fontFamily: "Inter_500Medium",
                fontSize: 13,
              }}
            >
              {toastMessage}
            </AppText>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function ProductBody({ product, safePriceValue, cat: _cat, colors, router: _router, customNote, setCustomNote, openRescheduleRef, expressAvailableRef, cityLoadedRef, seededSelectionRef }: any) {
  const deliverySelection = useDeliverySelection();
  const { formatNative, currencyCode } = useCurrency();
  const { selectedCountry, selectedCity, isLoading: locationLoading } = useDeliveryLocation();
  // RTL direction — used for pricing/helper layout and text-alignment guards.
  const isRTL = I18nManager.isRTL;
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
  // OS can disable express per-city (e.g. Akkar has expressAvailable: false).
  // AND with the time-of-day check so both gates must pass.
  // Use `=== true` (not `!== false`) so a null selectedCity (data not yet
  // loaded) evaluates to false — avoids flashing Express for cities that
  // have it disabled before the delivery-locations query resolves.
  const expressAvailable = selectedCity?.expressAvailable === true && isExpressDeliveryAvailable(cc, now);
  // Standard delivery is eligible when the scheduler can produce at least one
  // future window. In practice always true (firstAvailableDay falls back to
  // tomorrow when today's slots are past), but computed explicitly so the
  // eligibility upgrade effect fires if OS cities/hours change.
  const standardEligible = useMemo(() => {
    const slots = (selectedCity?.timeSlots?.length
      ? selectedCity.timeSlots
      : timeSlotsForCountry(cc)) as TimeSlot[];
    const h = getCountryHour(cc);
    const today = new Date().toISOString().slice(0, 10);
    return firstAvailableDay(today, slots, h, today) !== null;
  }, [cc, selectedCity]);
  // Always default to scheduled so free standard delivery is pre-selected.
  // Express is available as an explicit opt-in upgrade, never auto-applied.
  const [delivery, setDeliveryLocal] = useState<"express" | "scheduled">("scheduled");

  // Expose city-loading state and expressAvailable to the outer ProductDetail
  // add button guard so it can: (a) block while city data is still resolving,
  // (b) open the reschedule sheet when express is available and no window is
  // committed, (c) auto-seed a window when express is unavailable (delivery
  // UI is hidden) so Add to Cart proceeds without requiring explicit picks.
  if (expressAvailableRef) {
    expressAvailableRef.current = expressAvailable;
  }
  if (cityLoadedRef) {
    cityLoadedRef.current = !locationLoading && selectedCity !== null;
  }

  // Fire delivery_method_defaulted once after mount to record the automatic
  // standard-delivery default. Not fired for explicit user selections.
  const defaultedFiredRef = useRef(false);
  useEffect(() => {
    if (defaultedFiredRef.current) return;
    defaultedFiredRef.current = true;
    trackEvent({ name: "delivery_method_defaulted", deliveryMethod: "standard", deliverySource: "auto" });
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
  // Eligibility upgrade: if standard delivery has no valid scheduling window
  // AND express is available, fall back to express automatically.
  useEffect(() => {
    if (delivery === "scheduled" && !standardEligible && expressAvailable) {
      setDeliveryLocal("express");
      deliverySelection.setMode("express");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standardEligible, expressAvailable]);

  // Keep the local delivery toggle in sync with the shared selection so
  // that confirming the reschedule sheet (which writes
  // `today_slot` / `schedule`) flips the PDP into the scheduled state,
  // and an external switch back to express (e.g. from the cart) flips
  // it back here too.
  useEffect(() => {
    if (deliverySelection.mode === "schedule" || deliverySelection.mode === "today_slot") {
      if (delivery !== "scheduled") {
        setDeliveryLocal("scheduled");
      }
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
      trackEvent({ name: "express_delivery_selected", action: "express" });
      trackEvent({ name: "express_upgrade_selected", deliveryMethod: "express", deliverySource: "user" });
      trackEvent({ name: "delivery_method_selected", deliveryMethod: "express", deliverySource: "user" });
    } else {
      // Note: scheduled_delivery_selected is intentionally NOT emitted here.
      // The schedule card only opens the reschedule sheet; the actual selection
      // commits in RescheduleDeliverySheet.onConfirm, which fires the event.
      // Emitting here would double-count selections on the confirm path.
      // Seed a sensible default so adding to cart without opening the
      // reschedule sheet still produces a valid schedule selection. The
      // sheet overrides this with the shopper's pick on Confirm.
      // A stored selection is still valid only when it refers to a future date,
      // OR it refers to today and today still has open slots. If today's last
      // slot has already passed, discard the stored selection and re-seed with
      // the correctly-computed defaultDate/defaultSlot (which call
      // firstAvailableDay and already point to tomorrow or later).
      const storedDateIsToday = deliverySelection.date === todayIso;
      const todayStillHasSlots = nearestSlotForHour(PROD_SLOTS, true, localH) !== null;
      const hasExisting =
        (deliverySelection.mode === "schedule" || deliverySelection.mode === "today_slot") &&
        deliverySelection.date &&
        deliverySelection.slotLabel &&
        (!storedDateIsToday || todayStillHasSlots);
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
  const headingFontMedium = useHeadingFont("500Medium");
  const headingFontRegular = useHeadingFont("400Regular");
  const priceValue = Number.isFinite(safePriceValue) ? safePriceValue : 0;
  const { freeDeliveryEnabled, freeDeliveryThresholdNative, isLoaded: deliveryConfigLoaded } = useDeliveryConfig();
  const { formatNative: fmtNative, convert } = useCurrency();

  // Delivery pricing — projects the cart value after adding this product.
  // This PDP always adds 1 unit at a time (no quantity selector on screen);
  // update selectedQty here if a quantity picker is added in future.
  const selectedQty = 1;
  const productUsdForPricing = (() => {
    const disc = product.discountPriceValue;
    const discNum = disc != null ? parseFloat(String(disc)) : NaN;
    return isFinite(discNum) && discNum > 0 ? discNum : priceValue;
  })();
  const deliveryPricing = useDeliveryPricing(productUsdForPricing, selectedQty);

  // Active selling price in the shopper's native display currency — used to
  // determine whether this single product meets the free-delivery threshold.
  const activePrice = convert(productUsdForPricing);
  const qualifiesForFreeDelivery =
    deliveryConfigLoaded &&
    freeDeliveryEnabled &&
    freeDeliveryThresholdNative > 0 &&
    activePrice >= freeDeliveryThresholdNative;

  // Fire delivery_pricing_viewed once when the delivery options section mounts
  useEffect(() => {
    if (!expressAvailable) return;
    trackEvent({
      name: "delivery_pricing_viewed",
      action: deliveryPricing.pricingState,
      // state encodes: country|city|isFreeStandard|threshold|surcharge
      state: [
        selectedCountry?.code ?? "",
        selectedCity?.name ?? "",
        String(deliveryPricing.isFreeStandard),
        String(freeDeliveryThresholdNative),
        String(deliveryPricing.expressSurcharge),
      ].join("|"),
      metricValue: deliveryPricing.standardFee ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expressAvailable]);

  // Detect isFreeStandard transitions and fire qualification events
  const prevFreeRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevFreeRef.current === null) {
      prevFreeRef.current = deliveryPricing.isFreeStandard;
      return;
    }
    if (deliveryPricing.isFreeStandard && !prevFreeRef.current) {
      trackEvent({ name: "free_standard_delivery_qualified", action: "qualify" });
    } else if (!deliveryPricing.isFreeStandard && prevFreeRef.current) {
      trackEvent({ name: "free_standard_delivery_qualification_lost", action: "disqualify" });
    }
    prevFreeRef.current = deliveryPricing.isFreeStandard;
  }, [deliveryPricing.isFreeStandard]);

  // Fire delivery_price_recalculated when computed fees change
  const prevFeeSigRef = useRef<string | null>(null);
  useEffect(() => {
    const sig = `${deliveryPricing.standardFee}|${deliveryPricing.expressSurcharge}|${deliveryPricing.expressTotal}|${deliveryPricing.isFreeStandard}|${deliveryPricing.pricingState}`;
    if (prevFeeSigRef.current === null) {
      prevFeeSigRef.current = sig;
      return;
    }
    if (sig !== prevFeeSigRef.current) {
      prevFeeSigRef.current = sig;
      trackEvent({
        name: "delivery_price_recalculated",
        action: deliveryPricing.pricingState,
        // state encodes: standardFee|expressTotal|isFreeStandard
        state: [
          String(deliveryPricing.standardFee ?? ""),
          String(deliveryPricing.expressTotal ?? ""),
          String(deliveryPricing.isFreeStandard),
        ].join("|"),
        metricValue: deliveryPricing.expressSurcharge,
      });
    }
  }, [
    deliveryPricing.standardFee,
    deliveryPricing.expressSurcharge,
    deliveryPricing.expressTotal,
    deliveryPricing.isFreeStandard,
    deliveryPricing.pricingState,
  ]);

  // Fire free_delivery_qualification_message_viewed once per qualifying
  // state transition (false → true). A ref tracks the previous value so
  // the event fires at most once per transition, never on every render.
  const prevQualifiesRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevQualifiesRef.current === null) {
      if (qualifiesForFreeDelivery) {
        trackEvent({
          name: "free_delivery_qualification_message_viewed",
          productId: String(product.id ?? ""),
          state: [
            selectedCity?.id ?? "",
            selectedCountry?.code ?? "",
            currencyCode,
            String(activePrice),
            String(freeDeliveryThresholdNative),
          ].join("|"),
        });
      }
      prevQualifiesRef.current = qualifiesForFreeDelivery;
      return;
    }
    if (qualifiesForFreeDelivery && !prevQualifiesRef.current) {
      trackEvent({
        name: "free_delivery_qualification_message_viewed",
        productId: String(product.id ?? ""),
        state: [
          selectedCity?.id ?? "",
          selectedCountry?.code ?? "",
          currencyCode,
          String(activePrice),
          String(freeDeliveryThresholdNative),
        ].join("|"),
      });
    }
    prevQualifiesRef.current = qualifiesForFreeDelivery;
  }, [qualifiesForFreeDelivery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build display labels for delivery option cards
  const { standardFee, expressSurcharge, expressTotal, isFreeStandard, pricingState } = deliveryPricing;

  const expressCardFeeLabel = (() => {
    if (pricingState === "error") return t.deliveryCalculatedAtCheckout;
    if (pricingState === "unknown_area" || pricingState === "from_min") {
      // Express surcharge is country-wide and reliable even when the exact
      // area/standard-fee is unknown.  expressTotal = standard(≥0) + surcharge,
      // so surcharge is the true lower-bound → "From {surcharge}" is the
      // correct label per the task spec ("From $X when a reliable minimum exists").
      return t.deliveryFromMin.replace("{amount}", fmtNative(expressSurcharge));
    }
    const total = expressTotal ?? expressSurcharge;
    return t.deliveryExpressTotal.replace("{amount}", fmtNative(total));
  })();

  const expressCardFeeSubLabel = (() => {
    if (pricingState === "error" || pricingState === "unknown_area" || pricingState === "from_min") return undefined;
    if (isFreeStandard) {
      return t.deliveryFreeBreakdown.replace("{express}", fmtNative(expressSurcharge));
    }
    if (standardFee !== null) {
      return t.deliveryExpressBreakdown
        .replace("{standard}", fmtNative(standardFee))
        .replace("{express}", fmtNative(expressSurcharge));
    }
    return undefined;
  })();

  const scheduleCardFeeLabel = (() => {
    if (pricingState === "error") return t.deliveryCalculatedAtCheckout;
    if (pricingState === "unknown_area") {
      // No city selected — area truly unknown.
      return t.deliveryAreaUnknown;
    }
    if (pricingState === "from_min") {
      // City IS selected but its standard delivery fee is not yet configured
      // in the OS catalog. We can't show a reliable minimum for standard
      // delivery, so show "calculated at checkout" (not "area unknown").
      return t.deliveryCalculatedAtCheckout;
    }
    if (isFreeStandard) return t.deliveryFreeLabel;
    if (standardFee !== null) return fmtNative(standardFee);
    return t.deliveryCalculatedAtCheckout;
  })();

  const scheduleCardFeeSubLabel = (() => {
    if (pricingState === "error" || pricingState === "unknown_area" || pricingState === "from_min") return undefined;
    return t.deliveryStandardFee;
  })();

  // Sale / discount price helpers
  function parseDiscountNum(raw: any): number | null {
    if (raw == null) return null;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw));
    return isFinite(n) && n > 0 ? n : null;
  }
  const discountValueUsd = parseDiscountNum(product.discountPriceValue);
  const discountValueAed = parseDiscountNum(product.discountPriceAed);
  const isAed = currencyCode === "AED";
  const onSale =
    isAed
      ? (discountValueAed != null || discountValueUsd != null)
      : discountValueUsd != null;
  const points = calcRewardPoints(priceValue);

  // Seed defaults used when the shopper switches to scheduled delivery
  // without opening the reschedule sheet (e.g. the express-unavailable
  // auto-fallback). The sheet overwrites these on Confirm.
  const PROD_SLOTS = (selectedCity?.timeSlots?.length
    ? selectedCity.timeSlots
    : timeSlotsForCountry(cc)) as TimeSlot[];
  const localH = getCountryHour(cc);
  const todaySlot = nearestSlotForHour(PROD_SLOTS, true, localH);
  const todayIso = new Date().toISOString().slice(0, 10);
  const tomorrowIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const _firstAvail = todaySlot
    ? { iso: todayIso, slot: todaySlot }
    : firstAvailableDay(todayIso, PROD_SLOTS, localH, todayIso);
  const defaultDate = _firstAvail?.iso ?? tomorrowIso;
  const defaultSlot = (
    _firstAvail?.slot ??
    nearestSlotForHour(PROD_SLOTS, false, localH) ??
    PROD_SLOTS[0]
  )!.label;
  // Expose the computed default window so the outer add-button handler can
  // auto-seed the delivery selection when express is unavailable (delivery
  // options UI hidden) and no window has been committed yet.
  if (seededSelectionRef) {
    const seededMode = defaultDate === todayIso ? "today_slot" : "schedule";
    seededSelectionRef.current = { mode: seededMode, date: defaultDate, slotLabel: defaultSlot };
  }
  const [rescheduleVisible, setRescheduleVisible] = useState(false);
  // Expose the sheet opener to the outer add-button handler so it can open
  // the sheet when the user taps Add to Cart with no window selected yet.
  // Ref assignment during render is safe in React for this pattern.
  if (openRescheduleRef) {
    openRescheduleRef.current = () => setRescheduleVisible(true);
  }

  const categorySlug = product.category ?? "";
  const careTipGroup: CareTipGroup = CATEGORY_CARE_GROUP[categorySlug] ?? "flowers";
  const careIconName = CATEGORY_CARE_ICON[categorySlug] ?? "flower-tulip";

  const careTips: string[] = (() => {
    switch (careTipGroup) {
      case "balloons":  return [t.careTipBalloon1, t.careTipBalloon2, t.careTipBalloon3, t.careTipBalloon4];
      case "cakes":     return [t.careTipCake1, t.careTipCake2, t.careTipCake3, t.careTipCake4];
      case "plants":    return [t.careTipPlant1, t.careTipPlant2, t.careTipPlant3, t.careTipPlant4];
      case "chocolate": return [t.careTipChocolate1, t.careTipChocolate2, t.careTipChocolate3, t.careTipChocolate4];
      case "stuffed":   return [t.careTipStuffed1, t.careTipStuffed2, t.careTipStuffed3, t.careTipStuffed4];
      case "bundles":   return [t.careTipBundle1, t.careTipBundle2, t.careTipBundle3, t.careTipBundle4];
      case "electronics": return [t.careTipElectronics1, t.careTipElectronics2, t.careTipElectronics3, t.careTipElectronics4];
      default:          return [t.careTipFlower1, t.careTipFlower2, t.careTipFlower3, t.careTipFlower4];
    }
  })();

  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 22, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, flexShrink: 1 }}>
          {onSale ? (
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              {isAed && discountValueAed != null ? (
                <Price
                  value={discountValueAed}
                  native
                  style={{ fontFamily: headingFontMedium, fontSize: 26, color: "#e11d48" }}
                />
              ) : (
                <Price
                  value={discountValueUsd!}
                  style={{ fontFamily: headingFontMedium, fontSize: 26, color: "#e11d48" }}
                />
              )}
              <Price
                value={priceValue}
                style={{ fontFamily: headingFontMedium, fontSize: 18, color: colors.mutedForeground, textDecorationLine: "line-through", marginBottom: 2 }}
              />
            </View>
          ) : (
            <Price
              value={priceValue}
              style={{ fontFamily: headingFontMedium, fontSize: 26, color: colors.text }}
            />
          )}
          <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 }}>
            {t.taxInclusive}
          </AppText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <MaterialCommunityIcons name="star-four-points" size={14} color={colors.gold} />
          <AppText style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.gold }}>
            {t.earnPointsPrefix} {points} {t.earnPointsSuffix}
          </AppText>
        </View>
      </View>

      {/* Free delivery qualification confirmation badge — shown below price row, above product title */}
      {qualifiesForFreeDelivery && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: -2 }}>
          <MaterialCommunityIcons
            name="check-circle"
            size={16}
            color={colors.primary}
            accessible={false}
            style={{ marginTop: 1 }}
          />
          <AppText
            style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary, flex: 1, lineHeight: 18 }}
          >
            {delivery === "express"
              ? t.freeDeliveryQualifiedExpress.replace("{amount}", fmtNative(expressSurcharge))
              : t.freeDeliveryQualifiedStandard}
          </AppText>
        </View>
      )}

      <AppText style={{ fontFamily: headingFontMedium, fontSize: 28, color: colors.primary, lineHeight: 34 }}>
        {product.name}
      </AppText>

      {/* Custom personalisation note */}
      {product.hasInputField && (
        <View style={{ marginTop: 16, paddingHorizontal: 0 }}>
          <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 14 }}>
            {product.personalisationRequired
              ? t.customNoteRequiredLabel
              : _cat?.slug === "cakes"
                ? t.customNoteLabel
                : t.customNoteLabelPlain}
          </AppText>
          <View style={{ position: "relative" }}>
            <TextInput
              value={customNote}
              onChangeText={(text) => { if (text.length <= 22) setCustomNote(text); }}
              placeholder={_cat?.slug === "cakes" ? t.cakeNotePlaceholder : t.customNotePlaceholder}
              placeholderTextColor={colors.mutedForeground}
              maxLength={22}
              style={{
                backgroundColor: colors.card,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                paddingEnd: 48,
                fontFamily: "Inter_400Regular",
                fontSize: 14,
                color: colors.primary,
              }}
              returnKeyType="done"
            />
            <AppText style={{ position: "absolute", end: 12, top: "50%", transform: [{ translateY: -8 }], fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>
              {t.customNoteCounter.replace("{count}", String(customNote.length))}
            </AppText>
          </View>
        </View>
      )}

      {/* Delivery options — only shown when express is available */}
      {expressAvailable && (
        <View style={{ marginTop: 8, gap: 10 }}>
          <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground, letterSpacing: 1.6, textTransform: "uppercase" }}>
            {t.deliveryOptionsLabel}
          </AppText>

          <DeliveryOption
            colors={colors}
            active={delivery === "express"}
            onPress={() => setDelivery("express")}
            icon="flash-outline"
            title={t.expressDelivery}
            subtitle={t.arrivesIn90}
            badge={t.fastest}
            feeLabel={expressCardFeeLabel}
            feeSubLabel={expressCardFeeSubLabel}
            isFree={false}
          />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ height: 1, backgroundColor: colors.border, flex: 1 }} />
            <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: colors.mutedForeground, letterSpacing: 1.5 }}>
              OR
            </AppText>
            <View style={{ height: 1, backgroundColor: colors.border, flex: 1 }} />
          </View>

          <DeliveryOption
            colors={colors}
            active={delivery === "scheduled"}
            onPress={() => {
              // Open the sheet; flip local state to "scheduled" on Confirm.
              // Dismissing the sheet leaves the current mode unchanged so
              // "Keep Express" really does keep express on the PDP.
              setRescheduleVisible(true);
              trackEvent({ name: "delivery_scheduler_opened", deliveryMethod: "standard", deliverySource: "user" });
            }}
            icon="calendar-clock"
            title={t.selectDateAndTime}
            subtitle={
              delivery === "scheduled" && deliverySelection.date && deliverySelection.slotLabel
                ? `${deliverySelection.date} · ${deliverySelection.slotLabel}`
                : t.pickAWindow
            }
            feeLabel={scheduleCardFeeLabel}
            feeSubLabel={scheduleCardFeeSubLabel}
            isFree={isFreeStandard}
          />

          {/* Below-cards helper — reactive to free-delivery qualification */}
          {pricingState !== "error" && (
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, paddingHorizontal: 2 }}>
              <Feather
                name={isFreeStandard ? "check-circle" : "info"}
                size={13}
                color={isFreeStandard ? colors.primary : colors.mutedForeground}
              />
              <AppText
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 11,
                  color: isFreeStandard ? colors.primary : colors.mutedForeground,
                  flex: 1,
                  lineHeight: 16,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {isFreeStandard ? t.deliveryQualifiedHelper : t.deliveryFeesUpdateHelper}
              </AppText>
            </View>
          )}
        </View>
      )}
      <RescheduleDeliverySheet
        visible={rescheduleVisible}
        onClose={() => setRescheduleVisible(false)}
        onConfirm={() => {
          // Fire scheduled_delivery_selected only on explicit user confirmation
          // via the sheet — not on card tap or automatic default.
          trackEvent({ name: "scheduled_delivery_selected", action: "schedule" });
          trackEvent({ name: "delivery_method_selected", deliveryMethod: "standard", deliverySource: "user" });
          trackEvent({ name: "delivery_window_selected", deliveryMethod: "standard", deliverySource: "user" });
        }}
      />

      {/* Trust badges — informational, intentionally non-button */}
      {(() => {
        const isRTL = I18nManager.isRTL;
        const textAlign = isRTL ? "right" : "center";
        const badges = [
          freeDeliveryEnabled ? { icon: "truck-fast", title: t.freeStandardDelivery, sub: `${t.onOrdersAbove} ${formatNative(freeDeliveryThresholdNative)}.` } : null,
          { icon: "map-marker-question", title: t.noAddressHassle, sub: t.ifNeeded },
          { icon: "map-marker-path", title: t.liveOrderTracking, sub: t.realTimeUpdates },
        ].filter((b): b is NonNullable<typeof b> => b !== null);
        const columns = isRTL ? [...badges].reverse() : badges;
        return (
          <View
            style={{
              marginTop: 14,
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              flexDirection: "row",
              paddingVertical: 10,
            }}
          >
            {columns.map((col, i) => (
              <React.Fragment key={col.title}>
                {i > 0 && (
                  <View style={{ width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: colors.border }} />
                )}
                <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 6 }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      backgroundColor: colors.muted,
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 5,
                    }}
                  >
                    <MaterialCommunityIcons name={col.icon as any} size={15} color={colors.gold} />
                  </View>
                  <AppText style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: colors.primary, textAlign }}>{col.title}</AppText>
                  <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: colors.mutedForeground, textAlign, marginTop: 1 }}>{col.sub}</AppText>
                </View>
              </React.Fragment>
            ))}
          </View>
        );
      })()}

      {/* Payment methods */}
      <View style={{ marginTop: 6, gap: 8 }}>
        <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground, letterSpacing: 1.6, textTransform: "uppercase" }}>
          {t.waysToPayLabel}
        </AppText>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "nowrap",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 6,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 16,
            paddingHorizontal: 10,
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
                <AppText style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: a ? colors.primary : colors.mutedForeground, letterSpacing: 1, textTransform: "uppercase" }}>
                  {tabItem.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {tab === "description" ? (
          <View style={{ paddingTop: 16, gap: 10 }}>
            <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 22, color: colors.mutedForeground }}>
              {product.description ??
                `The "${product.name}" is a captivating Presentail piece — hand-arranged in our Beirut atelier with the freshest seasonal blooms, finished with our boutique wrapping and a personal note card.`}
            </AppText>
            <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: colors.primary, marginTop: 4 }}>
              {t.thisArrangementIncludes}
            </AppText>
            {[t.includedStem, t.includedWrap, t.includedCard, t.includedDelivery].map((b) => (
              <View key={b} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <AppText style={{ color: colors.gold, fontSize: 14, lineHeight: 20 }}>•</AppText>
                <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.primary, flex: 1, lineHeight: 20 }}>
                  {b}
                </AppText>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ paddingTop: 16, gap: 10 }}>
            {careTips.map((c) => (
              <View key={c} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <MaterialCommunityIcons name={careIconName as any} size={14} color={colors.gold} style={{ marginTop: 3 }} />
                <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.primary, flex: 1, lineHeight: 20 }}>
                  {c}
                </AppText>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
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
