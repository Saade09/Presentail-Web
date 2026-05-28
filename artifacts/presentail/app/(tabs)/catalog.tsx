import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SectionTitle } from "@/components/Brand";
import { ProductCard } from "@/components/ProductCard";
import { useCart } from "@/contexts/CartContext";
import { useWooProducts } from "@/contexts/WooProductsContext";
import { brands, categories, occasions } from "@/data/catalog";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 24 * 2 - 14) / 2;

const ALL = "all";

type SortKey = "featured" | "priceUp" | "priceDown" | "name";

const OCC_NAME_KEY: Record<string, string> = {
  birthday: "occ_birthday",
  "love-romance": "occ_love_romance",
  housewarming: "occ_housewarming",
  anniversary: "occ_anniversary",
  "new-job": "occ_new_job",
  promotion: "occ_promotion",
  graduation: "occ_graduation",
  congratulations: "occ_congratulations",
  "thank-you": "occ_thank_you",
  "get-well-soon": "occ_get_well_soon",
  newborn: "occ_newborn",
  eid: "occ_eid",
  wedding: "occ_wedding",
  "thinking-of-you": "occ_thinking_of_you",
  farewell: "occ_farewell",
  condolences: "occ_condolences",
  colleague: "occ_colleague",
  friend: "occ_friend",
  "im-sorry": "occ_im_sorry",
  children: "occ_children",
};

function CatalogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { count } = useCart();
  const t = useT();
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const { products } = useWooProducts();
  const [activeCat, setActiveCat] = useState<string>(params.category ?? ALL);
  const [query, setQuery] = useState<string>(params.q ?? "");
  const [sort, setSort] = useState<SortKey>("featured");

  const sortOptions: { id: SortKey; label: string }[] = [
    { id: "featured", label: t.sortFeatured },
    { id: "priceUp", label: t.sortPriceUp },
    { id: "priceDown", label: t.sortPriceDown },
    { id: "name", label: t.sortName },
  ];

  const filtered = useMemo(() => {
    let list = products;
    if (activeCat !== ALL) list = list.filter((p) => p.category === activeCat);
    if (query.trim().length > 0) {
      const q = query.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (sort !== "featured") {
      const sorted = [...list];
      if (sort === "priceUp") {
        sorted.sort((a, b) => (a.priceValue ?? 0) - (b.priceValue ?? 0));
      } else if (sort === "priceDown") {
        sorted.sort((a, b) => (b.priceValue ?? 0) - (a.priceValue ?? 0));
      } else if (sort === "name") {
        sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      }
      list = sorted;
    }
    return list;
  }, [products, activeCat, query, sort]);

  const tRecord = t as unknown as Record<string, string>;

  const matchingOccasions = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    const lower = q.toLowerCase();
    return occasions.filter((occ) => {
      if (occ.name.toLowerCase().includes(lower)) return true;
      const key = OCC_NAME_KEY[occ.id];
      if (key) {
        const localName = tRecord[key];
        if (typeof localName === "string" && localName.toLowerCase().includes(lower)) return true;
      }
      return false;
    });
  }, [query, tRecord]);

  const matchingBrands = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    const lower = q.toLowerCase();
    return brands.filter((b) => b.name.toLowerCase().includes(lower));
  }, [query]);

  const header = (
    <>
      <View style={{ paddingHorizontal: 24, paddingTop: topPad + 12, gap: 18 }}>
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 11,
            color: colors.gold,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          {t.boutique}
        </Text>
        <SectionTitle
          title={t.catalogFullTitle}
          description={t.catalogFullDesc}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: "#fff",
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t.searchPlaceholder}
            placeholderTextColor={colors.mutedForeground}
            style={{
              flex: 1,
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              color: colors.primary,
              paddingVertical: 4,
              ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
            }}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingTop: 22 }}
      >
        {[{ id: ALL, name: t.catalogAll }, ...categories.map((c) => ({ id: c.id, name: c.name }))].map(
          (c) => {
            const active = c.id === activeCat;
            return (
              <Pressable
                key={c.id}
                onPress={() => setActiveCat(c.id)}
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
                    letterSpacing: 0.5,
                  }}
                >
                  {c.name}
                </Text>
              </Pressable>
            );
          },
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingTop: 18, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 10,
            color: colors.gold,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {t.catalogSortLabel}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
          style={{ flex: 1 }}
        >
          {sortOptions.map((opt) => {
            const active = opt.id === sort;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSort(opt.id)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? colors.gold : colors.border,
                  backgroundColor: active ? colors.gold : "#fff",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 11,
                    color: active ? "#fff" : colors.primary,
                    letterSpacing: 0.5,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {matchingOccasions.length > 0 && (
        <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 10,
              color: colors.gold,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            {t.occasionsEyebrow}
          </Text>
          {matchingOccasions.map((occ, idx) => {
            const key = OCC_NAME_KEY[occ.id];
            const displayName = (key && tRecord[key]) ? tRecord[key] : occ.name;
            const isLast = idx === matchingOccasions.length - 1;
            return (
              <Pressable
                key={occ.id}
                onPress={() => router.push({ pathname: "/occasion/[slug]", params: { slug: occ.id } })}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderBottomWidth: isLast ? 0 : 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Feather name="gift" size={14} color={colors.mutedForeground} style={{ marginRight: 10 }} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "Inter_400Regular",
                    fontSize: 14,
                    color: colors.primary,
                  }}
                >
                  {displayName}
                </Text>
                <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
        </View>
      )}

      {matchingBrands.length > 0 && (
        <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 10,
              color: colors.gold,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            {t.brandsEyebrow}
          </Text>
          {matchingBrands.map((brand, idx) => {
            const isLast = idx === matchingBrands.length - 1;
            return (
              <Pressable
                key={brand.slug}
                onPress={() => router.push({ pathname: "/brand/[slug]", params: { slug: brand.slug } })}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderBottomWidth: isLast ? 0 : 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Feather name="tag" size={14} color={colors.mutedForeground} style={{ marginRight: 10 }} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "Inter_400Regular",
                    fontSize: 14,
                    color: colors.primary,
                  }}
                >
                  {brand.name}
                </Text>
                <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
        </View>
      )}

      {filtered.length > 0 ? <View style={{ height: 28 }} /> : null}
    </>
  );

  const empty = (
    <View style={{ padding: 48, alignItems: "center", gap: 8 }}>
      <Feather name="search" size={28} color={colors.mutedForeground} />
      <Text style={{ fontFamily: "PlayfairDisplay_400Regular", color: colors.primary, fontSize: 18, textAlign: "center" }}>
        {t.noMatches}
      </Text>
      <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
        {t.noMatchesDesc}
      </Text>
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      data={filtered}
      keyExtractor={(p) => p.id}
      numColumns={2}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      columnWrapperStyle={{ paddingHorizontal: 24, gap: 14 }}
      contentContainerStyle={{ paddingBottom: 120, rowGap: 26 }}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews
      initialNumToRender={6}
      maxToRenderPerBatch={6}
      windowSize={5}
      renderItem={({ item }) => (
        <ProductCard product={item} width={CARD_W} />
      )}
    />
  );
}

export default withRouteErrorBoundary(CatalogScreen, "(tabs)/catalog");
