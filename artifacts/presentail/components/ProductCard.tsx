import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Price } from "@/components/Price";
import { useCart } from "@/contexts/CartContext";
import type { Product } from "@/data/catalog";
import { useColors } from "@/hooks/useColors";

type Props = {
  product: Product;
  width: number;
  onPress?: () => void;
};

export function ProductCard({ product, width, onPress }: Props) {
  const colors = useColors();
  const router = useRouter();
  const { add } = useCart();

  const handlePress = () => {
    if (onPress) return onPress();
    router.push(`/product/${product.id}` as any);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]}
    >
      <View
        style={[
          styles.imageWrap,
          {
            backgroundColor: colors.muted,
            borderRadius: colors.radius,
            aspectRatio: 1,
          },
        ]}
      >
        <Image source={product.image} style={styles.image} contentFit="cover" transition={200} />
        {product.tag ? (
          <View style={[styles.tag, { backgroundColor: colors.primary }]}>
            <Text style={styles.tagText}>{product.tag}</Text>
          </View>
        ) : null}
        <Pressable
          style={[styles.heart, { backgroundColor: colors.gold }]}
          hitSlop={8}
          onPress={(e) => {
            e.stopPropagation();
            add(product.id, 1);
          }}
        >
          <Feather name="plus" size={16} color="#fff" />
        </Pressable>
      </View>
      <View style={{ paddingTop: 12, gap: 4 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.primary }}
        >
          {product.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Price
            value={product.priceValue}
            style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 16, color: colors.primary }}
          />
          {product.priceValue >= 130 ? (
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.gold, letterSpacing: 1 }}>
              FREE DELIVERY
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  tag: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tagText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heart: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
