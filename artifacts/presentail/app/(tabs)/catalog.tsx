import { Feather } from "@expo/vector-icons";
import { getWooSearchQueryKey, useWooSearch, type WooSearchBrand } from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SectionTitle } from "@/components/Brand";
import { FilterSortBar } from "@/components/FilterSortBar";
import { FilterSortSheet, type SortKey, type FilterPill } from "@/components/FilterSortSheet";
import { ProductCard } from "@/components/ProductCard";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useWooProducts } from "@/contexts/WooProductsContext";
import { occasions } from "@/data/catalog";
import { useOsCategories } from "@/hooks/useOsCategories";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

import {
  CATALOG_GRID_COLUMN_GAP,
  CATALOG_GRID_FLATLIST_CONFIG,
  CATALOG_GRID_PADDING_H,
  GRID_NUM_COLUMNS,
  useGridCardWidth,
} from "@/lib/gridLayout";

const ALL = "all";

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
  ramadan: "occ_ramadan",
  valentine: "occ_valentine",
  "mothers-day": "occ_mothers_day",
  "womens-day": "occ_womens_day",
  "fathers-day": "occ_fathers_day",
  christmas: "occ_christmas",
};

function CatalogScreen() {
  const { gridCardWidth, listCardWidth } = useGridCardWidth({
    paddingH: CATALOG_GRID_PADDING_H,
    columnGap: CATALOG_GRID_COLUMN_GAP,
    numColumns: GRID_NUM_COLUMNS,
  });
  const colors = useColors();
  const headingFontRegular = useHeadingFont("400Regular");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { count: _count } = useCart();
  const t = useT();
  const params = useLocalSearchParams<{ category?: string; q?: string; brand?: string; brandName?: string }>();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const activeBrandSlug = params.brand ?? "";
  const activeBrandName = params.brandName ?? "";

  const categories = useOsCategories();
  const { products } = useWooProducts();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const { lang } = useLanguage();
  const [activeCat, setActiveCat] = useState<string>(params.category ?? ALL);
  const [query, setQuery] = useState<string>(params.q ?? "");
  const [sort, setSort] = useState<SortKey>("featured");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [gridView, setGridView] = useState(true);

  const searchEnabled = query.trim().length >= 2;
  const searchParams = {
    q: searchEnabled ? query.trim() : "xx",
    countryCode: selectedCountry?.code ?? undefined,
    cityId: selectedCity?.id ?? undefined,
    lang,
  };
  const { data: searchData } = useWooSearch(searchParams, {
    query: {
      queryKey: getWooSearchQueryKey(searchParams),
      enabled: searchEnabled,
      staleTime: 30_000,
    },
  });

  const sortOptions: { id: SortKey; label: string }[] = [
    { id: "featured", label: t.sortFeatured },
    { id: "bestSeller", label: t.sortBestSeller },
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
      if (sort === "bestSeller") {
        sorted.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
      } else if (sort === "priceUp") {
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

  const matchingBrands: WooSearchBrand[] = (searchData as unknown as { brands?: WooSearchBrand[] })?.brands ?? [];

  const header = (
    <>
      <View style={{ paddingHorizontal: 24, paddingTop: topPad + 12, gap: 18 }}>
        <AppText
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 11,
            color: colors.gold,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          {t.boutique}
        </AppText>
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
                <AppText
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: active ? "#fff" : colors.primary,
                    letterSpacing: 0.5,
                  }}
                >
                  {c.name}
                </AppText>
              </Pressable>
            );
          },
        )}
      </ScrollView>

      <FilterSortBar
        onPress={() => setSheetOpen(true)}
        activeCount={(sort !== "featured" ? 1 : 0) + (activeCat !== ALL ? 1 : 0)}
        gridView={gridView}
        onToggleGrid={() => setGridView((v) => !v)}
      />

      {matchingOccasions.length > 0 && (
        <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
          <AppText
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 10,
              color: colors.gold,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            {activeBrandName
              ? `${t.occasionsEyebrow} · ${t.occasionFromBrand.replace("{brand}", activeBrandName)}`
              : t.occasionsEyebrow}
          </AppText>
          {matchingOccasions.map((occ, idx) => {
            const key = OCC_NAME_KEY[occ.id];
            const displayName = (key && tRecord[key]) ? tRecord[key] : occ.name;
            const isLast = idx === matchingOccasions.length - 1;
            const occParams = activeBrandSlug
              ? { slug: occ.id, brand: activeBrandSlug, brandName: activeBrandName }
              : { slug: occ.id };
            return (
              <Pressable
                key={occ.id}
                onPress={() => router.push({ pathname: "/occasion/[slug]", params: occParams })}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderBottomWidth: isLast ? 0 : 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Feather name="gift" size={14} color={colors.mutedForeground} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <AppText
                    style={{
                      fontFamily: "Inter_400Regular",
                      fontSize: 14,
                      color: colors.primary,
                    }}
                  >
                    {displayName}
                  </AppText>
                  {activeBrandName ? (
                    <AppText
                      style={{
                        fontFamily: "Inter_400Regular",
                        fontSize: 11,
                        color: colors.mutedForeground,
                        marginTop: 1,
                      }}
                    >
                      {t.occasionFromBrand.replace("{brand}", activeBrandName)}
                    </AppText>
                  ) : null}
                </View>
                <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
        </View>
      )}

      {matchingBrands.length > 0 && (
        <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
          <AppText
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
          </AppText>
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
                <AppText
                  style={{
                    flex: 1,
                    fontFamily: "Inter_400Regular",
                    fontSize: 14,
                    color: colors.primary,
                  }}
                >
                  {brand.name}
                </AppText>
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
      <Text style={{ fontFamily: headingFontRegular, color: colors.primary, fontSize: 18, textAlign: "center" }}>
        {t.noMatches}
      </Text>
      <AppText style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
        {t.noMatchesDesc}
      </AppText>
    </View>
  );

  const activeCardW = gridView ? gridCardWidth : listCardWidth;

  const categoryFilterPills: FilterPill[] = [
    { id: ALL, label: t.catalogAll },
    ...categories.map((c) => ({ id: c.id, label: c.name })),
  ];

  return (
    <>
      <FilterSortSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        sortOptions={sortOptions.map((o) => ({ key: o.id, label: o.label }))}
        activeSort={sort}
        onSortChange={setSort}
        filterPills={categoryFilterPills}
        activeFilter={activeCat}
        onFilterChange={(id) => setActiveCat(id || ALL)}
        filterSectionLabel={t.categoriesTitle}
      />
      <FlatList
        key={gridView ? "grid" : "list"}
        style={{ flex: 1, backgroundColor: colors.background }}
        data={filtered}
        keyExtractor={(p) => p.id}
        numColumns={gridView ? CATALOG_GRID_FLATLIST_CONFIG.numColumns : 1}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        columnWrapperStyle={
          gridView
            ? {
                paddingHorizontal: CATALOG_GRID_FLATLIST_CONFIG.columnWrapperPaddingH,
                gap: CATALOG_GRID_FLATLIST_CONFIG.columnGap,
              }
            : undefined
        }
        contentContainerStyle={{ paddingBottom: 120, rowGap: 18 }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        renderItem={({ item }) => (
          <View
            style={
              gridView
                ? undefined
                : { paddingHorizontal: CATALOG_GRID_FLATLIST_CONFIG.listPaddingH }
            }
          >
            <ProductCard product={item} width={activeCardW} />
          </View>
        )}
      />
    </>
  );
}

export default withRouteErrorBoundary(CatalogScreen, "(tabs)/catalog");
