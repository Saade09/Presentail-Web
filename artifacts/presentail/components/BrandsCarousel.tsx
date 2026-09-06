import React from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";

import { SectionTitle } from "@/components/Brand";
import { BrandTile } from "@/components/BrandTile";
import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { API_BASE } from "@/lib/stripe";
import { resolveWcBrandImageUrl } from "@/lib/woo";

export type WooBrand = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
};

export function BrandsCarousel() {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const countryCode = selectedCountry?.code ?? null;
  const cityId = selectedCity?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["woo-brands", { countryCode, cityId }],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (countryCode) headers["x-store-country"] = countryCode;
      if (cityId) headers["x-store-city"] = cityId;
      const res = await fetch(`${API_BASE}/api/woo/brands`, { headers });
      if (!res.ok) return { brands: [] as WooBrand[] };
      const json = await res.json() as { ok?: boolean; brands?: WooBrand[] };
      return {
        brands: Array.isArray(json.brands)
          ? json.brands.map(resolveWcBrandImageUrl)
          : [],
      };
    },
    staleTime: 10 * 60 * 1000,
  });

  const brands = Array.isArray(data?.brands) ? data.brands : [];

  if (!isLoading && brands.length === 0) return null;

  return (
    <View style={{ marginTop: 44 }}>
      <View style={{ paddingHorizontal: 24, marginBottom: 18 }}>
        <SectionTitle eyebrow={t.brandsEyebrow} title={t.brandsTitleHome} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 14 }}
      >
        {isLoading
          ? Array.from({ length: 6 }).map((_, idx) => (
              <View key={idx} style={{ alignItems: "center", gap: 10, width: 88 }}>
                <View
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 999,
                    backgroundColor: colors.muted,
                    overflow: "hidden",
                  }}
                >
                  <ShimmerPlaceholder />
                </View>
                <View style={{ width: 56, height: 10, borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" }}>
                  <ShimmerPlaceholder />
                </View>
              </View>
            ))
          : brands.map((brand) => (
              <BrandTile
                key={brand.slug}
                item={{ slug: brand.slug, name: brand.name, imageUrl: brand.image }}
                onPress={() =>
                  router.push({ pathname: "/brand/[slug]", params: { slug: brand.slug } })
                }
              />
            ))}
      </ScrollView>
    </View>
  );
}
