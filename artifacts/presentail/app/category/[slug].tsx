import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
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
import {
  categories,
  getCategory,
} from "@/data/catalog";
import { useColors } from "@/hooks/useColors";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import { fetchCategoryProducts } from "@/lib/woo";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 24 * 2 - 14) / 2;

type SortKey = "featured" | "priceUp" | "priceDown" | "name";

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { count } = useCart();
  const [sort, setSort] = useState<SortKey>("featured");
  const SORTS: { key: SortKey; label: string }[] = [
    { key: "featured", label: t.sortFeatured },
    { key: "priceUp", label: t.sortPriceUp },
    { key: "priceDown", label: t.sortPriceDown },
    { key: "name", label: t.sortName },
  ];
  const [wcProducts, setWcProducts] = useState<any[]>([]);
  const [wcCategoryName, setWcCategoryName] = useState<string>("");
  const [wcLoading, setWcLoading] = useState(false);

  const { products: allProducts, loading: catalogLoading } = useWooProducts();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const countryCode = selectedCountry?.code ?? null;
  const cityId = selectedCity?.id ?? null;
  const category = getCategory(String(slug));
  const mergedProducts = useMemo(
    () => allProducts.filter((p) => p.category === String(slug)),
    [slug, allProducts]
  );

  // When catalog is done loading and has no products for this slug,
  // fall back to fetching directly from WooCommerce by category slug.
  // Use a stable signature of the merged products (ids) so the effect
  // re-runs when the actual product set changes, not just its length.
  const mergedSig = useMemo(
    () => mergedProducts.map((p) => p.id).join("|"),
    [mergedProducts],
  );
  useEffect(() => {
    if (catalogLoading) return;
    if (mergedProducts.length > 0) { setWcProducts([]); return; }
    let cancelled = false;
    setWcLoading(true);
    fetchCategoryProducts(String(slug), { countryCode, cityId }).then(({ products, categoryName }) => {
      if (cancelled) return;
      setWcProducts(products.filter((p) => p.image));
      setWcCategoryName(categoryName);
      setWcLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, catalogLoading, mergedSig, countryCode, cityId]);

  const sourceProducts = mergedProducts.length > 0 ? mergedProducts : wcProducts;
  const products = useMemo(() => {
    if (sort === "priceUp") return [...sourceProducts].sort((a, b) => a.priceValue - b.priceValue);
    if (sort === "priceDown") return [...sourceProducts].sort((a, b) => b.priceValue - a.priceValue);
    if (sort === "name") return [...sourceProducts].sort((a, b) => a.name.localeCompare(b.name));
    return sourceProducts;
  }, [sourceProducts, sort]);

  const displayName = category?.name ?? wcCategoryName ?? String(slug);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: 240, backgroundColor: colors.muted }}>
          {category ? (
            <Image source={category.image} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <LinearGradient
            colors={["rgba(0,65,78,0.25)", "rgba(0,65,78,0.85)"]}
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
              onPress={() => router.push("/cart" as any)}
              style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}
            >
              <Feather name="shopping-bag" size={18} color={colors.primary} />
              {count > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.gold }]}>
                  <Text style={styles.badgeText}>{count}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
          <View style={{ position: "absolute", bottom: 22, left: 24, right: 24 }}>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 11,
                color: colors.goldSoft,
                letterSpacing: 3,
                textTransform: "uppercase",
              }}
            >
              {t.categoryBoutiqueLebanon}
            </Text>
            <Text
              style={{
                fontFamily: "PlayfairDisplay_500Medium",
                fontSize: 32,
                color: "#fff",
                marginTop: 6,
              }}
            >
              {displayName || t.categoryFallback}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                color: "rgba(255,255,255,0.78)",
                marginTop: 4,
              }}
            >
              {wcLoading ? t.loading : `${products.length} ${t.categoryPiecesLabel} · ${t.categorySameDay}`}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingTop: 16 }}
        >
          {categories.map((c) => {
            const active = c.id === slug;
            return (
              <Pressable
                key={c.id}
                onPress={() => router.replace(`/category/${c.id}` as any)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary : "#fff",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: active ? "#fff" : colors.primary,
                  }}
                >
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 18,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground }}>
            {products.length} {t.categoryPiecesLabel}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {SORTS.map((s) => (
              <Pressable
                key={s.key}
                onPress={() => setSort(s.key)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: sort === s.key ? colors.gold : colors.border,
                  backgroundColor: sort === s.key ? colors.gold : "transparent",
                }}
              >
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: sort === s.key ? "#fff" : colors.primary }}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {wcLoading ? (
          <View style={{ padding: 48, alignItems: "center", gap: 12 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
              {t.categoryLoadingProducts}
            </Text>
          </View>
        ) : products.length === 0 ? (
          <View style={{ padding: 48, alignItems: "center", gap: 8 }}>
            <Feather name="inbox" size={28} color={colors.mutedForeground} />
            <Text style={{ fontFamily: "PlayfairDisplay_400Regular", color: colors.primary, fontSize: 18, textAlign: "center" }}>
              {t.comingSoon}
            </Text>
            <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
              {t.comingSoonDesc}
            </Text>
          </View>
        ) : (
          <View
            style={{
              paddingHorizontal: 24,
              paddingTop: 18,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 14,
              rowGap: 26,
            }}
          >
            {products.map((p) => (
              <ProductCard key={p.id} product={p} width={CARD_W} />
            ))}
          </View>
        )}
      </ScrollView>
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
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
});
