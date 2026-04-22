import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
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
import {
  getCategory,
  getProduct,
  getProductsByCategory,
} from "@/data/catalog";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W } = Dimensions.get("window");

export default function ProductDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { add, count } = useCart();
  const [qty, setQty] = useState(1);

  const product = getProduct(String(slug));
  if (!product) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <Text style={{ fontFamily: "PlayfairDisplay_400Regular", color: colors.primary, fontSize: 18 }}>
          Product not found
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.gold, fontFamily: "Inter_500Medium" }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const cat = getCategory(product.category);
  const related = getProductsByCategory(product.category)
    .filter((p) => p.id !== product.id)
    .slice(0, 4);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: SCREEN_W * 1.05, backgroundColor: colors.muted }}>
          <Image source={product.image} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient
            colors={["rgba(0,0,0,0.25)", "transparent", "rgba(0,0,0,0.05)"]}
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
            <Pressable
              onPress={() => router.back()}
              style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}
            >
              <Feather name="arrow-left" size={20} color={colors.primary} />
            </Pressable>
            <Pressable
              onPress={() => router.push("/cart" as any)}
              style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}
            >
              <Feather name="shopping-bag" size={18} color={colors.primary} />
              {count > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.gold }]}>
                  <Text style={styles.badgeText}>{count}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        <View style={{ padding: 24, gap: 8 }}>
          {cat ? (
            <Pressable onPress={() => router.push(`/category/${cat.id}` as any)}>
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 11,
                  color: colors.gold,
                  letterSpacing: 2.5,
                  textTransform: "uppercase",
                }}
              >
                {cat.name}
              </Text>
            </Pressable>
          ) : null}
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: 28,
              color: colors.primary,
              lineHeight: 34,
            }}
          >
            {product.name}
          </Text>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_400Regular",
              fontSize: 22,
              color: colors.primary,
              marginTop: 4,
            }}
          >
            {product.price}
          </Text>
          <View style={{ flexDirection: "row", gap: 4, marginTop: 4 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <MaterialCommunityIcons key={i} name="star" size={14} color={colors.gold} />
            ))}
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginLeft: 6 }}>
              4.9 (213 reviews)
            </Text>
          </View>
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              lineHeight: 22,
              color: colors.mutedForeground,
              marginTop: 14,
            }}
          >
            {product.description ??
              "A signature Presentail piece — hand-arranged in our Beirut atelier with the freshest seasonal blooms, finished with our boutique wrapping and a personal note card."}
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 22, gap: 18 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.primary, letterSpacing: 1.5, textTransform: "uppercase" }}>
              Quantity
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 999, overflow: "hidden" }}>
              <Pressable onPress={() => setQty(Math.max(1, qty - 1))} style={styles.qtyBtn}>
                <Feather name="minus" size={14} color={colors.primary} />
              </Pressable>
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.primary, paddingHorizontal: 16 }}>
                {qty}
              </Text>
              <Pressable onPress={() => setQty(qty + 1)} style={styles.qtyBtn}>
                <Feather name="plus" size={14} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          <View style={{ marginTop: 24, gap: 14 }}>
            {[
              { icon: "truck-fast", label: "Same-day delivery across Lebanon" },
              { icon: "flower", label: "Hand-arranged in Beirut" },
              { icon: "shield-check", label: "Freshness guaranteed or remade free" },
            ].map((b) => (
              <View key={b.label} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <MaterialCommunityIcons name={b.icon as any} size={18} color={colors.gold} />
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.primary }}>
                  {b.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {related.length > 0 ? (
          <View style={{ marginTop: 24 }}>
            <Text
              style={{
                fontFamily: "PlayfairDisplay_500Medium",
                fontSize: 20,
                color: colors.primary,
                paddingHorizontal: 24,
                marginBottom: 16,
              }}
            >
              You may also love
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, gap: 14 }}
            >
              {related.map((p) => (
                <View key={p.id} style={{ width: 180 }}>
                  <ProductCard product={p} width={180} />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 24,
          paddingTop: 14,
          paddingBottom: insets.bottom + 14,
          backgroundColor: "#fff",
          borderTopWidth: 1,
          borderColor: colors.border,
          flexDirection: "row",
          gap: 12,
        }}
      >
        <Pressable
          onPress={() => {
            add(product.id, qty);
          }}
          style={({ pressed }) => [
            {
              flex: 1,
              backgroundColor: colors.primary,
              paddingVertical: 16,
              borderRadius: 999,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Feather name="shopping-bag" size={16} color="#fff" />
          <Text
            style={{
              fontFamily: "Inter_600SemiBold",
              color: "#fff",
              fontSize: 13,
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            Add to bag — ${(product.priceValue * qty).toLocaleString()}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
