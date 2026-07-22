import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Share,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FilterSortBar } from "@/components/FilterSortBar";
import { FilterSortSheet, type SortKey } from "@/components/FilterSortSheet";
import { ProductCard } from "@/components/ProductCard";
import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import { fetchBrandProducts, applyPricingToProducts, sortKeyToApiSort, type WooProduct } from "@/lib/woo";
import { buildBrandShareUrl } from "@/lib/brandShareUrl";
import { usePricingMap } from "@/hooks/usePricingMap";
import { trackScreenTTID } from "@/lib/analytics";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";
import {
  CATALOG_GRID_COLUMN_GAP,
  CATALOG_GRID_PADDING_H,
  GRID_NUM_COLUMNS,
  useGridCardWidth,
} from "@/lib/gridLayout";

const COVER_HEIGHT = 200;
const LOGO_SIZE = 76;
const LOGO_OFFSET = LOGO_SIZE / 2;

function BrandScreen() {
  const { gridCardWidth: CATALOG_GRID_CARD_W, numColumns } = useGridCardWidth({
    paddingH: CATALOG_GRID_PADDING_H,
    columnGap: CATALOG_GRID_COLUMN_GAP,
    numColumns: GRID_NUM_COLUMNS,
  });
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const headingFontSemiBold = useHeadingFont("600SemiBold");
  const headingFontMedium = useHeadingFont("500Medium");

  const [products, setProducts] = useState<WooProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [brandImage, setBrandImage] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string>(String(slug ?? ""));
  const [brandDescription, setBrandDescription] = useState<string | null>(null);
  const [brandCoverImage, setBrandCoverImage] = useState<string | null>(null);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [sort, setSort] = useState<SortKey>("recommended");
  const apiSort = sortKeyToApiSort(sort);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const countryCode = selectedCountry?.code ?? null;
  const cityId = selectedCity?.id ?? null;
  const pricingMap = usePricingMap();
  const mountMsRef = useRef(Date.now());

  const enrichedProducts = applyPricingToProducts(products, pricingMap);

  const handleShareBrand = async () => {
    try {
      const url = buildBrandShareUrl(slug);
      // On iOS: pass `message` (brand name only, no URL) and `url` as
      // separate fields. iOS renders them as two distinct items — the name
      // appears as visible text above the link card. Putting the URL inside
      // `message` causes iOS to extract it and show only the domain card,
      // hiding the brand name entirely.
      // On Android: `url` is not supported by Share.share, so combine name
      // and URL into a single message string (Android shows it as plain text).
      const sharePayload =
        Platform.OS === "ios"
          ? { message: brandName, url }
          : { message: `${brandName}\n${url}` };
      await Share.share(sharePayload);
    } catch {
      // Sharing unavailable — silently ignore
    }
  };

  const SORTS: { key: SortKey; label: string }[] = [
    { key: "recommended", label: t.sortRecommended },
    { key: "bestSeller", label: t.sortBestSeller },
    { key: "newest", label: t.sortNewest },
    { key: "priceUp", label: t.sortPriceUp },
    { key: "priceDown", label: t.sortPriceDown },
    { key: "name", label: t.sortName },
  ];

  // All sort modes except "name" are handled server-side; apply name sort client-side only
  const sortedProducts = useMemo(() => {
    if (sort === "name") return [...enrichedProducts].sort((a, b) => a.name.localeCompare(b.name));
    return enrichedProducts;
  }, [enrichedProducts, sort]);

  useEffect(() => {
    if (loading || Platform.OS === "web") return;
    trackScreenTTID("brand", mountMsRef.current);
  }, [loading]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProducts([]);
    setBrandImage(null);
    setBrandName(String(slug ?? ""));
    setBrandDescription(null);
    setBrandCoverImage(null);
    setCoverLoaded(false);
    fetchBrandProducts(String(slug), { countryCode, cityId }, apiSort).then((res) => {
      if (!cancelled) {
        setProducts(res.products.filter((p) => p.image));
        setBrandImage(res.brandImage);
        setBrandDescription(res.brandDescription);
        setBrandCoverImage(res.brandCoverImage);
        if (res.brandName) setBrandName(res.brandName);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [slug, countryCode, cityId, apiSort]);

  const hasCover = !!brandCoverImage;

  const ListHeader = (
    <View style={{ paddingBottom: 8 }}>
      {/* Cover photo */}
      {hasCover && (
        <View
          style={{
            marginHorizontal: 18,
            marginTop: 16,
            height: COVER_HEIGHT,
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: colors.imagePlaceholder,
          }}
        >
          {!coverLoaded && <ShimmerPlaceholder />}
          <Image
            source={{ uri: brandCoverImage! }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            onLoad={() => setCoverLoaded(true)}
            onError={() => setCoverLoaded(true)}
          />
        </View>
      )}

      {/* Logo badge */}
      <View
        style={{
          alignItems: "center",
          marginTop: hasCover ? -LOGO_OFFSET : 20,
        }}
      >
        <View
          style={{
            width: LOGO_SIZE,
            height: LOGO_SIZE,
            borderRadius: 18,
            backgroundColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.1,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
            overflow: "hidden",
          }}
        >
          {brandImage ? (
            <Image
              source={{ uri: brandImage }}
              style={{ width: LOGO_SIZE, height: LOGO_SIZE }}
              contentFit="contain"
            />
          ) : (
            <AppText style={{ fontFamily: headingFontSemiBold, fontSize: 28, color: colors.primary }}>
              {brandName.charAt(0).toUpperCase()}
            </AppText>
          )}
        </View>
      </View>

      {/* Brand name */}
      <AppText
        style={{
          fontFamily: headingFontSemiBold,
          fontSize: 22,
          color: colors.primary,
          textAlign: "center",
          marginTop: 12,
          marginHorizontal: 24,
        }}
      >
        {brandName}
      </AppText>

      {/* Brand description */}
      {!!brandDescription && (
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            color: colors.mutedForeground,
            textAlign: "center",
            marginTop: 6,
            marginHorizontal: 32,
            lineHeight: 20,
          }}
        >
          {brandDescription}
        </AppText>
      )}

      {/* Product count label */}
      <View style={{ paddingHorizontal: 24, marginTop: 20, marginBottom: 4 }}>
        <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
          {products.length} {products.length !== 1 ? t.brandSlugProducts : t.brandSlugProduct}
        </AppText>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Top bar */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 10,
          paddingHorizontal: 18,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: colors.border ?? "rgba(0,0,0,0.06)",
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            backgroundColor: colors.muted ?? "rgba(0,0,0,0.05)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="arrow-left" size={18} color={colors.primary} />
        </Pressable>
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            color: colors.mutedForeground,
            flex: 1,
          }}
        >
          {t.brandSlugBackToBrands}
        </AppText>
        <Pressable
          onPress={handleShareBrand}
          hitSlop={10}
          accessibilityLabel={t.brandSlugShareAria}
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            backgroundColor: colors.muted ?? "rgba(0,0,0,0.05)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="share-2" size={18} color={colors.primary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator color={colors.primary} size="large" />
          <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>
            {t.brandSlugLoading}
          </AppText>
        </View>
      ) : products.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 }}>
          <Feather name="package" size={40} color={colors.mutedForeground} />
          <AppText style={{ fontFamily: headingFontMedium, fontSize: 18, color: colors.primary, textAlign: "center" }}>
            {t.brandSlugNoProducts}
          </AppText>
          <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
            {t.brandSlugNoProductsPrefix} {brandName} {t.brandSlugNoProductsSuffix}
          </AppText>
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 999 }}
          >
            <AppText style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" }}>{t.brandSlugGoBack}</AppText>
          </Pressable>
        </View>
      ) : (
        <>
          {!loading && products.length > 0 && (
            <FilterSortBar
              onPress={() => setSheetOpen(true)}
              activeCount={sort !== "recommended" ? 1 : 0}
              gridView={true}
              onToggleGrid={() => {}}
            />
          )}
          <FlatList
          key={`grid-${numColumns}`}
          data={sortedProducts}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 24 }}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 40, gap: 18 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={ListHeader}
          renderItem={({ item }) => (
            <ProductCard
              product={item as any}
              width={CATALOG_GRID_CARD_W}
              onPress={() => router.push({ pathname: "/product/[slug]", params: { slug: item.id } })}
            />
          )}
        />
        </>
      )}
      <FilterSortSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        sortOptions={SORTS}
        activeSort={sort}
        onSortChange={(key) => { setSort(key); setSheetOpen(false); }}
      />
    </View>
  );
}

export default withRouteErrorBoundary(BrandScreen, "brand/[slug]");
