import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useGetHomepageCategories, useGetHomepageOccasions } from "@workspace/api-client-react";
import { getHomepageIconName, type HomepageIconName } from "@workspace/homepage-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SectionTitle, Wordmark } from "@/components/Brand";
import { DirhamSymbol } from "@/components/DirhamSymbol";
import { DeliveryLocationSheet } from "@/components/location/DeliveryLocationSheet";
import { NotificationPermissionModal } from "@/components/NotificationPermissionModal";
import { ProductCard } from "@/components/ProductCard";
import { SideMenu } from "@/components/SideMenu";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import {
  bestSellers,
  brands,
  reviews,
} from "@/data/catalog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { useWooProducts } from "@/contexts/WooProductsContext";
import { fetchCategoryProducts, fetchWcBrands, type WcBrand, type WooProduct } from "@/lib/woo";
import { homepageShuffleSeed, seededShuffle } from "@/lib/shuffle";
import { useAuth } from "@/contexts/AuthContext";
import {
  getNativePermissionStatus,
  getNotificationStatus,
  registerPushToken,
  requestPermission,
  saveNotificationStatus,
} from "@/services/notifications";

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
  onOpenMenu,
  headerOpacity,
  scrollY,
}: {
  topPad: number;
  onOpenDelivery: () => void;
  onOpenMenu: () => void;
  headerOpacity: Animated.AnimatedInterpolation<number>;
  scrollY: Animated.Value;
}) {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { isRTL, lang, setLang } = useLanguage();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const { token: authToken } = useAuth();

  const countryName = selectedCountry?.name ?? "Lebanon";
  const countryFlag = selectedCountry?.flag ?? "🇱🇧";
  const deliveryPlaceName = selectedCity?.name ?? countryName;

  const sideRowDir = isRTL ? "row-reverse" : "row";

  const nextLang = lang === "EN" ? "AR" : lang === "AR" ? "FR" : "EN";
  const toggleLanguage = () => {
    setLang(nextLang);
  };
  const languagePillLabel =
    nextLang === "AR" ? "عربية" : nextLang === "FR" ? "Français" : "English";

  const goAccount = () => {
    router.push(authToken ? "/(tabs)/account" : "/auth");
  };

  const pillBg = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT * 0.6, HERO_HEIGHT * 0.85],
    outputRange: ["rgba(255,255,255,0.25)", "rgba(255,255,255,0.25)", "#e6e6e6"],
    extrapolate: "clamp",
  });

  const pillTextColor = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT * 0.6, HERO_HEIGHT * 0.85],
    outputRange: ["#ffffff", "#ffffff", colors.primary],
    extrapolate: "clamp",
  });

  const utilityBarBg = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT * 0.6, HERO_HEIGHT * 0.85],
    outputRange: ["transparent", "transparent", "#f1f1f1"],
    extrapolate: "clamp",
  });

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
        <Animated.View
          style={{
            flexDirection: sideRowDir,
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 14,
            paddingVertical: 10,
            minHeight: 48,
            gap: 8,
            backgroundColor: utilityBarBg,
          }}
          pointerEvents="auto"
        >
          <View
            style={{
              flexDirection: sideRowDir,
              alignItems: "center",
              gap: 6,
              flexShrink: 1,
            }}
          >
            <Animated.View>
              <Feather name="map-pin" size={13} color="#fff" />
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerOpacity }]}>
                <Feather name="map-pin" size={13} color={colors.primary} />
              </Animated.View>
            </Animated.View>
            <Animated.Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: pillTextColor,
              }}
              numberOfLines={1}
            >
              {t.noHassleDetails}
            </Animated.Text>
          </View>

          <View
            style={{
              flexDirection: sideRowDir,
              alignItems: "center",
              gap: 6,
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
                  maxWidth: 96,
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

            <Pressable
              hitSlop={6}
              onPress={toggleLanguage}
              accessibilityLabel={t.languageLabel}
              style={({ pressed }) => ({
                borderRadius: 999,
                paddingHorizontal: 12,
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
              <Animated.Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: pillTextColor,
                }}
                numberOfLines={1}
              >
                {languagePillLabel}
              </Animated.Text>
            </Pressable>
          </View>
        </Animated.View>

        <View
          style={{
            height: 56,
            flexDirection: sideRowDir,
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 18,
          }}
          pointerEvents="box-none"
        >
          <View
            style={{
              flexDirection: sideRowDir,
              alignItems: "center",
              gap: 18,
              zIndex: 1,
            }}
          >
            <Pressable
              hitSlop={10}
              onPress={onOpenMenu}
              accessibilityLabel={t.menuOpen}
            >
              <Animated.View>
                <Feather name="menu" size={28} color="#fff" />
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerOpacity }]}>
                  <Feather name="menu" size={28} color={colors.primary} />
                </Animated.View>
              </Animated.View>
            </Pressable>
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
              gap: 18,
              zIndex: 1,
            }}
          >
            <Pressable
              hitSlop={10}
              onPress={goAccount}
              accessibilityLabel="Account"
            >
              <Animated.View>
                <Feather name="user" size={26} color="#fff" />
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerOpacity }]}>
                  <Feather name="user" size={26} color={colors.primary} />
                </Animated.View>
              </Animated.View>
            </Pressable>
            <Pressable
              hitSlop={10}
              onPress={() => router.push("/(tabs)/cart")}
              accessibilityLabel="Cart"
            >
              <Animated.View>
                <MaterialCommunityIcons
                  name="shopping-outline"
                  size={28}
                  color="#fff"
                />
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerOpacity }]}>
                  <MaterialCommunityIcons
                    name="shopping-outline"
                    size={28}
                    color={colors.primary}
                  />
                </Animated.View>
              </Animated.View>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isRTL } = useLanguage();
  const { selectedCountry } = useDeliveryLocation();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : 24;
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [deliverySheetOpen, setDeliverySheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
            { useNativeDriver: false },
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
          {selectedCountry?.code !== "AE" && <BrandsRow />}
          <Footer />
        </Animated.ScrollView>

        <HomeHeader
          topPad={topPad}
          onOpenDelivery={() => setDeliverySheetOpen(true)}
          onOpenMenu={() => setMenuOpen(true)}
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
      <SideMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenDelivery={() => setDeliverySheetOpen(true)}
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

  const restartTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const logicalNext = (currentIndex.current + 1) % slides.length;
      currentIndex.current = logicalNext;
      setActiveIndex(logicalNext);
      const physIdx = isRTLRef.current
        ? slides.length - 1 - logicalNext
        : logicalNext;
      flatListRef.current?.scrollToIndex({ index: physIdx, animated: true });
    }, AUTO_ADVANCE_MS);
  }, [slides.length]);

  useEffect(() => {
    restartTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [restartTimer]);

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
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const { products: wooProducts } = useWooProducts();
  const countryName = selectedCountry?.name ?? "Lebanon";

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

  return (
    <View style={{ marginTop: 44 }}>
      <View style={{ paddingHorizontal: 24, marginBottom: 18 }}>
        <SectionTitle eyebrow={t.browseEyebrow} title={t.categoriesTitle} />
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
                  router.push({ pathname: "/category/[slug]", params: { slug: item.slug } })
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

function BrandsRow() {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const [wcBrands, setWcBrands] = useState<WcBrand[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const filter = selectedCountry ? { countryCode: selectedCountry.code, cityId: selectedCity?.id } : undefined;
    fetchWcBrands(filter).then((list) => {
      setWcBrands(list.length > 0 ? list.filter((b) => b.count > 0) : []);
      setLoaded(true);
    });
  }, [selectedCountry?.code, selectedCity?.id]);

  type DisplayBrand = { id: number | string; name: string; slug: string; count: number; image: string | null };
  const displayBrands: DisplayBrand[] = wcBrands.length > 0
    ? wcBrands
    : loaded ? [] : brands.map((b) => ({ id: b.slug, name: b.name, slug: b.slug, count: 1, image: null }));

  if (loaded && displayBrands.length === 0) return null;

  return (
    <View style={{ marginTop: 56 }}>
      <View style={{ paddingHorizontal: 24, marginBottom: 18 }}>
        <SectionTitle eyebrow={t.brandsEyebrow} title={t.brandsTitle} />
      </View>
      <FlatList
        data={displayBrands}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(b) => String(b.id ?? b.slug)}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
        renderItem={({ item: b }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/brand/[slug]", params: { slug: b.slug } })}
            style={({ pressed }) => ({
              width: 116,
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: "#fff",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {b.image ? (
              <Image
                source={{ uri: b.image }}
                style={{ width: 116, height: 80 }}
                contentFit="contain"
              />
            ) : (
              <View
                style={{
                  width: 116,
                  height: 80,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 10,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: b.name.length > 10 ? 9 : 11,
                    color: "#fff",
                    textAlign: "center",
                    letterSpacing: 0.3,
                    lineHeight: 15,
                  }}
                >
                  {b.name}
                </Text>
              </View>
            )}
            <View style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 11,
                  color: colors.primary,
                  letterSpacing: 0.3,
                }}
                numberOfLines={1}
              >
                {b.name}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

type FooterLink = { label: string; href?: Href; action?: "contact" };

function Footer() {
  const colors = useColors();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>("popular");
  const { currencyCode, setCurrencyCode, list: CURRENCIES } = useCurrency();
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const { lang: language, setLang: setLanguage } = useLanguage();
  const t = useT();
  const { selectedCountry } = useDeliveryLocation();

  const countrySlugMap: Record<string, string> = { LB: "lebanon", AE: "uae", CY: "cyprus" };
  const countrySlug = countrySlugMap[selectedCountry?.code ?? "LB"] ?? "lebanon";
  const baseUrl = `https://presentail.com/${countrySlug}`;

  const sections: { id: string; title: string; links: FooterLink[] }[] = [
    {
      id: "social",
      title: t.socialMedia,
      links: [
        { label: "Facebook", href: "https://www.facebook.com/presentail" },
        { label: "Instagram", href: "https://www.instagram.com/presentail.gifts/" },
        { label: "TikTok", href: "https://www.tiktok.com/@presentail.gifts" },
        { label: "LinkedIn", href: "https://www.linkedin.com/company/presentail" },
      ],
    },
    {
      id: "contact",
      title: t.getInTouch,
      links: [
        { label: t.contactUs, href: "/contact" },
        { label: t.faqs, href: "/faq" },
      ],
    },
    {
      id: "popular",
      title: t.popularCategories,
      links: [
        { label: t.flowers, href: "/category/hand-bouquets" },
        { label: t.plants, href: "/category/plants" },
        { label: t.giftBundles, href: "/category/bundles" },
        { label: t.cakesSweets, href: "/category/cakes" },
        { label: t.baskets, href: "/category/baskets" },
        { label: t.bearsAndBalloons, href: "/category/stuffed-animals" },
        { label: t.occasions, href: "/occasions" },
      ],
    },
    {
      id: "know",
      title: t.getToKnowUs,
      links: [
        { label: t.partnerWithUs, href: `${baseUrl}/partner` },
        { label: t.deliveryRates, href: `${baseUrl}/delivery-rates` },
        { label: t.weddingsEvents, href: `${baseUrl}/weddings-events` },
        { label: t.corporateGifts, href: `${baseUrl}/corporate-gifts` },
        { label: t.careers, href: `${baseUrl}/careers` },
        { label: t.blogs, href: `${baseUrl}/blog` },
      ],
    },
  ];

  const onLink = (l: FooterLink) => {
    if (l.action === "contact") {
      Linking.openURL("mailto:hello@presentail.com");
      return;
    }
    if (!l.href) return;
    // External URLs are stored as plain strings; internal hrefs may be
    // typed Href objects too. Open externals via Linking and route the
    // rest through expo-router so type-checking works without `as any`.
    if (typeof l.href === "string" && l.href.startsWith("http")) {
      Linking.openURL(l.href);
      return;
    }
    router.push(l.href);
  };

  return (
    <View
      style={{
        marginTop: 56,
        backgroundColor: colors.primary,
        paddingHorizontal: 28,
        paddingTop: 36,
        paddingBottom: 28,
        gap: 18,
      }}
    >
      <Wordmark size={28} inverse />
      <Text
        style={{
          fontFamily: "Inter_400Regular",
          fontSize: 13,
          lineHeight: 22,
          color: "rgba(255,255,255,0.78)",
          maxWidth: 320,
        }}
      >
        {t.footerTagline}
      </Text>

      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.12)", marginTop: 6 }} />

      {sections.map((s) => {
        const expanded = open === s.id;
        return (
          <View key={s.id} style={{ borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.10)", paddingBottom: expanded ? 14 : 0 }}>
            <Pressable
              onPress={() => setOpen(expanded ? null : s.id)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 }}
            >
              <Text style={{ fontFamily: "PlayfairDisplay_500Medium", color: "#fff", fontSize: 16 }}>
                {s.title}
              </Text>
              <Feather name={expanded ? "minus" : "plus"} size={18} color={colors.goldSoft} />
            </Pressable>
            {expanded ? (
              s.id === "social" ? (
                <View style={{ flexDirection: "row", gap: 14, paddingTop: 4 }}>
                  {[
                    { icon: "facebook" as const, link: s.links[0] },
                    { icon: "instagram" as const, link: s.links[1] },
                    { icon: "music" as const, link: s.links[2] },
                    { icon: "linkedin" as const, link: s.links[3] },
                  ].map(({ icon, link }) => (
                    <Pressable
                      key={link.label}
                      onPress={() => onLink(link)}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.25)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Feather name={icon} size={16} color="#fff" />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={{ gap: 10, paddingTop: 4 }}>
                  {s.links.map((l) => (
                    <Pressable key={l.label} onPress={() => onLink(l)}>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.78)" }}>
                        {l.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )
            ) : null}
          </View>
        );
      })}

      {/* Currency / Language / Country */}
      <View style={{ gap: 14, marginTop: 8 }}>
        <View>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 1.6, color: colors.goldSoft, textTransform: "uppercase", marginBottom: 8 }}>
            {t.currency}
          </Text>
          <View style={{ alignSelf: "flex-start" }}>
            <Pressable
              onPress={() => setCurrencyOpen((v) => !v)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.25)",
                backgroundColor: "rgba(255,255,255,0.06)",
                minWidth: 150,
              }}
            >
              <Text style={{ fontSize: 16 }}>
                {CURRENCIES.find((c) => c.code === currencyCode)?.flag}
              </Text>
              {currencyCode === "AED" ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                  <DirhamSymbol size={13} color="#ffffff" />
                  <Text
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 12,
                      color: "#fff",
                      letterSpacing: 1,
                    }}
                  >
                    AED
                  </Text>
                </View>
              ) : (
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 12,
                    color: "#fff",
                    letterSpacing: 1,
                    flex: 1,
                  }}
                >
                  {currencyCode}
                </Text>
              )}
              <Feather
                name={currencyOpen ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.goldSoft}
              />
            </Pressable>

            {currencyOpen ? (
              <View
                style={{
                  marginTop: 8,
                  borderRadius: 12,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  paddingVertical: 6,
                  width: 180,
                  maxHeight: 320,
                }}
              >
                <ScrollView>
                  {CURRENCIES.map((c) => {
                    const active = c.code === currencyCode;
                    return (
                      <Pressable
                        key={c.code}
                        onPress={() => {
                          setCurrencyCode(c.code);
                          setCurrencyOpen(false);
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          backgroundColor: active ? "rgba(247,128,128,0.85)" : "transparent",
                        }}
                      >
                        <Text style={{ fontSize: 16 }}>{c.flag}</Text>
                        {c.code === "AED" ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <DirhamSymbol size={13} color="#ffffff" />
                            <Text
                              style={{
                                fontFamily: "Inter_600SemiBold",
                                fontSize: 12,
                                color: "#fff",
                                letterSpacing: 1,
                              }}
                            >
                              AED
                            </Text>
                          </View>
                        ) : (
                          <Text
                            style={{
                              fontFamily: "Inter_600SemiBold",
                              fontSize: 12,
                              color: "#fff",
                              letterSpacing: 1,
                            }}
                          >
                            {c.code}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
          </View>
        </View>

        <View>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 1.6, color: colors.goldSoft, textTransform: "uppercase", marginBottom: 8 }}>
            {t.language}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["EN", "AR", "FR"] as const).map((l) => {
              const active = l === language;
              const label = l === "EN" ? t.langEnglish : l === "AR" ? t.langArabic : t.langFrench;
              return (
                <Pressable
                  key={l}
                  onPress={() => setLanguage(l)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? colors.gold : "rgba(255,255,255,0.25)",
                    backgroundColor: active ? colors.gold : "transparent",
                  }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#fff", letterSpacing: 1 }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 1.6, color: colors.goldSoft, textTransform: "uppercase", marginBottom: 8 }}>
            {t.country}
          </Text>
          <View
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.25)",
            }}
          >
            <Text style={{ fontSize: 14 }}>{selectedCountry?.flag ?? "🇱🇧"}</Text>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#fff", letterSpacing: 1 }}>
              {selectedCountry?.name ?? t.countryLebanon}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.12)", marginTop: 8 }} />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 4 }}>
        <Pressable onPress={() => Linking.openURL(`${baseUrl}/terms-of-use`)}>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
            {t.termsOfUse}
          </Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(`${baseUrl}/privacy-policy`)}>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
            {t.privacyPolicy}
          </Text>
        </Pressable>
      </View>

      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 18 }}>
        All rights reserved © 2026 Presentail SAL{"\n"}
        {t.copyrightAddress}
      </Text>
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
