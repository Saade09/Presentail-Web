import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SectionTitle, Wordmark } from "@/components/Brand";
import { DirhamSymbol } from "@/components/DirhamSymbol";
import { ProductCard } from "@/components/ProductCard";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
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

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 24 * 2 - 14) / 2;

function HomeHeader({ topPad }: { topPad: number }) {
  const colors = useColors();
  const router = useRouter();
  const { count, openCart } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);

  function openAccount() {
    router.push("/(tabs)/account" as any);
  }

  async function shareApp() {
    try {
      await Share.share({
        title: "Presentail Lebanon",
        message:
          "Discover Presentail — Lebanon's luxury flower & gift delivery. Same-day delivery across Lebanon. 🌸\nhttps://presentail.com/lebanon",
        url: "https://presentail.com/lebanon",
      });
    } catch {}
  }

  return (
    <View
      style={{
        backgroundColor: "#fff",
        paddingTop: topPad,
        paddingHorizontal: 18,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(0,0,0,0.07)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
        <Pressable hitSlop={10} onPress={() => setMenuOpen(true)}>
          <Feather name="menu" size={22} color={colors.primary} />
        </Pressable>
        <Pressable hitSlop={10} onPress={() => router.push("/(tabs)/catalog" as any)}>
          <Feather name="search" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <Wordmark size={26} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
        <Pressable hitSlop={10} onPress={openAccount}>
          <Feather name="user" size={20} color={colors.primary} />
        </Pressable>
        <Pressable hitSlop={10} onPress={openCart}>
          <Feather name="shopping-bag" size={20} color={colors.primary} />
          {count > 0 ? (
            <View
              style={{
                position: "absolute",
                top: -5,
                right: -8,
                minWidth: 17,
                height: 17,
                borderRadius: 999,
                backgroundColor: "#E5302E",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 3,
              }}
            >
              <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 9 }}>
                {count}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={() => setMenuOpen(false)} />
        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "78%", backgroundColor: "#fff", paddingTop: topPad + 16, paddingHorizontal: 24, paddingBottom: 40, gap: 0 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
            <Wordmark size={26} />
            <Pressable onPress={() => setMenuOpen(false)} hitSlop={12}>
              <Feather name="x" size={22} color={colors.primary} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => { setMenuOpen(false); openAccount(); }}
            style={{
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: "rgba(0,0,0,0.07)",
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Feather name="user" size={16} color={colors.primary} />
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.primary }}>
              {hasAccount ? "My Account" : "Login"}
            </Text>
          </Pressable>
          {[
            { label: "Flowers & Plants", path: "/category/hand-bouquets" },
            { label: "Gifts", path: "/category/baskets" },
            { label: "Occasions", path: "/occasions" },
            { label: "Brands", path: "/(tabs)/catalog" },
            { label: "About Us", path: "/(tabs)/brand" },
          ].map((m) => (
            <Pressable
              key={m.label}
              onPress={() => { setMenuOpen(false); router.push(m.path as any); }}
              style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.07)" }}
            >
              <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 18, color: colors.primary }}>
                {m.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => { setMenuOpen(false); shareApp(); }}
            style={{
              marginTop: 8,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: "rgba(0,0,0,0.07)",
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Feather name="share-2" size={16} color={colors.gold} />
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.primary }}>
              Share Presentail
            </Text>
          </Pressable>

          <View style={{ marginTop: 24, gap: 14 }}>
            <Pressable
              onPress={() => Linking.openURL("tel:+9613136532")}
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Feather name="phone" size={16} color={colors.gold} />
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.primary }}>
                +961 3 136 532
              </Text>
            </Pressable>
            <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Feather name="map-pin" size={16} color={colors.gold} />
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.primary }}>
                Achrafieh, Beirut
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: colors.background }, isRTL ? ({ direction: "rtl" } as any) : null]}
      contentContainerStyle={{ paddingBottom: bottomPad + 100 }}
      showsVerticalScrollIndicator={false}
    >
      <HomeHeader topPad={topPad} />

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
  );
}

function Hero() {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { isRTL } = useLanguage();
  const ta = isRTL ? "right" : "left";
  return (
    <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
      <Pressable
        onPress={() => router.push("/category/lux-arrangements" as any)}
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
            eyebrow="Best Sellers"
            title="The pieces Lebanon loves"
            description="A rotating shortlist chosen by our atelier — the bouquets and gifts that arrive most often at the front door."
          />
        </View>
        <Pressable onPress={() => router.push("/(tabs)/catalog" as any)}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.gold, letterSpacing: 1 }}>
            VIEW ALL
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
        {bestSellers.map((p) => (
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
            eyebrow="Flowers"
            title="Fresh from our atelier"
            description="Hand-tied bouquets, artisan boxes, and statement arrangements crafted daily in Beirut."
          />
        </View>
        <Pressable onPress={() => router.push("/category/hand-bouquets" as any)}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.gold, letterSpacing: 1 }}>
            VIEW ALL
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
            eyebrow="Gift Bundles"
            title="More than flowers"
            description="Curated sets pairing our finest blooms with sweets, wines and keepsakes."
          />
        </View>
        <Pressable onPress={() => router.push("/category/bundles" as any)}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.gold, letterSpacing: 1 }}>
            VIEW ALL
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
  const CAT_KEYS: Record<string, string> = {
    "hand-bouquets": "cat_hand_bouquets", "flower-boxes": "cat_flower_boxes",
    "flower-vases": "cat_flower_vases", "lux-arrangements": "cat_lux_arrangements",
    "dried-flowers": "cat_dried_flowers", "preserved-flowers": "cat_preserved_flowers",
    plants: "cat_plants", balloons: "cat_balloons", "board-games": "cat_board_games",
    cakes: "cat_cakes", chocolate: "cat_chocolate", "arabic-sweets": "cat_arabic_sweets",
    electronics: "cat_electronics", "stuffed-animals": "cat_stuffed_animals",
    bundles: "cat_bundles", baskets: "cat_baskets", beauty: "cat_beauty",
  };
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
        {categories.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => router.push(`/category/${c.id}` as any)}
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
        {collections.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => c.category && router.push(`/category/${c.category}` as any)}
            style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
          >
            <View
              style={{
                width: SCREEN_W * 0.78,
                borderRadius: 22,
                overflow: "hidden",
                backgroundColor: colors.muted,
                height: 380,
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
  return (
    <View style={{ marginTop: 44, paddingHorizontal: 24 }}>
      <View style={{ marginBottom: 18 }}>
        <SectionTitle eyebrow={t.occasionsEyebrow} title={t.occasionsTitle} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {occasions.map((o) => {
          const nameKey = OCC_NAME_KEYS[o.id] as keyof typeof t;
          const displayName = nameKey ? (t[nameKey] as string) : o.name;
          return (
            <Pressable
              key={o.id}
              onPress={() => router.push(`/occasion/${o.id}` as any)}
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
  return (
    <View style={{ marginTop: 56, paddingHorizontal: 24 }}>
      <SectionTitle
        eyebrow="Gift by Brand"
        title="Brands"
      />
      <View
        style={{
          marginTop: 18,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        {brands.map((b) => (
          <Pressable
            key={b.slug}
            onPress={() => router.push(`/brand/${b.slug}` as any)}
            style={{
              width: "18.5%",
              aspectRatio: 1,
              minWidth: 62,
              backgroundColor: colors.primary,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              padding: 8,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: b.name.length > 8 ? 7 : 9,
                color: "#fff",
                textAlign: "center",
                letterSpacing: 0.2,
                lineHeight: 13,
              }}
            >
              {b.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

type FooterLink = { label: string; href?: string; action?: "contact" };

function Footer() {
  const colors = useColors();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>("popular");
  const { currencyCode, setCurrencyCode, list: CURRENCIES } = useCurrency();
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const { lang: language, setLang: setLanguage } = useLanguage();
  const t = useT();

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
        { label: t.aboutUs, href: "/(tabs)/brand" },
        { label: t.partnerWithUs, href: "https://presentail.com/lebanon/partner" },
        { label: t.deliveryRates, href: "https://presentail.com/lebanon/delivery-rates" },
        { label: t.weddingsEvents, href: "https://presentail.com/lebanon/weddings-events" },
        { label: t.corporateGifts, href: "https://presentail.com/lebanon/corporate-gifts" },
        { label: t.careers, href: "https://presentail.com/lebanon/careers" },
        { label: t.blogs, href: "https://presentail.com/lebanon/blog" },
      ],
    },
  ];

  const onLink = (l: FooterLink) => {
    if (l.action === "contact") {
      Linking.openURL("mailto:hello@presentail.com");
      return;
    }
    if (!l.href) return;
    if (l.href.startsWith("http")) {
      Linking.openURL(l.href);
    } else {
      router.push(l.href as any);
    }
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
      <Wordmark size={28} color="#ffffff" />
      <Text
        style={{
          fontFamily: "Inter_400Regular",
          fontSize: 13,
          lineHeight: 22,
          color: "rgba(255,255,255,0.78)",
          maxWidth: 320,
        }}
      >
        Presentail is the online gift ordering and delivery platform of Lebanon.
        Send love one gift at a time, anywhere across the country.
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
            {(["EN", "AR"] as const).map((l) => {
              const active = l === language;
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
                    {l === "EN" ? "English" : "العربية"}
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
            <Text style={{ fontSize: 14 }}>🇱🇧</Text>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#fff", letterSpacing: 1 }}>
              Lebanon
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
        <Pressable onPress={() => Linking.openURL("https://presentail.com/lebanon/terms-of-use")}>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
            Terms of Use
          </Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL("https://presentail.com/lebanon/privacy-policy")}>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
            Privacy Policy
          </Text>
        </Pressable>
      </View>

      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 18 }}>
        All rights reserved © 2026 Presentail SAL{"\n"}
        3rd Floor, Karam w Mwannes, Abdel Wahab El Inglizi St, Achrafieh, Beirut, Lebanon
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
