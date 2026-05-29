import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Price } from "@/components/Price";
import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import type { Product } from "@/data/catalog";
import { useColors } from "@/hooks/useColors";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";

function freeDeliveryThresholdNative(code?: string | null): number {
  if (code === "AE") return 330;
  if (code === "CY") return 120;
  return 130;
}

type Props = {
  product: Product;
  width: number;
  onPress?: () => void;
};

export function ProductCard({ product, width, onPress }: Props) {
  const colors = useColors();
  const router = useRouter();
  const { currencyCode, convert } = useCurrency();
  const { selectedCountry } = useDeliveryLocation();
  const { user } = useAuth();
  const { isFavorited, toggleFavorite } = useFavorites();
  const cc = selectedCountry?.code || (currencyCode === "AED" ? "AE" : currencyCode === "EUR" ? "CY" : "LB");
  const threshold = freeDeliveryThresholdNative(cc);
  const convertedPrice = convert(Number.isFinite(product.priceValue) ? product.priceValue : 0);
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const favorited = isFavorited(product.id);

  const handlePress = () => {
    if (onPress) return onPress();
    router.push({ pathname: "/product/[slug]", params: { slug: product.id } });
  };

  const handleHeartPress = (e: { stopPropagation?: () => void }) => {
    if (e.stopPropagation) e.stopPropagation();
    void toggleFavorite(product.id, cc);
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
            backgroundColor: colors.imagePlaceholder,
            borderRadius: colors.radius,
            aspectRatio: 1,
          },
        ]}
      >
        {!imageLoaded && <ShimmerPlaceholder />}
        <Image
          source={product.image}
          style={styles.image}
          contentFit="cover"
          transition={200}
          onLoad={() => setImageLoaded(true)}
        />
        {product.tag ? (
          <View style={[styles.tag, { backgroundColor: colors.primary }]}>
            <Text style={styles.tagText}>{product.tag}</Text>
          </View>
        ) : null}
        {user ? (
          <Pressable
            onPress={handleHeartPress}
            style={styles.heartButton}
            accessibilityLabel={favorited ? "Remove from favorites" : "Add to favorites"}
            hitSlop={8}
          >
            <Ionicons
              name={favorited ? "heart" : "heart-outline"}
              size={18}
              color={favorited ? "#e11d48" : "#fff"}
            />
          </Pressable>
        ) : null}
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
          {convertedPrice >= threshold ? (
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
  heartButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
});
