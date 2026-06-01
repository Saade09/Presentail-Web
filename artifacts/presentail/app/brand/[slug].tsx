import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductCard } from "@/components/ProductCard";
import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import { fetchBrandProducts, type WooProduct } from "@/lib/woo";
import { trackScreenTTID } from "@/lib/analytics";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 24 * 2 - 14) / 2;

function BrandScreen() {
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
  const [coverLoaded, setCoverLoaded] = useState(false);
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const countryCode = selectedCountry?.code ?? null;
  const cityId = selectedCity?.id ?? null;
  // Capture mount time so the TTID includes the async product fetch.
  const mountMsRef = useRef(Date.now());

  // Fire a mobile TTID event the first time the brand screen has product
  // data to show. Skipped on web (web-vitals handles performance there).
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
    setCoverLoaded(false);
    fetchBrandProducts(String(slug), { countryCode, cityId }).then((res) => {
      if (!cancelled) {
        setProducts(res.products.filter((p) => p.image));
        setBrandImage(res.brandImage);
        if (res.brandName) setBrandName(res.brandName);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [slug, countryCode, cityId]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          backgroundColor: colors.primary,
          paddingTop: insets.top + 12,
          paddingBottom: 20,
          paddingHorizontal: 18,
          overflow: "hidden",
        }}
      >
        {brandImage ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.imagePlaceholder }]}>
            {!coverLoaded && <ShimmerPlaceholder />}
            <Image
              source={{ uri: brandImage }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              onLoad={() => setCoverLoaded(true)}
              onError={() => setCoverLoaded(true)}
            />
            <LinearGradient
              colors={["rgba(0,65,78,0.25)", "rgba(0,65,78,0.85)"]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.18)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="arrow-left" size={18} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.65)", letterSpacing: 1.2, textTransform: "uppercase" }}>
              {t.brandSlugLabel}
            </AppText>
            <AppText style={{ fontFamily: headingFontSemiBold, fontSize: 22, color: "#fff", marginTop: 2 }}>
              {brandName}
            </AppText>
          </View>
          <Pressable
            onPress={() => router.push({ pathname: "/(tabs)/catalog", params: { brand: String(slug), brandName } })}
            hitSlop={10}
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.18)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="search" size={18} color="#fff" />
          </Pressable>
        </View>
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
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 14, paddingHorizontal: 24 }}
          contentContainerStyle={{ paddingTop: 20, paddingBottom: insets.bottom + 40, gap: 14 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 24, marginBottom: 4 }}>
              <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                {products.length} {products.length !== 1 ? t.brandSlugProducts : t.brandSlugProduct}
              </AppText>
            </View>
          }
          renderItem={({ item }) => (
            <ProductCard
              product={item as any}
              width={CARD_W}
              onPress={() => router.push({ pathname: "/product/[slug]", params: { slug: item.id } })}
            />
          )}
        />
      )}
    </View>
  );
}

export default withRouteErrorBoundary(BrandScreen, "brand/[slug]");
