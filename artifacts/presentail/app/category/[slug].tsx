import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductCard } from "@/components/ProductCard";
import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";
import { useCart } from "@/contexts/CartContext";
import { useWooProducts } from "@/contexts/WooProductsContext";
import {
  categories,
  getCategory,
  type Product,
} from "@/data/catalog";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import { fetchCategoryProducts, type WooProduct } from "@/lib/woo";
import { trackScreenTTID } from "@/lib/analytics";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 24 * 2 - 14) / 2;

type SortKey = "featured" | "priceUp" | "priceDown" | "name";

function CategoryScreen() {
  const headingFontMedium = useHeadingFont("500Medium");
  const headingFontRegular = useHeadingFont("400Regular");
  const { slug: routeSlug } = useLocalSearchParams<{ slug: string }>();
  const [activeSlug, setActiveSlug] = useState<string>(String(routeSlug));
  useEffect(() => {
    if (routeSlug) setActiveSlug(String(routeSlug));
  }, [routeSlug]);
  const slug = activeSlug;
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
  const [wcProducts, setWcProducts] = useState<Product[]>([]);
  const [wcCategoryName, setWcCategoryName] = useState<string>("");
  const [wcLoading, setWcLoading] = useState(true);
  const [coverLoaded, setCoverLoaded] = useState(false);
  // Capture mount time so the TTID includes the async product fetch.
  const mountMsRef = useRef(Date.now());

  // Fire a mobile TTID event the first time the category screen has product
  // data to show. Skipped on web (web-vitals handles performance there).
  useEffect(() => {
    if (wcLoading || Platform.OS === "web") return;
    trackScreenTTID("category", mountMsRef.current);
  }, [wcLoading]);

  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const countryCode = selectedCountry?.code ?? null;
  const cityId = selectedCity?.id ?? null;
  const category = getCategory(String(slug));

  useEffect(() => {
    let cancelled = false;
    setWcLoading(true);
    setCoverLoaded(false);
    // Clear stale rows from the previous slug / store immediately so the
    // virtualized list shows the loading state instead of flashing the
    // previous category's products while the new fetch is in flight.
    setWcProducts([]);
    fetchCategoryProducts(String(slug), { countryCode, cityId }).then(({ products, categoryName }) => {
      if (cancelled) return;
      const merged = products
        .map((wp) => mergeWithStatic(wp))
        .filter((p) => p.image);
      setWcProducts(merged);
      setWcCategoryName(categoryName);
      setWcLoading(false);
    });
    return () => { cancelled = true; };
  }, [slug, countryCode, cityId]);

  const sourceProducts = wcProducts;
  const products = useMemo(() => {
    if (sort === "priceUp") return [...sourceProducts].sort((a, b) => a.priceValue - b.priceValue);
    if (sort === "priceDown") return [...sourceProducts].sort((a, b) => b.priceValue - a.priceValue);
    if (sort === "name") return [...sourceProducts].sort((a, b) => a.name.localeCompare(b.name));
    return sourceProducts;
  }, [sourceProducts, sort]);

  // Suggested popular picks shown when this category is sold out, drawn
  // from the merged store-aware catalog and filtered to other categories
  // so the suggestion isn't itself empty.
  const { products: wooCatalog } = useWooProducts();
  const popularPicks = useMemo(() => {
    const pool = wooCatalog.filter((p) => p.category !== String(slug) && p.image);
    return [...pool]
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, 6);
  }, [wooCatalog, slug]);

  const displayName = category?.name ?? wcCategoryName ?? String(slug);

  const header = (
    <>
        <View style={{ height: 240, backgroundColor: colors.imagePlaceholder }}>
          {category ? (
            <Image
              source={category.image}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              onLoad={() => setCoverLoaded(true)}
              onError={() => setCoverLoaded(true)}
            />
          ) : null}
          {category && !coverLoaded && <ShimmerPlaceholder />}
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
              onPress={() => router.push("/cart")}
              style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}
            >
              <Feather name="shopping-bag" size={18} color={colors.primary} />
              {count > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.gold }]}>
                  <AppText style={styles.badgeText}>{count}</AppText>
                </View>
              ) : null}
            </Pressable>
          </View>
          <View style={{ position: "absolute", bottom: 22, left: 24, right: 24 }}>
            <AppText
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 11,
                color: colors.goldSoft,
                letterSpacing: 3,
                textTransform: "uppercase",
              }}
            >
              {t.categoryBoutiqueLebanon}
            </AppText>
            <AppText
              style={{
                fontFamily: headingFontMedium,
                fontSize: 32,
                color: "#fff",
                marginTop: 6,
              }}
            >
              {displayName || t.categoryFallback}
            </AppText>
            <AppText
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                color: "rgba(255,255,255,0.78)",
                marginTop: 4,
              }}
            >
              {wcLoading ? t.loading : `${products.length} ${t.categoryPiecesLabel} · ${t.categorySameDay}`}
            </AppText>
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
                onPress={() => setActiveSlug(c.id)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary : "#fff",
                }}
              >
                <AppText
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: active ? "#fff" : colors.primary,
                  }}
                >
                  {c.name}
                </AppText>
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
          <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground }}>
            {products.length} {t.categoryPiecesLabel}
          </AppText>
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
                <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: sort === s.key ? "#fff" : colors.primary }}>
                  {s.label}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
        </View>

      {products.length > 0 ? <View style={{ height: 18 }} /> : null}
    </>
  );

  const empty = wcLoading ? (
    <View style={{ padding: 48, alignItems: "center", gap: 12 }}>
      <ActivityIndicator color={colors.primary} />
      <AppText style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
        {t.categoryLoadingProducts}
      </AppText>
    </View>
  ) : (
    <View>
      <View style={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 8, alignItems: "center", gap: 10 }}>
        <Feather name="inbox" size={28} color={colors.mutedForeground} />
        <Text style={{ fontFamily: headingFontRegular, color: colors.primary, fontSize: 20, textAlign: "center" }}>
          {t.categorySoldOutTitle}
        </AppText>
        <AppText style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13, textAlign: "center", lineHeight: 19 }}>
          {t.categorySoldOutDesc}
        </AppText>
      </View>
      {popularPicks.length > 0 ? (
        <View style={{ marginTop: 18 }}>
          <AppText
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
          </AppText>
          <View
            style={{
              paddingHorizontal: 24,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 14,
              rowGap: 26,
            }}
          >
            {popularPicks.map((p) => (
              <ProductCard key={p.id} product={p} width={CARD_W} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        numColumns={2}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        columnWrapperStyle={{ paddingHorizontal: 24, gap: 14 }}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 40,
          rowGap: 26,
        }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        renderItem={({ item }) => (
          <ProductCard product={item} width={CARD_W} />
        )}
      />
    </View>
  );
}

function mergeWithStatic(wp: WooProduct): Product {
  return {
    id: wp.id,
    wcId: wp.wcId,
    name: wp.name,
    price: wp.price,
    priceValue: wp.priceValue,
    image: wp.image,
    category: wp.category,
    description: wp.description,
    tag: wp.tag,
    occasions: wp.occasions,
  };
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

export default withRouteErrorBoundary(CategoryScreen, "category/[slug]");
