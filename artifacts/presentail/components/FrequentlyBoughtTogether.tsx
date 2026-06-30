import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/data/catalog";

const CARD_WIDTH = 140;
const MAX_RESULTS = 4;

type FbtProduct = {
  slug: string;
  id: string;
  name: string;
  price: number;
  priceValue?: number;
  category: string;
  inStock: boolean;
  images: Array<{ uri: string }>;
  discountPriceValue?: number | null;
  discountPriceAed?: number | null;
};

function countryToStore(code: string | undefined | null): string {
  if (code === "AE") return "dubai";
  if (code === "CY") return "cyprus";
  return "lebanon";
}

function adaptProduct(p: FbtProduct): Product {
  return {
    id: p.slug,
    name: p.name,
    price: String(p.price),
    priceValue: p.priceValue ?? p.price,
    image: p.images?.[0] ?? null,
    category: p.category,
    discountPriceValue: p.discountPriceValue ?? null,
    discountPriceAed: p.discountPriceAed ?? null,
  };
}

export function FrequentlyBoughtTogether({ anchorSlug }: { anchorSlug: string }) {
  const t = useT();
  const colors = useColors();
  const headingFont = useHeadingFont("500Medium");
  const { selectedCountry } = useDeliveryLocation();
  const store = countryToStore(selectedCountry?.code);

  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    let cancelled = false;
    const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
    const url = `${apiBase}/api/products/frequently-bought-together?slug=${encodeURIComponent(anchorSlug)}&store=${encodeURIComponent(store)}`;
    fetch(url)
      .then((r) => r.json())
      .then((json: { products?: FbtProduct[] }) => {
        if (cancelled) return;
        const adapted = (json.products ?? [])
          .slice(0, MAX_RESULTS)
          .map(adaptProduct);
        setProducts(adapted);
      })
      .catch(() => {
        // silently ignore — section stays hidden
      });
    return () => {
      cancelled = true;
    };
  }, [anchorSlug, store]);

  if (products.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text
        style={{
          fontFamily: headingFont,
          fontSize: 11,
          color: colors.mutedForeground,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        {t.frequentlyBoughtTogether}
      </Text>
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={{ marginRight: 12 }}>
            <ProductCard product={item} width={CARD_WIDTH} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 24,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  listContent: {
    paddingBottom: 4,
  },
});
