import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useGetHomepageCategories, useGetHomepageOccasions } from "@workspace/api-client-react";
import { getHomepageIconName, type HomepageIconName } from "@workspace/homepage-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  type AppStateStatus,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SectionTitle, Wordmark } from "@/components/Brand";
import { DeliveryLocationSheet } from "@/components/location/DeliveryLocationSheet";
import { NotificationPermissionModal } from "@/components/NotificationPermissionModal";
import { ProductCard } from "@/components/ProductCard";
import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import {
  bestSellers,
  reviews,
} from "@/data/catalog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { useWooProducts } from "@/contexts/WooProductsContext";
import { localizedCountryName } from "@/data/countryNamesLocalized";
import { fetchCategoryProducts, type WooProduct } from "@/lib/woo";
import { homepageShuffleSeed, seededShuffle } from "@/lib/shuffle";
import { useAuth } from "@/contexts/AuthContext";
import {
  getNativePermissionStatus,
  getNotificationStatus,
  registerPushToken,
  requestPermission,
  saveNotificationStatus,
} from "@/services/notifications";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 24 * 2 - 14) / 2;
const HERO_HEIGHT = Math.round(SCREEN_H * 0.88);
const AUTO_ADVANCE_MS = 4500;

// Map the shared generic icon names to MaterialCommunityIcons glyphs so
// the mobile carousel fallbacks stay visually in sync with the web build.
const MOBILE_ICON_GLYPH: Record<
  HomepageIconName,
  React.ComponentProps<typeof MaterialCommunityIcons>["name"]
> = {
  gift: "gift-outline",
  cake: "cake-variant",
  heart: "heart",
  trophy: "trophy",
  baby: "baby-carriage",
  flower: "flower",
  balloon: "balloon",
  candy: "candy",
  basket: "basket",
  "teddy-bear": "teddy-bear",
  tv: "television",
  gamepad: "gamepad-variant",
  wine: "glass-wine",
  leaf: "leaf",
  sparkles: "star-four-points",
  "hand-heart": "hand-heart",
};

function HomeHeader({
  topPad,
  onOpenDelivery,
  headerOpacity,
  scrollY,
}: {
  topPad: number;
  onOpenDelivery: () => void;
  headerOpacity: Animated.AnimatedInterpolation<number>;
  scrollY: Animated.Value;
}) {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { lang, isRTL } = useLanguage();
  const { selectedCountry, selectedCity } = useDeliveryLocation();

  const countryName = localizedCountryName(
    lang,
    selectedCountry?.code,
    selectedCountry?.name ?? "Lebanon",
  );
  const countryFlag = selectedCountry?.flag ?? "🇱🇧";
  const deliveryPlaceName = selectedCity?.name ?? countryName;

  const sideRowDir = isRTL ? "row-reverse" : "row";

  // Solid pill background + text colors at all scroll positions, so the
  // location chip stays readable and visually anchored regardless of what's
  // behind it (hero image at the top vs white header background after
  // scrolling). Previously these interpolated with scrollY, which made the
  // pill appear to shift colors as the page scrolled.
  const pillBg = "#ffffff";
  const pillTextColor = colors.primary;

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }} pointerEvents="box-none">
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#fff",
          opacity: headerOpacity,
        }}
      />

      <View style={{ paddingTop: topPad }} pointerEvents="box-none">
        <View
          style={{
            height: 56,
            flexDirection: sideRowDir,
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 14,
          }}
          pointerEvents="box-none"
        >
          <View
            style={{
              flexDirection: sideRowDir,
              alignItems: "center",
              zIndex: 1,
            }}
          >
            <Pressable
              hitSlop={6}
              onPress={onOpenDelivery}
              accessibilityLabel={t.deliveryChooseLocation}
              style={({ pressed }) => ({
                flexDirection: sideRowDir,
                alignItems: "center",
                gap: 6,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Animated.View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: pillBg,
                  borderRadius: 999,
                }}
              />
              <Text style={{ fontSize: 13 }}>{countryFlag}</Text>
              <View
                style={{
                  flexDirection: "column",
                  alignItems: isRTL ? "flex-end" : "flex-start",
                  maxWidth: 120,
                }}
              >
                <Animated.Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 9,
                    lineHeight: 11,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: pillTextColor,
                    opacity: 0.8,
                  }}
                  numberOfLines={1}
                >
                  {t.deliveryHeading}
                </Animated.Text>
                <Animated.Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 12,
                    lineHeight: 14,
                    color: pillTextColor,
                  }}
                  numberOfLines={1}
                >
                  {deliveryPlaceName}
                </Animated.Text>
              </View>
              <Animated.View>
                <Feather name="chevron-down" size={13} color="#fff" />
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerOpacity }]}>
                  <Feather name="chevron-down" size={13} color={colors.primary} />
                </Animated.View>
              </Animated.View>
            </Pressable>
          </View>

          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Animated.View>
              <Wordmark size={64} inverse />
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerOpacity }]}>
                <Wordmark size={64} />
              </Animated.View>
            </Animated.View>
          </View>

          <View
            style={{
              flexDirection: sideRowDir,
              alignItems: "center",
              paddingHorizontal: 4,
              zIndex: 1,
            }}
          >
            <Pressable
              hitSlop={10}
              onPress={() => router.push("/(tabs)/catalog")}
              accessibilityLabel="Search"
            >
              <Animated.View>
                <Feather name="search" size={26} color="#fff" />
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerOpacity }]}>
                  <Feather name="search" size={26} color={colors.primary} />
                </Animated.View>
              </Animated.View>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isRTL } = useLanguage();
  const { selectedCountry } = useDeliveryLocation();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : 24;
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [deliverySheetOpen, setDeliverySheetOpen] = useState(false);
  const { token: authToken, user } = useAuth();

  const scrollY = useRef(new Animated.Value(0)).current;

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT * 0.6, HERO_HEIGHT * 0.85],
    outputRange: [0, 0, 1],
    extrapolate: "clamp",
  });

  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const status = await getNotificationStatus();
      if (cancelled) return;
      if (status === "not_determined") {
        await saveNotificationStatus("prompted");
        if (!cancelled) setNotifModalOpen(true);
        return;
      }
      if (status === "granted") {
        const native = await getNativePermissionStatus();
        if (cancelled) return;
        if (native === "granted") {
          registerPushToken({
            authToken,
            userId: user?.id ?? null,
          }).catch(() => {});
        }
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [authToken, user?.id]);

  const handleAllow = async () => {
    setNotifModalOpen(false);
    const status = await requestPermission();
    if (status === "granted") {
      registerPushToken({
        authToken,
        userId: user?.id ?? null,
      }).catch(() => {});
    }
  };

  const handleSkip = async () => {
    setNotifModalOpen(false);
    await saveNotificationStatus("skipped");
  };

  return (
    <>
      <View
        style={[{ flex: 1, backgroundColor: colors.background }, isRTL ? ({ direction: "rtl" } as any) : null]}
      >
        <Animated.ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: bottomPad + 100 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true },
          )}
        >
          <Hero />
          {selectedCountry?.code !== "AE" && <BrandStrip />}
          <BestSellers />
          <SummerCollectionSection />
          <FlowersSection />
          <CategoryRail />
          <OccasionsCarousel />
          <BundlesSection />
          <BrandStorySection />
          <ReviewsSection />
        </Animated.ScrollView>

        <HomeHeader
          topPad={topPad}
          onOpenDelivery={() => setDeliverySheetOpen(true)}
          headerOpacity={headerOpacity}
          scrollY={scrollY}
        />
      </View>
      <NotificationPermissionModal
        visible={notifModalOpen}
        onAllow={handleAllow}
        onSkip={handleSkip}
      />
      <DeliveryLocationSheet
        visible={deliverySheetOpen}
        onClose={() => setDeliverySheetOpen(false)}
      />
    </>
  );
}

function Hero() {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { isRTL } = useLanguage();
  const ta = isRTL ? "right" : "left";
  const alignSelf = isRTL ? "flex-end" : "flex-start";

  const slides = [
    {
      key: "1",
      image: require("@/assets/images/hero-slide1.png"),
      title: t.heroTitle,
      cta: t.heroCta,
      route: "/category/lux-arrangements" as Href,
    },
    {
      key: "2",
      image: require("@/assets/images/hero-summer-collection.png"),
      title: t.heroSlide2Title,
      subtitle: t.heroSlide2Subtitle,
      cta: t.heroSlide2Cta,
      route: "/category/summer-collection" as Href,
    },
    {
      key: "3",
      image: require("@/assets/images/hero-slide3.png"),
      title: t.heroSlide3Title,
      cta: t.heroSlide3Cta,
      route: "/category/lux-arrangements" as Href,
    },
  ];

  const displaySlides = isRTL ? [...slides].reverse() : slides;

  const flatListRef = useRef<FlatList>(null);
  const currentIndex = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRTLRef = useRef(isRTL);
  isRTLRef.current = isRTL;

  const isFocusedRef = useRef(false);
  const isForegroundRef = useRef(
    AppState.currentState === undefined || AppState.currentState === "active",
  );

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const restartTimer = useCallback(() => {
    stopTimer();
    // Skip the loop entirely when there's only a single slide — there's
    // nothing to advance to and the wake-ups just keep the JS thread busy.
    if (slides.length <= 1) return;
    // Only run while the screen is focused AND the app is in the foreground.
    // A backgrounded app doesn't need to scroll an off-screen carousel and
    // the wake-ups noticeably contribute to battery drain / heat.
    if (!isFocusedRef.current || !isForegroundRef.current) return;
    timerRef.current = setInterval(() => {
      const logicalNext = (currentIndex.current + 1) % slides.length;
      currentIndex.current = logicalNext;
      setActiveIndex(logicalNext);
      const physIdx = isRTLRef.current
        ? slides.length - 1 - logicalNext
        : logicalNext;
      flatListRef.current?.scrollToIndex({ index: physIdx, animated: true });
    }, AUTO_ADVANCE_MS);
  }, [slides.length, stopTimer]);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      restartTimer();
      return () => {
        isFocusedRef.current = false;
        stopTimer();
      };
    }, [restartTimer, stopTimer]),
  );

  // Pause the carousel timer whenever the app moves to background / inactive
  // and resume it on return so we don't keep firing setInterval ticks (and
  // re-rendering) while the user isn't even looking at the screen.
  useEffect(() => {
    const handleAppState = (next: AppStateStatus) => {
      const nextForeground = next === "active";
      if (nextForeground === isForegroundRef.current) return;
      isForegroundRef.current = nextForeground;
      if (nextForeground) {
        restartTimer();
      } else {
        stopTimer();
      }
    };
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [restartTimer, stopTimer]);

  const restartTimerRef = useRef(restartTimer);
  restartTimerRef.current = restartTimer;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        const physIdx = viewableItems[0].index;
        const logIdx = isRTLRef.current
          ? slides.length - 1 - physIdx
          : physIdx;
        currentIndex.current = logIdx;
        setActiveIndex(logIdx);
        restartTimerRef.current();
      }
    },
  ).current;

  const renderSlide = useCallback(
    ({ item }: { item: (typeof slides)[0] }) => (
      <Pressable
        onPress={() => router.push(item.route)}
        style={{ width: SCREEN_W, height: HERO_HEIGHT }}
      >
        <Image
          source={item.image}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.65)"]}
          locations={[0.35, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroContent}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_400Regular",
              fontSize: 38,
              lineHeight: 44,
              color: "#ffffff",
              textAlign: ta,
              letterSpacing: 0.2,
            }}
          >
            {item.title}
          </Text>
          {"subtitle" in item && item.subtitle ? (
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 15,
                lineHeight: 22,
                color: "rgba(255,255,255,0.92)",
                textAlign: ta,
                marginTop: 10,
              }}
            >
              {item.subtitle}
            </Text>
          ) : null}
          <View
            style={[
              styles.heroCta,
              {
                backgroundColor: "#ffffff",
                flexDirection: isRTL ? "row-reverse" : "row",
                alignSelf,
              },
            ]}
          >
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                color: colors.primary,
                letterSpacing: 1,
              }}
            >
              {item.cta}
            </Text>
          </View>
        </View>
      </Pressable>
    ),
    [ta, isRTL, alignSelf, colors.primary, router],
  );

  return (
    <View style={{ height: HERO_HEIGHT, overflow: "hidden" }}>
      <FlatList
        ref={flatListRef}
        data={displaySlides}
        keyExtractor={(item) => item.key}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_W,
          offset: SCREEN_W * index,
          index,
        })}
        bounces={false}
      />
      <View style={styles.heroDots}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[
              styles.heroDot,
              {
                backgroundColor: i === activeIndex ? "#ffffff" : "rgba(255,255,255,0.45)",
                width: i === activeIndex ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function BrandStrip() {
  const colors = useColors();
  const t = useT();
  const items = [
    { icon: "truck-fast" as const, label: t.trustSameDay, sub: t.trustSameDaySub },
    { icon: "flower" as const, label: t.trustHandTied, sub: t.trustHandTiedSub },
    { icon: "shield-check" as const, label: t.trustGuaranteed, sub: t.trustGuaranteedSub },
  ];
  return (
    <View
      style={{
        marginTop: 18,
        marginHorizontal: 24,
        backgroundColor: "#fff",
        borderRadius: 20,
        paddingVertical: 18,
        paddingHorizontal: 16,
        flexDirection: "row",
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {items.map((it, idx) => (
        <React.Fragment key={it.label}>
          {idx > 0 && (
            <View style={{ width: 1, backgroundColor: "rgba(0,0,0,0.08)", alignSelf: "stretch", marginVertical: 4 }} />
          )}
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 4 }}>
            <MaterialCommunityIcons name={it.icon} size={22} color={colors.primary} />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.primary, textAlign: "center", lineHeight: 15 }}>
              {it.label}
            </Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground, textAlign: "center", lineHeight: 14 }}>
              {it.sub}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function BestSellers() {
  const router = useRouter();
  const colors = useColors();
  const t = useT();
  const { lang } = useLanguage();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const { products: wooProducts } = useWooProducts();
  const countryName = localizedCountryName(
    lang,
    selectedCountry?.code,
    selectedCountry?.name ?? "Lebanon",
  );

  // Reshuffle the candidate pool once per UTC day per store so repeat visitors
  // see a fresh order without items jumping around mid-session.
  const shuffledWooProducts = useMemo(
    () => seededShuffle(wooProducts, homepageShuffleSeed("best-sellers", selectedCountry?.code, selectedCity?.id)),
    [wooProducts, selectedCountry?.code, selectedCity?.id],
  );
  const displayProducts = shuffledWooProducts.length > 0
    ? shuffledWooProducts.slice(0, 4)
    : bestSellers;

  if (displayProducts.length === 0) return null;

  const title = t.bestSellersTitleHome.replace("{country}", countryName);
  const description: string | undefined = undefined;

  return (
    <View style={{ marginTop: 36 }}>
      <View
        style={{
          paddingHorizontal: 24,
          marginBottom: 18,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          <SectionTitle
            eyebrow={t.bestSellers}
            title={title}
            description={description}
          />
        </View>
        <Pressable onPress={() => router.push("/(tabs)/catalog")}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.gold, letterSpacing: 1 }}>
            {t.viewAll}
          </Text>
        </Pressable>
      </View>
      <View
        style={{
          paddingHorizontal: 24,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 14,
          rowGap: 24,
        }}
      >
        {displayProducts.map((p) => (
          <ProductCard key={p.id} product={p} width={CARD_W} />
        ))}
      </View>
    </View>
  );
}

const FLOWER_CATS = new Set(["hand-bouquets", "flower-boxes", "lux-arrangements", "flower-vases", "dried-flowers", "preserved-flowers"]);

function FlowersSection() {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const { products: wooProducts } = useWooProducts();
  const flowerProducts = useMemo(() => {
    const pool = wooProducts.filter((p) => FLOWER_CATS.has(p.category));
    return seededShuffle(pool, homepageShuffleSeed("flowers", selectedCountry?.code, selectedCity?.id)).slice(0, 10);
  }, [wooProducts, selectedCountry?.code, selectedCity?.id]);

  if (!flowerProducts.length) return null;
  return (
    <View style={{ marginTop: 44 }}>
      <View
        style={{
          paddingHorizontal: 24,
          marginBottom: 18,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          <SectionTitle
            eyebrow={t.flowersEyebrowHome}
            title={t.flowersTitleHome}
          />
        </View>
        <Pressable onPress={() => router.push("/category/hand-bouquets")}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.gold, letterSpacing: 1 }}>
            {t.viewAll}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 14 }}
      >
        {flowerProducts.map((p) => (
          <ProductCard key={p.id} product={p as any} width={CARD_W} />
        ))}
      </ScrollView>
    </View>
  );
}

function SummerCollectionSection() {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const countryCode = selectedCountry?.code ?? null;
  const cityId = selectedCity?.id ?? null;
  const [products, setProducts] = useState<WooProduct[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCategoryProducts("summer-collection", { countryCode, cityId })
      .then(({ products }) => {
        if (cancelled) return;
        const pool = products.filter((p) => p.image);
        const shuffled = seededShuffle(pool, homepageShuffleSeed("summer-collection", countryCode, cityId));
        setProducts(shuffled.slice(0, 10));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [countryCode, cityId]);

  if (loading || products.length === 0) return null;

  return (
    <View style={{ marginTop: 44 }}>
      <View
        style={{
          paddingHorizontal: 24,
          marginBottom: 18,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          <SectionTitle
            eyebrow={t.summerEyebrowHome}
            title={t.summerTitleHome}
          />
        </View>
        <Pressable onPress={() => router.push("/category/summer-collection")}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.gold, letterSpacing: 1 }}>
            {t.viewAll}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 14 }}
      >
        {products.map((p) => (
          <ProductCard key={p.id} product={p as any} width={CARD_W} />
        ))}
      </ScrollView>
    </View>
  );
}

function BundlesSection() {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const { products: wooProducts } = useWooProducts();
  const bundleProducts = useMemo(() => {
    const pool = wooProducts.filter((p) => p.category === "bundles");
    return seededShuffle(pool, homepageShuffleSeed("bundles", selectedCountry?.code, selectedCity?.id)).slice(0, 6);
  }, [wooProducts, selectedCountry?.code, selectedCity?.id]);

  if (!bundleProducts.length) return null;
  return (
    <View style={{ marginTop: 44 }}>
      <View
        style={{
          paddingHorizontal: 24,
          marginBottom: 18,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          <SectionTitle
            eyebrow={t.bundlesEyebrowHome}
            title={t.bundlesTitleHome}
          />
        </View>
        <Pressable onPress={() => router.push("/category/bundles")}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.gold, letterSpacing: 1 }}>
            {t.viewAll}
          </Text>
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: 24, flexDirection: "row", flexWrap: "wrap", gap: 14, rowGap: 24 }}>
        {bundleProducts.map((p) => (
          <ProductCard key={p.id} product={p as any} width={CARD_W} />
        ))}
      </View>
    </View>
  );
}

type CategoryTileItem = {
  id: string | number;
  slug: string;
  imageUrl?: string | null;
  name: string;
};

type CategoryTileProps = {
  item: CategoryTileItem;
  tileWidth: number;
  imageSize: number;
  imageToLabelGap: number;
  onPress: () => void;
};

function CategoryTile({ item, tileWidth, imageSize, imageToLabelGap, onPress }: CategoryTileProps) {
  const colors = useColors();
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      style={{ alignItems: "center", gap: imageToLabelGap, width: tileWidth }}
    >
      <View
        style={{
          width: imageSize,
          height: imageSize,
          borderRadius: 999,
          overflow: "hidden",
          backgroundColor: "#F3F3F3",
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {item.imageUrl ? (
          <>
            <Image
              source={{ uri: item.imageUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              onLoad={() => setImageLoaded(true)}
            />
            {!imageLoaded && <ShimmerPlaceholder />}
          </>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <MaterialCommunityIcons
              name={MOBILE_ICON_GLYPH[getHomepageIconName(item.slug, item.name)]}
              size={24}
              color={colors.primary}
            />
          </View>
        )}
      </View>
      <Text
        numberOfLines={2}
        style={{
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          color: colors.primary,
          textAlign: "center",
          lineHeight: 14,
        }}
      >
        {item.name}
      </Text>
    </Pressable>
  );
}

function CategoryRail() {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const countryCode = selectedCountry?.code ?? undefined;
  const cityId = selectedCity?.id ?? undefined;
  // Use the same x-store-country / x-store-city headers that
  // `fetchCategoryProducts` uses, so the rail consults the right
  // WooCommerce store. Include the country/city in the React Query
  // key so switching country invalidates the cached rail.
  const { data, isLoading } = useGetHomepageCategories(undefined, {
    request: {
      headers: {
        ...(countryCode ? { "x-store-country": countryCode } : {}),
        ...(cityId ? { "x-store-city": cityId } : {}),
      },
    },
    query: {
      queryKey: [
        "/api/homepage/categories",
        { countryCode: countryCode ?? null, cityId: cityId ?? null },
      ],
    },
  });

  const items = (data?.items ?? []).filter((i) => i.isActive);

  if (!isLoading && items.length === 0) return null;

  const TILE_WIDTH = 88;
  const TILE_IMAGE_SIZE = 80;
  const TILE_IMAGE_TO_LABEL_GAP = 10;
  const TILE_LABEL_HEIGHT = 14 * 2; // lineHeight 14 * 2 lines
  const TILE_TOTAL_HEIGHT = TILE_IMAGE_SIZE + TILE_IMAGE_TO_LABEL_GAP + TILE_LABEL_HEIGHT;
  const ROW_GAP = 18;
  const COL_GAP = 14;

  const renderTile = (item: (typeof items)[number]) => (
    <CategoryTile
      key={item.id}
      item={item}
      tileWidth={TILE_WIDTH}
      imageSize={TILE_IMAGE_SIZE}
      imageToLabelGap={TILE_IMAGE_TO_LABEL_GAP}
      onPress={() => router.push({ pathname: "/category/[slug]", params: { slug: item.slug } })}
    />
  );

  const renderSkeletonTile = (key: string | number) => (
    <View key={key} style={{ alignItems: "center", gap: TILE_IMAGE_TO_LABEL_GAP, width: TILE_WIDTH }}>
      <View
        style={{
          width: TILE_IMAGE_SIZE,
          height: TILE_IMAGE_SIZE,
          borderRadius: 999,
          backgroundColor: colors.muted,
        }}
      />
      <View style={{ width: 56, height: 10, borderRadius: 4, backgroundColor: colors.muted }} />
    </View>
  );

  // Column-major fill: items [0,1] -> col 0, [2,3] -> col 1, etc.
  const columns: Array<Array<(typeof items)[number]>> = [];
  if (!isLoading) {
    for (let i = 0; i < items.length; i += 2) {
      columns.push(items.slice(i, i + 2));
    }
  }

  const skeletonColumnCount = 4;
  const hasTwoRows = isLoading || items.length > 1;

  return (
    <View style={{ marginTop: 44 }}>
      <View style={{ paddingHorizontal: 24, marginBottom: 18 }}>
        <SectionTitle eyebrow={t.browseEyebrow} title={t.categoriesTitle} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: COL_GAP }}
      >
        {isLoading
          ? Array.from({ length: skeletonColumnCount }).map((_, colIdx) => (
              <View key={colIdx} style={{ gap: ROW_GAP }}>
                {renderSkeletonTile(`${colIdx}-0`)}
                {renderSkeletonTile(`${colIdx}-1`)}
              </View>
            ))
          : columns.map((col, colIdx) => (
              <View key={colIdx} style={{ gap: ROW_GAP }}>
                {col[0] ? renderTile(col[0]) : null}
                {hasTwoRows
                  ? col[1]
                    ? renderTile(col[1])
                    : <View style={{ width: TILE_WIDTH, height: TILE_TOTAL_HEIGHT }} />
                  : null}
              </View>
            ))}
      </ScrollView>
    </View>
  );
}

function OccasionsCarousel() {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { data, isLoading } = useGetHomepageOccasions();

  const items = (data?.items ?? []).filter((i) => i.isActive);

  if (!isLoading && items.length === 0) return null;

  return (
    <View style={{ marginTop: 44 }}>
      <View style={{ paddingHorizontal: 24, marginBottom: 18 }}>
        <SectionTitle eyebrow={t.occasionsEyebrow} title={t.occasionsTitle} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 14 }}
      >
        {isLoading
          ? Array.from({ length: 6 }).map((_, idx) => (
              <View key={idx} style={{ alignItems: "center", gap: 10, width: 88 }}>
                <View
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 999,
                    backgroundColor: colors.muted,
                  }}
                />
                <View style={{ width: 56, height: 10, borderRadius: 4, backgroundColor: colors.muted }} />
              </View>
            ))
          : items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() =>
                  router.push({ pathname: "/occasion/[slug]", params: { slug: item.slug } })
                }
                style={{ alignItems: "center", gap: 10, width: 88 }}
              >
                <View
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 999,
                    overflow: "hidden",
                    backgroundColor: "#F3F3F3",
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                    />
                  ) : (
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <MaterialCommunityIcons
                        name={MOBILE_ICON_GLYPH[getHomepageIconName(item.slug, item.name)]}
                        size={24}
                        color={colors.primary}
                      />
                    </View>
                  )}
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 11,
                    color: colors.primary,
                    textAlign: "center",
                    lineHeight: 14,
                  }}
                >
                  {item.name}
                </Text>
              </Pressable>
            ))}
      </ScrollView>
    </View>
  );
}

function BrandStorySection() {
  const colors = useColors();
  const t = useT();
  const { isRTL } = useLanguage();
  const pillars = [
    { title: t.pillar1Title, text: t.pillar1Text },
    { title: t.pillar2Title, text: t.pillar2Text },
    { title: t.pillar3Title, text: t.pillar3Text },
  ];
  return (
    <View
      style={{
        marginTop: 56,
        marginHorizontal: 24,
        borderRadius: 28,
        overflow: "hidden",
        backgroundColor: colors.primary,
        padding: 28,
      }}
    >
      <SectionTitle
        eyebrow={t.storyEyebrow}
        title={t.storyTitle}
        description={t.storyDesc}
        inverse
      />
      <View style={{ marginTop: 28, gap: 18 }}>
        {pillars.map((p, i) => (
          <View key={p.title} style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 16 }}>
            <Text
              style={{
                fontFamily: "PlayfairDisplay_400Regular",
                color: colors.goldSoft,
                fontSize: 22,
                width: 32,
              }}
            >
              0{i + 1}
            </Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                  color: "#fff",
                }}
              >
                {p.title}
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: "rgba(255,255,255,0.75)",
                  lineHeight: 20,
                }}
              >
                {p.text}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ReviewsSection() {
  const colors = useColors();
  return (
    <View style={{ marginTop: 56 }}>
      <View style={{ paddingHorizontal: 24, marginBottom: 18 }}>
        <SectionTitle
          eyebrow="From our clients"
          title="Rated 4.6 over 837 reviews"
        />
      </View>
      <FlatList
        data={reviews}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 14 }}
        renderItem={({ item }) => (
          <View
            style={{
              width: 280,
              backgroundColor: "#fff",
              borderRadius: 20,
              padding: 20,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", gap: 4 }}>
              {Array.from({ length: item.rating }).map((_, i) => (
                <MaterialCommunityIcons key={i} name="star" size={14} color={colors.gold} />
              ))}
            </View>
            <Text
              style={{
                fontFamily: "PlayfairDisplay_400Regular",
                fontSize: 16,
                lineHeight: 24,
                color: colors.primary,
              }}
            >
              “{item.text}”
            </Text>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 11,
                color: colors.mutedForeground,
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              {item.name}
            </Text>
          </View>
        )}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  heroContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 28,
    paddingBottom: 60,
  },
  heroCta: {
    marginTop: 20,
    alignSelf: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroDots: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  heroDot: {
    height: 8,
    borderRadius: 4,
  },
});

export default withRouteErrorBoundary(HomeScreen, "(tabs)/index");
