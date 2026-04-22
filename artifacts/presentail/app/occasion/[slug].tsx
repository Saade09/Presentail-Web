import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductCard } from "@/components/ProductCard";
import { useCart } from "@/contexts/CartContext";
import { getOccasion, getProductsByOccasion, occasions } from "@/data/catalog";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 24 * 2 - 14) / 2;

export default function OccasionScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { count } = useCart();
  const occasion = getOccasion(String(slug));
  const products = getProductsByOccasion(String(slug));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: 260, backgroundColor: colors.muted }}>
          {occasion ? (
            <Image source={occasion.image} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
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
            <Pressable onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}>
              <Feather name="arrow-left" size={20} color={colors.primary} />
            </Pressable>
            <Pressable onPress={() => router.push("/cart" as any)} style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}>
              <Feather name="shopping-bag" size={18} color={colors.primary} />
              {count > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.gold }]}>
                  <Text style={styles.badgeText}>{count}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
          <View style={{ position: "absolute", bottom: 22, left: 24, right: 24 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.goldSoft, letterSpacing: 3, textTransform: "uppercase" }}>
              For the occasion
            </Text>
            <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 30, color: "#fff", marginTop: 6 }}>
              {occasion?.name ?? "Occasion"}
            </Text>
            {occasion?.description ? (
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.82)", marginTop: 6, lineHeight: 19 }}>
                {occasion.description}
              </Text>
            ) : null}
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingTop: 18 }}
        >
          {occasions.map((o) => {
            const active = o.id === slug;
            return (
              <Pressable
                key={o.id}
                onPress={() => router.replace(`/occasion/${o.id}` as any)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary : "#fff",
                }}
              >
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: active ? "#fff" : colors.primary }}>
                  {o.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {products.length === 0 ? (
          <View style={{ padding: 48, alignItems: "center", gap: 8 }}>
            <Feather name="inbox" size={28} color={colors.mutedForeground} />
            <Text style={{ fontFamily: "PlayfairDisplay_400Regular", color: colors.primary, fontSize: 18 }}>
              Curating new pieces
            </Text>
            <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
              We're hand-picking our favourites for this occasion.
            </Text>
          </View>
        ) : (
          <View
            style={{
              paddingHorizontal: 24,
              paddingTop: 24,
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
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 999, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 10 },
});
