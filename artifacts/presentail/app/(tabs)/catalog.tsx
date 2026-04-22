import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useMemo, useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SectionTitle } from "@/components/Brand";
import { ProductCard } from "@/components/ProductCard";
import { bestSellers, categories } from "@/data/catalog";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 24 * 2 - 14) / 2;

export default function CatalogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [activeCat, setActiveCat] = useState<string>("flowers");
  const products = useMemo(() => {
    const repeats = [...bestSellers, ...bestSellers];
    return repeats.map((p, i) => ({ ...p, id: `${p.id}-${i}` }));
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: 24, paddingTop: topPad + 12, gap: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 11,
              color: colors.gold,
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            Boutique
          </Text>
          <Pressable hitSlop={8}>
            <Feather name="sliders" size={18} color={colors.primary} />
          </Pressable>
        </View>
        <SectionTitle
          title="The full catalogue"
          description="Browse every flower, plant and gift from our atelier — refined by what you're looking for."
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: "#fff",
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.mutedForeground }}>
            Search bouquets, gifts, occasions
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingTop: 22 }}
      >
        {categories.map((c) => {
          const active = c.id === activeCat;
          return (
            <Pressable
              key={c.id}
              onPress={() => setActiveCat(c.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primary : "#fff",
              }}
            >
              <MaterialCommunityIcons
                name={c.icon as any}
                size={14}
                color={active ? "#fff" : colors.primary}
              />
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
        })}
      </ScrollView>

      <View style={{ marginTop: 24, marginHorizontal: 24, borderRadius: 22, overflow: "hidden" }}>
        <Image
          source={require("@/assets/images/collection-vases.png")}
          style={{ width: "100%", height: 160 }}
          contentFit="cover"
        />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,65,78,0.55)" }]} />
        <View style={{ position: "absolute", bottom: 18, left: 18, right: 18 }}>
          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 10,
              letterSpacing: 2,
              color: colors.goldSoft,
              textTransform: "uppercase",
            }}
          >
            Featured · April Edit
          </Text>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              color: "#fff",
              fontSize: 22,
              marginTop: 6,
            }}
          >
            Spring Vases & Sculpted Stems
          </Text>
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 28,
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
    </ScrollView>
  );
}
