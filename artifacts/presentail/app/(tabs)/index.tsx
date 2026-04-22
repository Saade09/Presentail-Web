import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
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
import { ProductCard } from "@/components/ProductCard";
import { useCart } from "@/contexts/CartContext";
import {
  bestSellers,
  brands,
  categories,
  collections,
  occasions,
  reviews,
} from "@/data/catalog";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 24 * 2 - 14) / 2;

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { count } = useCart();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : 24;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: bottomPad + 100 }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.background }]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather name="map-pin" size={14} color={colors.gold} />
          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 11,
              color: colors.mutedForeground,
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            Lebanon · Same-day delivery
          </Text>
        </View>
        <Wordmark size={26} />
        <View style={{ flexDirection: "row", gap: 14 }}>
          <Pressable hitSlop={10} onPress={() => router.push("/(tabs)/catalog" as any)}>
            <Feather name="search" size={20} color={colors.primary} />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => router.push("/cart" as any)}>
            <Feather name="shopping-bag" size={20} color={colors.primary} />
            {count > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: -4,
                  right: -8,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 999,
                  backgroundColor: colors.gold,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 9 }}>
                  {count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <Hero />
      <BrandStrip />
      <BestSellers />
      <CategoryRail />
      <CollectionsSection />
      <OccasionsGrid />
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
              }}
            >
              The Modern Flower Atelier
            </Text>
            <Text
              style={{
                fontFamily: "PlayfairDisplay_400Regular",
                fontSize: 40,
                lineHeight: 46,
                color: "#ffffff",
                marginTop: 14,
                letterSpacing: 0.2,
              }}
            >
              Send a feeling,{"\n"}wrapped in petals.
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 14,
                lineHeight: 22,
                color: "rgba(255,255,255,0.85)",
                marginTop: 14,
                maxWidth: 320,
              }}
            >
              Hand-arranged in Beirut. Delivered the same day across Lebanon, with
              quiet care for every occasion.
            </Text>
            <View
              style={[
                styles.heroCta,
                { backgroundColor: colors.gold },
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
                Shop the Collection
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
  const items = [
    { icon: "truck-fast" as const, label: "Same-day", sub: "across Lebanon" },
    { icon: "flower" as const, label: "Hand-tied", sub: "by florists" },
    { icon: "shield-check" as const, label: "Guaranteed", sub: "or remade free" },
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
      {items.map((it) => (
        <View key={it.label} style={{ flex: 1, alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name={it.icon} size={20} color={colors.primary} />
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.primary }}>
            {it.label}
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>
            {it.sub}
          </Text>
        </View>
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

function CategoryRail() {
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={{ marginTop: 44 }}>
      <View style={{ paddingHorizontal: 24, marginBottom: 18 }}>
        <SectionTitle eyebrow="Browse" title="Categories" />
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
              {c.name}
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

function OccasionsGrid() {
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={{ marginTop: 44, paddingHorizontal: 24 }}>
      <View style={{ marginBottom: 18 }}>
        <SectionTitle
          eyebrow="Occasions"
          title="A gift for every moment"
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {occasions.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => router.push(`/occasion/${o.id}` as any)}
            style={({ pressed }) => ({
              flexBasis: "48%",
              flexGrow: 1,
              backgroundColor: "#fff",
              borderRadius: 18,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Image
              source={o.image}
              style={{ width: 48, height: 48, borderRadius: 999, backgroundColor: colors.muted }}
              contentFit="cover"
            />
            <Text
              style={{
                flex: 1,
                fontFamily: "Inter_500Medium",
                fontSize: 13,
                color: colors.primary,
              }}
            >
              {o.name}
            </Text>
            <Feather name="arrow-up-right" size={16} color={colors.gold} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function BrandStorySection() {
  const colors = useColors();
  const pillars = [
    { title: "Hand-tied in Beirut", text: "Every bouquet is composed by a florist — never machine packed." },
    { title: "Sourced with intention", text: "From Holland's tulip fields to Lebanon's mountain roses." },
    { title: "Delivered with care", text: "Climate-controlled vans and a no-compromise freshness promise." },
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
        eyebrow="Our Story"
        title="The modern flower delivery house of Lebanon."
        description="Founded in Beirut, Presentail brings together florists, pâtissiers and artisans under one quiet, dependable promise: a beautiful gift, delivered exactly when it matters."
        inverse
      />
      <View style={{ marginTop: 28, gap: 18 }}>
        {pillars.map((p, i) => (
          <View key={p.title} style={{ flexDirection: "row", gap: 16 }}>
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
  return (
    <View style={{ marginTop: 56, paddingHorizontal: 24 }}>
      <SectionTitle
        eyebrow="Gift by Brand"
        title="Houses we work with"
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
          <View
            key={b}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: "#fff",
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: colors.primary,
                letterSpacing: 0.6,
              }}
            >
              {b}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Footer() {
  const colors = useColors();
  return (
    <View
      style={{
        marginTop: 56,
        backgroundColor: colors.primary,
        paddingHorizontal: 28,
        paddingTop: 36,
        paddingBottom: 36,
        gap: 22,
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
      <View style={{ flexDirection: "row", gap: 18 }}>
        <Feather name="instagram" size={18} color="#fff" />
        <Feather name="facebook" size={18} color="#fff" />
        <MaterialCommunityIcons name="whatsapp" size={18} color="#fff" />
        <Feather name="mail" size={18} color="#fff" />
      </View>
      <View
        style={{
          height: 1,
          backgroundColor: "rgba(255,255,255,0.15)",
        }}
      />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
          © 2026 Presentail SAL
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
            🇱🇧
          </Text>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
            Lebanon · USD
          </Text>
        </View>
      </View>
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
