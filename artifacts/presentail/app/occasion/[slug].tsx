import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductCard } from "@/components/ProductCard";
import { useCart } from "@/contexts/CartContext";
import { useWooProducts } from "@/contexts/WooProductsContext";
import { getOccasion, occasions } from "@/data/catalog";
import { useColors } from "@/hooks/useColors";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import { fetchOccasionProducts, fetchBrandProducts, type OccasionGroup, type WooProduct } from "@/lib/woo";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = Math.min(160, (SCREEN_W - 48) / 2.3);

function OccasionScreen() {
  const { slug, brand: brandParam, brandName: brandNameParam } = useLocalSearchParams<{
    slug: string;
    brand?: string;
    brandName?: string;
  }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { count } = useCart();
  const occasion = getOccasion(String(slug));

  const activeBrandSlug = Array.isArray(brandParam) ? brandParam[0] : (brandParam ?? "");
  const activeBrandName = Array.isArray(brandNameParam) ? brandNameParam[0] : (brandNameParam ?? "");

  const [groups, setGroups] = useState<OccasionGroup[]>([]);
  const [brandProducts, setBrandProducts] = useState<WooProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const countryCode = selectedCountry?.code ?? null;
  const cityId = selectedCity?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setGroups([]);
    setBrandProducts([]);
    if (activeBrandSlug) {
      fetchBrandProducts(activeBrandSlug, { countryCode, cityId }).then((res) => {
        if (!cancelled) {
          const occSlug = String(slug);
          const filtered = res.products.filter(
            (p) => p.image && p.occasions.includes(occSlug),
          );
          setBrandProducts(filtered);
          setLoading(false);
        }
      });
    } else {
      fetchOccasionProducts(String(slug), { countryCode, cityId }).then((g) => {
        if (!cancelled) {
          setGroups(g.filter((gr) => gr.products.length > 0));
          setLoading(false);
        }
      });
    }
    return () => { cancelled = true; };
  }, [slug, countryCode, cityId, activeBrandSlug]);

  const { products: wooCatalog } = useWooProducts();
  const popularPicks = useMemo(() => {
    const pool = wooCatalog.filter((p) => p.image);
    return [...pool]
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, 6);
  }, [wooCatalog]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={{ height: 260, backgroundColor: colors.background }}>
          {occasion ? (
            <Image source={occasion.image} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <LinearGradient
            colors={["rgba(0,65,78,0.2)", "rgba(0,65,78,0.88)"]}
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
            <Pressable onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}>
              <Feather name="arrow-left" size={20} color={colors.primary} />
            </Pressable>
            <Pressable onPress={() => router.push("/cart")} style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}>
              <Feather name="shopping-bag" size={18} color={colors.primary} />
              {count > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.gold }]}>
                  <Text style={styles.badgeText}>{count}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
          <View style={{ position: "absolute", bottom: 22, left: 24, right: 24 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.goldSoft, letterSpacing: 3, textTransform: "uppercase" }}>
              {activeBrandName
                ? t.occasionFromBrand.replace("{brand}", activeBrandName)
                : t.occasionForTheOccasion}
            </Text>
            <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 30, color: "#fff", marginTop: 6 }}>
              {occasion?.name ?? t.occasionFallback}
            </Text>
            {!activeBrandName && occasion?.description ? (
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.82)", marginTop: 6, lineHeight: 19 }}>
                {occasion.description}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Occasion pills — hidden when scoped to a brand to keep navigation consistent */}
        {!activeBrandSlug && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingTop: 18, paddingBottom: 4 }}
          >
            {occasions.map((o) => {
              const active = o.id === slug;
              return (
                <Pressable
                  key={o.id}
                  onPress={() => router.replace({ pathname: "/occasion/[slug]", params: { slug: o.id } })}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary : "#fff",
                  }}
                >
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: active ? "#fff" : colors.primary }}>
                    {o.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Brand-scoped product grid */}
        {activeBrandSlug ? (
          loading ? (
            <View style={{ paddingTop: 60, alignItems: "center", gap: 12 }}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>
                {t.occasionFindingGifts}
              </Text>
            </View>
          ) : brandProducts.length === 0 ? (
            <View style={{ paddingHorizontal: 24, paddingTop: 40, alignItems: "center", gap: 10 }}>
              <Feather name="inbox" size={28} color={colors.mutedForeground} />
              <Text style={{ fontFamily: "PlayfairDisplay_400Regular", color: colors.primary, fontSize: 20, textAlign: "center" }}>
                {t.occasionSoldOutTitle}
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13, textAlign: "center", lineHeight: 19 }}>
                {t.occasionSoldOutDesc}
              </Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 24, paddingTop: 20, flexDirection: "row", flexWrap: "wrap", gap: 14, rowGap: 26 }}>
              {brandProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p as any}
                  width={CARD_W}
                  onPress={() => router.push({ pathname: "/product/[slug]", params: { slug: p.id } })}
                />
              ))}
            </View>
          )
        ) : null}

        {/* Category sections (non-brand view) */}
        {!activeBrandSlug && (loading ? (
          <View style={{ paddingTop: 60, alignItems: "center", gap: 12 }}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>
              {t.occasionFindingGifts}
            </Text>
          </View>
        ) : groups.length === 0 ? (
          <View>
            <View style={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 8, alignItems: "center", gap: 10 }}>
              <Feather name="inbox" size={28} color={colors.mutedForeground} />
              <Text style={{ fontFamily: "PlayfairDisplay_400Regular", color: colors.primary, fontSize: 20, textAlign: "center" }}>
                {t.occasionSoldOutTitle}
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13, textAlign: "center", lineHeight: 19 }}>
                {t.occasionSoldOutDesc}
              </Text>
            </View>
            {popularPicks.length > 0 ? (
              <View style={{ marginTop: 18 }}>
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 11,
                    color: colors.gold,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    paddingHorizontal: 24,
                    marginBottom: 14,
                    textAlign: "center",
                  }}
                >
                  {t.popularPicksLabel}
                </Text>
                <View
                  style={{
                    paddingHorizontal: 24,
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 14,
                    rowGap: 26,
                    justifyContent: "center",
                  }}
                >
                  {popularPicks.map((p) => (
                    <ProductCard key={p.id} product={p} width={CARD_W} />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ marginTop: 10 }}>
            {groups.map((group) => (
              <CategorySection
                key={group.slug}
                group={group}
                colors={colors}
                t={t}
                onProduct={(id) => router.push({ pathname: "/product/[slug]", params: { slug: id } })}
                onSeeAll={() => router.push({ pathname: "/category/[slug]", params: { slug: group.slug } })}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function CategorySection({
  group,
  colors,
  t,
  onProduct,
  onSeeAll,
}: {
  group: OccasionGroup;
  colors: any;
  t: any;
  onProduct: (id: string) => void;
  onSeeAll: () => void;
}) {
  return (
    <View style={{ marginTop: 28 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 24,
          marginBottom: 14,
        }}
      >
        <View>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: 18,
              color: colors.primary,
            }}
          >
            {group.label}
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
            {group.count} {group.count !== 1 ? t.occasionItems : t.occasionItem}
          </Text>
        </View>
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 12,
              color: colors.primary,
              textDecorationLine: "underline",
            }}
          >
            {t.seeAll}
          </Text>
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={group.products}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
        renderItem={({ item }) => (
          <ProductCard
            product={item as any}
            width={CARD_W}
            onPress={() => onProduct(item.id)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 999, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 10 },
});

export default withRouteErrorBoundary(OccasionScreen, "occasion/[slug]");
