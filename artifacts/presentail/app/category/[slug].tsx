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
import { fetchCategoryProducts } from "@/lib/woo";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 24 * 2 - 14) / 2;

const SORTS = ["Featured", "Price ↑", "Price ↓", "Name"] as const;

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { count } = useCart();
  const [sort, setSort] = useState<(typeof SORTS)[number]>("Featured");
  const [wcProducts, setWcProducts] = useState<any[]>([]);
  const [wcCategoryName, setWcCategoryName] = useState<string>("");
  const [wcLoading, setWcLoading] = useState(false);

  const { products: allProducts, loading: catalogLoading } = useWooProducts();
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
    fetchCategoryProducts(String(slug)).then(({ products, categoryName }) => {
      if (cancelled) return;
      setWcProducts(products.filter((p) => p.image));
      setWcCategoryName(categoryName);
      setWcLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, catalogLoading, mergedSig]);

  const sourceProducts = mergedProducts.length > 0 ? mergedProducts : wcProducts;
  const products = useMemo(() => {
    if (sort === "Price ↑") return [...sourceProducts].sort((a, b) => a.priceValue - b.priceValue);
    if (sort === "Price ↓") return [...sourceProducts].sort((a, b) => b.priceValue - a.priceValue);
    if (sort === "Name") return [...sourceProducts].sort((a, b) => a.name.localeCompare(b.name));
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
              Boutique · Lebanon
            </Text>
            <Text
              style={{
                fontFamily: "PlayfairDisplay_500Medium",
                fontSize: 32,
                color: "#fff",
                marginTop: 6,
              }}
            >
              {displayName || "Category"}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                color: "rgba(255,255,255,0.78)",
                marginTop: 4,
              }}
            >
              {wcLoading ? "Loading…" : `${products.length} pieces · Same-day delivery`}
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
            {products.length} pieces
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {SORTS.map((s) => (
              <Pressable
                key={s}
                onPress={() => setSort(s)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: sort === s ? colors.gold : colors.border,
                  backgroundColor: sort === s ? colors.gold : "transparent",
                }}
              >
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: sort === s ? "#fff" : colors.primary }}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {wcLoading ? (
          <View style={{ padding: 48, alignItems: "center", gap: 12 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
              Loading products…
            </Text>
          </View>
        ) : products.length === 0 ? (
          <View style={{ padding: 48, alignItems: "center", gap: 8 }}>
            <Feather name="inbox" size={28} color={colors.mutedForeground} />
            <Text style={{ fontFamily: "PlayfairDisplay_400Regular", color: colors.primary, fontSize: 18 }}>
              Coming soon
            </Text>
            <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
              We're curating new pieces for this category. Check back shortly.
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
