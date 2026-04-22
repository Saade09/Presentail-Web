import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SectionTitle } from "@/components/Brand";
import { ProductCard } from "@/components/ProductCard";
import { useCart } from "@/contexts/CartContext";
import { categories, products } from "@/data/catalog";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 24 * 2 - 14) / 2;

const ALL = "all";

export default function CatalogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { count } = useCart();
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [activeCat, setActiveCat] = useState<string>(params.category ?? ALL);
  const [query, setQuery] = useState<string>(params.q ?? "");

  const filtered = useMemo(() => {
    let list = products;
    if (activeCat !== ALL) list = list.filter((p) => p.category === activeCat);
    if (query.trim().length > 0) {
      const q = query.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [activeCat, query]);

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
          <Pressable hitSlop={10} onPress={() => router.push("/cart" as any)}>
            <Feather name="shopping-bag" size={18} color={colors.primary} />
            {count > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: -4,
                  right: -8,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 999,
                  backgroundColor: colors.gold,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 9 }}>
                  {count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        <SectionTitle
          title="The full catalogue"
          description="Every flower, plant and gift from our atelier — refined by what you're looking for."
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
            placeholder="Search bouquets, gifts, occasions"
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
        {[{ id: ALL, name: "All" }, ...categories.map((c) => ({ id: c.id, name: c.name }))].map(
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

      <Pressable
        onPress={() => router.push("/category/lux-arrangements" as any)}
        style={{ marginTop: 24, marginHorizontal: 24, borderRadius: 22, overflow: "hidden" }}
      >
        <Image
          source={require("@/assets/products/sweet-scarlet-affair.avif")}
          style={{ width: "100%", height: 160 }}
          contentFit="cover"
        />
        <LinearGradient
          colors={["rgba(0,65,78,0.15)", "rgba(0,65,78,0.7)"]}
          style={StyleSheet.absoluteFill}
        />
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
            Featured · Lux Arrangements
          </Text>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              color: "#fff",
              fontSize: 22,
              marginTop: 6,
            }}
          >
            Sculpted Roses & Statement Stems
          </Text>
        </View>
      </Pressable>

      {filtered.length === 0 ? (
        <View style={{ padding: 48, alignItems: "center", gap: 8 }}>
          <Feather name="search" size={28} color={colors.mutedForeground} />
          <Text style={{ fontFamily: "PlayfairDisplay_400Regular", color: colors.primary, fontSize: 18 }}>
            No matches
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
            Try a different category or search term.
          </Text>
        </View>
      ) : (
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
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} width={CARD_W} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
