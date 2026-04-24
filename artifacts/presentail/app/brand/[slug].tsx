import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductCard } from "@/components/ProductCard";
import { brands } from "@/data/catalog";
import { useColors } from "@/hooks/useColors";
import { fetchBrandProducts, type WooProduct } from "@/lib/woo";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 24 * 2 - 14) / 2;

export default function BrandScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const brand = brands.find((b) => b.slug === slug);
  const brandName = brand?.name ?? slug ?? "";

  const [products, setProducts] = useState<WooProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProducts([]);
    fetchBrandProducts(String(slug)).then((res) => {
      if (!cancelled) {
        setProducts(res.filter((p) => p.image));
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          backgroundColor: colors.primary,
          paddingTop: insets.top + 12,
          paddingBottom: 20,
          paddingHorizontal: 18,
        }}
      >
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
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.65)", letterSpacing: 1.2, textTransform: "uppercase" }}>
              Brand
            </Text>
            <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 22, color: "#fff", marginTop: 2 }}>
              {brandName}
            </Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>
            Loading products…
          </Text>
        </View>
      ) : products.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 }}>
          <Feather name="package" size={40} color={colors.mutedForeground} />
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 18, color: colors.primary, textAlign: "center" }}>
            No products found
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
            We couldn't find products for {brandName} right now. Check back soon.
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 999 }}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" }}>Go Back</Text>
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
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                {products.length} product{products.length !== 1 ? "s" : ""}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ProductCard
              product={item as any}
              width={CARD_W}
              onPress={() => router.push(`/product/${item.id}` as any)}
            />
          )}
        />
      )}
    </View>
  );
}
