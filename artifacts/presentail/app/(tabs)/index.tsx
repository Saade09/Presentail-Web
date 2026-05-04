import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, type Href } from "expo-router";
import React, { useEffect, useState } from "react";
import {
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
  categories,
  collections,
  occasions,
  reviews,
} from "@/data/catalog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { useWooProducts } from "@/contexts/WooProductsContext";
import { fetchWcBrands, type WcBrand } from "@/lib/woo";
import { useAuth } from "@/contexts/AuthContext";
import {
  getNativePermissionStatus,
  getNotificationStatus,
  registerPushToken,
  requestPermission,
  saveNotificationStatus,
} from "@/services/notifications";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 24 * 2 - 14) / 2;

function HomeHeader({
  topPad,
  onOpenDelivery,
  onOpenMenu,
}: {
  topPad: number;
  onOpenDelivery: () => void;
  onOpenMenu: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { isRTL, lang, setLang } = useLanguage();
  const { selectedCountry } = useDeliveryLocation();
  const { token: authToken } = useAuth();

  const countryName = selectedCountry?.name ?? "Lebanon";
  const countryFlag = selectedCountry?.flag ?? "🇱🇧";
  const utilityBg = "#f1f1f1";
  const pillBg = "#e6e6e6";

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

  return (
    <View style={{ backgroundColor: "#fff", paddingTop: topPad }}>
      {/* Slim utility bar */}
      <View
        style={{
          backgroundColor: utilityBg,
          flexDirection: sideRowDir,
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 14,
          paddingVertical: 10,
          minHeight: 48,
          gap: 8,
        }}
      >
        <View
          style={{
            flexDirection: sideRowDir,
            alignItems: "center",
            gap: 6,
            flexShrink: 1,
          }}
        >
          <Feather name="map-pin" size={13} color={colors.primary} />
          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 12,
              color: colors.primary,
            }}
            numberOfLines={1}
          >
            {t.noHassleDetails}
          </Text>
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
              backgroundColor: pillBg,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 13 }}>{countryFlag}</Text>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: colors.primary,
                maxWidth: 80,
              }}
              numberOfLines={1}
            >
              {countryName}
            </Text>
            <Feather name="chevron-down" size={13} color={colors.primary} />
          </Pressable>

          <Pressable
            hitSlop={6}
            onPress={toggleLanguage}
            accessibilityLabel={t.languageLabel}
            style={({ pressed }) => ({
              backgroundColor: pillBg,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: colors.primary,
              }}
              numberOfLines={1}
            >
              {languagePillLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Main header row */}
      <View
        style={{
          height: 96,
          flexDirection: sideRowDir,
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 18,
        }}
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
            <Feather name="menu" size={28} color={colors.primary} />
          </Pressable>
          <Pressable
            hitSlop={10}
            onPress={() => router.push("/(tabs)/catalog")}
            accessibilityLabel="Search"
          >
            <Feather name="search" size={26} color={colors.primary} />
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
          <Wordmark size={28} />
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
            <Feather name="user" size={26} color={colors.primary} />
          </Pressable>
          <Pressable
            hitSlop={10}
            onPress={() => router.push("/(tabs)/cart")}
            accessibilityLabel="Cart"
          >
            <MaterialCommunityIcons
              name="shopping-outline"
              size={28}
              color={colors.primary}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isRTL } = useLanguage();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : 24;
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [deliverySheetOpen, setDeliverySheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { token: authToken, user } = useAuth();

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
      // If the user previously granted at the OS level, make sure the
      // server still has our current Expo push token (it can rotate).
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
        <HomeHeader
          topPad={topPad}
          onOpenDelivery={() => setDeliverySheetOpen(true)}
          onOpenMenu={() => setMenuOpen(true)}
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: bottomPad + 100 }}
          showsVerticalScrollIndicator={false}
        >
          <Hero />
          <BrandStrip />
          <BestSellers />
          <FlowersSection />
          <CategoryRail />
          <OccasionsGrid />
          <BundlesSection />
          <CollectionsSection />
          <BrandStorySection />
          <ReviewsSection />
          <BrandsRow />
          <Footer />
        </ScrollView>
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
  return (
    <View style={{ paddingHorizontal: 24, marginTop: 0 }}>
      <Pressable
        onPress={() => router.push("/category/lux-arrangements")}
        style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}
      >
        <View
          style={{
            borderRadius: 28,
            overflow: "hidden",
            backgroundColor: colors.primary,
            height: 460,
          }}
        >
          <Image
            source={require("@/assets/images/hero-flowers.png")}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <LinearGradient
            colors={["rgba(0,65,78,0.05)", "rgba(0,65,78,0.85)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroContent}>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 11,
                color: colors.goldSoft,
                letterSpacing: 3.5,
                textTransform: "uppercase",
                textAlign: ta,
              }}
            >
              {t.heroEyebrow}
            </Text>
            <Text
              style={{
                fontFamily: "PlayfairDisplay_400Regular",
                fontSize: 40,
                lineHeight: 46,
                color: "#ffffff",
                marginTop: 14,
                letterSpacing: 0.2,
                textAlign: ta,
              }}
            >
              {t.heroTitle}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 14,
                lineHeight: 22,
                color: "rgba(255,255,255,0.85)",
                marginTop: 14,
                maxWidth: 320,
                textAlign: ta,
              }}
            >
              {t.heroSubtitle}
            </Text>
            <View
              style={[
                styles.heroCta,
                { backgroundColor: colors.gold, flexDirection: isRTL ? "row-reverse" : "row" },
              ]}
            >
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                  color: colors.primary,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                }}
              >
                {t.heroCta}
              </Text>
              <Feather name="arrow-up-right" size={16} color={colors.primary} />
            </View>
          </View>
        </View>
      </Pressable>
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
  const { selectedCountry } = useDeliveryLocation();
  const { products: wooProducts } = useWooProducts();
  const countryName = selectedCountry?.name ?? "Lebanon";

  const displayProducts = wooProducts.length > 0
    ? wooProducts.slice(0, 4)
    : bestSellers;

  if (displayProducts.length === 0) return null;

  const title = t.bestSellersTitleHome.replace("{country}", countryName);
  const description = t.bestSellersDescHome;

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
  const { products: wooProducts } = useWooProducts();
  const flowerProducts = wooProducts.filter((p) => FLOWER_CATS.has(p.category)).slice(0, 10);

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
            description={t.flowersDescHome}
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

function BundlesSection() {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { products: wooProducts } = useWooProducts();
  const bundleProducts = wooProducts.filter((p) => p.category === "bundles").slice(0, 6);

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
            description={t.bundlesDescHome}
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
  const { isRTL } = useLanguage();
  const { products: wooProducts } = useWooProducts();
  const CAT_KEYS: Record<string, string> = {
    "hand-bouquets": "cat_hand_bouquets", "flower-boxes": "cat_flower_boxes",
    "flower-vases": "cat_flower_vases", "lux-arrangements": "cat_lux_arrangements",
    "dried-flowers": "cat_dried_flowers", "preserved-flowers": "cat_preserved_flowers",
    plants: "cat_plants", balloons: "cat_balloons", "board-games": "cat_board_games",
    cakes: "cat_cakes", chocolate: "cat_chocolate", "arabic-sweets": "cat_arabic_sweets",
    electronics: "cat_electronics", "stuffed-animals": "cat_stuffed_animals",
    bundles: "cat_bundles", baskets: "cat_baskets", beauty: "cat_beauty",
  };

  const populatedSlugs = new Set(wooProducts.map((p) => p.category));
  const visibleCategories = categories.filter((c) => populatedSlugs.has(c.id));

  if (visibleCategories.length === 0) return null;

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
        {visibleCategories.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => router.push({ pathname: "/category/[slug]", params: { slug: c.id } })}
            style={{ alignItems: "center", gap: 10, width: 88 }}
          >
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 999,
                overflow: "hidden",
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Image source={c.image} style={{ width: "100%", height: "100%" }} contentFit="cover" />
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
              {CAT_KEYS[c.id] ? (t[CAT_KEYS[c.id] as keyof typeof t] as string) : c.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function CollectionsSection() {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { products: wooProducts } = useWooProducts();

  const populatedSlugs = new Set(wooProducts.map((p) => p.category));
  const visibleCollections = collections.filter((c) => !c.category || populatedSlugs.has(c.category));

  if (visibleCollections.length === 0) return null;

  return (
    <View style={{ marginTop: 44 }}>
      <View style={{ paddingHorizontal: 24, marginBottom: 18 }}>
        <SectionTitle
          eyebrow="Collections"
          title="Curated for the season"
          description="Limited drops, designed by our atelier and changed with the calendar."
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SCREEN_W * 0.78 + 14}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 24, gap: 14 }}
      >
        {visibleCollections.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => c.category && router.push({ pathname: "/category/[slug]", params: { slug: c.category } })}
            style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
          >
            <View
              style={{
                width: SCREEN_W * 0.78,
                borderRadius: 22,
                overflow: "hidden",
                backgroundColor: colors.muted,
                aspectRatio: 1,
              }}
            >
              <Image
                source={c.image}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
              <LinearGradient
                colors={["transparent", "rgba(0,65,78,0.75)"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={{ flex: 1, justifyContent: "flex-end", padding: 22 }}>
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 10,
                    color: colors.goldSoft,
                    letterSpacing: 2.5,
                    textTransform: "uppercase",
                  }}
                >
                  {c.count}
                </Text>
                <Text
                  style={{
                    fontFamily: "PlayfairDisplay_500Medium",
                    fontSize: 24,
                    color: "#fff",
                    marginTop: 6,
                  }}
                >
                  {c.title}
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 13,
                    color: "rgba(255,255,255,0.85)",
                    marginTop: 6,
                    lineHeight: 20,
                  }}
                >
                  {c.subtitle}
                </Text>
                <View
                  style={{
                    marginTop: 14,
                    alignSelf: "flex-start",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: "rgba(255,255,255,0.18)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.3)",
                  }}
                >
                  <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase" }}>
                    Shop
                  </Text>
                  <Feather name="arrow-up-right" size={14} color="#fff" />
                </View>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const OCC_NAME_KEYS: Record<string, string> = {
  housewarming: "occ_housewarming", birthday: "occ_birthday", "new-job": "occ_new_job",
  promotion: "occ_promotion", "thank-you": "occ_thank_you", "love-romance": "occ_love_romance",
  farewell: "occ_farewell", condolences: "occ_condolences",
  anniversary: "occ_anniversary", wedding: "occ_wedding", graduation: "occ_graduation",
  "get-well-soon": "occ_get_well_soon", newborn: "occ_newborn", eid: "occ_eid",
  congratulations: "occ_congratulations", "thinking-of-you": "occ_thinking_of_you",
};

function OccasionsGrid() {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { isRTL } = useLanguage();
  const { products: wooProducts } = useWooProducts();

  const populatedOccasions = new Set(wooProducts.flatMap((p) => p.occasions ?? []));
  const visibleOccasions = occasions.filter((o) => populatedOccasions.has(o.id));

  if (visibleOccasions.length === 0) return null;

  return (
    <View style={{ marginTop: 44, paddingHorizontal: 24 }}>
      <View style={{ marginBottom: 18 }}>
        <SectionTitle eyebrow={t.occasionsEyebrow} title={t.occasionsTitle} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {visibleOccasions.map((o) => {
          const nameKey = OCC_NAME_KEYS[o.id] as keyof typeof t;
          const displayName = nameKey ? (t[nameKey] as string) : o.name;
          return (
            <Pressable
              key={o.id}
              onPress={() => router.push({ pathname: "/occasion/[slug]", params: { slug: o.id } })}
              style={({ pressed }) => ({
                flexBasis: "48%",
                flexGrow: 1,
                height: 76,
                backgroundColor: "#fff",
                borderRadius: 18,
                paddingHorizontal: 14,
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 12,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Image
                source={o.image}
                style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: colors.muted, flexShrink: 0 }}
                contentFit="cover"
              />
              <Text
                numberOfLines={2}
                style={{
                  flex: 1,
                  fontFamily: "Inter_500Medium",
                  fontSize: 13,
                  lineHeight: 18,
                  color: colors.primary,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {displayName}
              </Text>
              <Feather name="arrow-up-right" size={16} color={colors.gold} style={{ flexShrink: 0 }} />
            </Pressable>
          );
        })}
      </View>
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
    : brands.map((b) => ({ id: b.slug, name: b.name, slug: b.slug, count: 1, image: null }));

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

      {/* Payment methods */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <PayIcon>
          <View style={{ flexDirection: "row" }}>
            <View style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: "#EB001B" }} />
            <View style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: "#F79E1B", marginLeft: -6 }} />
          </View>
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: "#444", letterSpacing: 0.3, marginLeft: 4 }}>MC</Text>
        </PayIcon>
        <PayIcon>
          <Text style={{ fontFamily: "Inter_700Bold", fontStyle: "italic", fontSize: 13, color: "#1A1F71" }}>VISA</Text>
        </PayIcon>
        <PayIcon>
          <MaterialCommunityIcons name="google" size={11} color="#4285F4" />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#3c4043", marginLeft: 2 }}>Pay</Text>
        </PayIcon>
        <PayIcon>
          <MaterialCommunityIcons name="apple" size={13} color="#000" />
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#000", marginLeft: 2 }}>Pay</Text>
        </PayIcon>
        <PayIcon>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#006FCF", letterSpacing: 0.5 }}>AMEX</Text>
        </PayIcon>
        <PayIcon>
          <Text style={{ fontFamily: "Inter_700Bold", fontStyle: "italic", fontSize: 10, color: "#E5302E" }}>whish</Text>
        </PayIcon>
      </View>

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

function PayIcon({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", opacity: 0.85 }}>
      {children}
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
  },
  heroCta: {
    marginTop: 24,
    alignSelf: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
