import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Dimensions,
  FlatList,
  Linking,
  Modal,
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
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 24 * 2 - 14) / 2;

function HomeHeader({ topPad }: { topPad: number }) {
  const colors = useColors();
  const router = useRouter();
  const { count, openCart } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);

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
        <Pressable hitSlop={10}>
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
          {[
            { label: "Flowers & Plants", path: "/(tabs)/catalog" },
            { label: "Gifts", path: "/(tabs)/catalog" },
            { label: "Occasions", path: "/(tabs)/catalog" },
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
          <View style={{ marginTop: 32, gap: 14 }}>
            <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
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
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : 24;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: bottomPad + 100 }}
      showsVerticalScrollIndicator={false}
    >
      <HomeHeader topPad={topPad} />

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

type FooterLink = { label: string; href?: string; action?: "contact" };

function Footer() {
  const colors = useColors();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>("popular");
  const { currencyCode, setCurrencyCode, list: CURRENCIES } = useCurrency();
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [language, setLanguage] = useState<"EN" | "AR">("EN");

  const sections: { id: string; title: string; links: FooterLink[] }[] = [
    {
      id: "social",
      title: "Social Media",
      links: [
        { label: "Facebook", href: "https://facebook.com/presentail" },
        { label: "Instagram", href: "https://instagram.com/presentail" },
        { label: "TikTok", href: "https://tiktok.com/@presentail" },
        { label: "LinkedIn", href: "https://linkedin.com/company/presentail" },
      ],
    },
    {
      id: "contact",
      title: "Get in Touch",
      links: [
        { label: "Contact Us", action: "contact" },
        { label: "FAQs", href: "https://presentail.com/lebanon/faqs" },
      ],
    },
    {
      id: "popular",
      title: "Popular Categories",
      links: [
        { label: "Flowers", href: "/category/hand-bouquets" },
        { label: "Plants", href: "/category/plants" },
        { label: "Gift Bundles", href: "/category/bundles" },
        { label: "Cakes & Sweets", href: "/category/cakes" },
        { label: "Baskets", href: "/category/baskets" },
        { label: "Bears & Balloons", href: "/category/stuffed-animals" },
        { label: "Occasions", href: "/(tabs)/catalog" },
      ],
    },
    {
      id: "know",
      title: "Get to Know Us",
      links: [
        { label: "About Us", href: "/(tabs)/brand" },
        { label: "Partner With Us", href: "https://presentail.com/lebanon/partner" },
        { label: "Delivery Rates", href: "https://presentail.com/lebanon/delivery-rates" },
        { label: "Weddings & Events", href: "https://presentail.com/lebanon/weddings-events" },
        { label: "Corporate Gifts", href: "https://presentail.com/lebanon/corporate-gifts" },
        { label: "Careers", href: "https://presentail.com/lebanon/careers" },
        { label: "Blogs", href: "https://presentail.com/lebanon/blog" },
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
            Currency
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
            Language
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
            Country
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
