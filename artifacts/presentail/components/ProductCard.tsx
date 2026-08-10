import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";

import { Price } from "@/components/Price";
import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Product } from "@/data/catalog";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";
import { useTypography } from "@/hooks/useTypography";
import {
  loadProductDetailScreen,
  prefetchOnInteraction,
} from "@/lib/prefetchScreens";
import { useDeliveryConfig } from "@/hooks/useDeliveryConfig";
import { isDiscountActive } from "@/lib/salePriceHelpers";
import { getFallbackUri } from "@/utils/imageUrl";

const imageLoadedCache = new Set<string>();

function getImageUri(image: Product["image"]): string | null {
  if (!image) return null;
  if (typeof image === "string") return image || null;
  if (typeof image === "object" && "uri" in image) return (image as { uri: string }).uri || null;
  return null;
}

/**
 * "loading"  — first attempt in progress; shimmer visible.
 * "retrying" — first attempt failed; shimmer still visible; re-fetching with
 *              the fallback URI (raw OS URL if primary was proxied, same URL
 *              otherwise — key change forces a fresh network request).
 * "done"     — image loaded or both attempts failed; shimmer hidden.
 */
type ImageState = "loading" | "retrying" | "done";

type Props = {
  product: Product;
  width: number;
  onPress?: () => void;
};

export function ProductCard({ product, width, onPress }: Props) {
  const colors = useColors();
  const typo = useTypography();
  const headingFontMedium = useHeadingFont("500Medium");
  const t = useT();
  const router = useRouter();
  const { currencyCode, convert } = useCurrency();
  const { freeDeliveryEnabled, freeDeliveryThresholdNative: threshold } = useDeliveryConfig();
  const convertedPrice = convert(Number.isFinite(product.priceValue) ? product.priceValue : 0);
  const imageUri = getImageUri(product.image);
  const [imgState, setImgState] = React.useState<ImageState>(() =>
    imageUri !== null && imageLoadedCache.has(imageUri) ? "done" : "loading",
  );
  const imageLoaded = imgState === "done";
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const onSale = isDiscountActive(currencyCode, product.discountPriceValue, product.discountPriceAed);
  const isAed = currencyCode === "AED";
  const discountValueUsd = product.discountPriceValue ?? null;
  const discountValueAed = product.discountPriceAed ?? null;

  const handlePress = () => {
    if (onPress) return onPress();
    router.push({ pathname: "/product/[slug]", params: { slug: product.id } });
  };

  return (
    <Animated.View style={{ opacity: fadeAnim, width }}>
    <Pressable
      onPress={handlePress}
      {...prefetchOnInteraction(loadProductDetailScreen)}
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
          // Key change on "retrying" unmounts the previous Image and mounts a
          // fresh one, forcing a new network request even when the fallback URI
          // equals the original (handles transient network failures).
          key={imgState === "retrying" ? "retry" : "initial"}
          source={
            imgState === "retrying" && imageUri
              ? { uri: getFallbackUri(imageUri) }
              : product.image
          }
          style={styles.image}
          contentFit="cover"
          transition={200}
          onLoad={() => {
            if (imageUri) imageLoadedCache.add(imageUri);
            setImgState("done");
          }}
          onError={() => {
            if (imgState === "loading") {
              // First failure — keep shimmer visible and retry once.
              setImgState("retrying");
            } else {
              // Second failure — give up and show the grey placeholder.
              if (imageUri) imageLoadedCache.add(imageUri);
              setImgState("done");
            }
          }}
        />
        {onSale ? (
          <View style={[styles.tag, { backgroundColor: "#e11d48" }]}>
            <AppText style={[styles.tagText, { fontFamily: typo.medium }]}>{t.saleBadge}</AppText>
          </View>
        ) : product.tag ? (
          <View style={[styles.tag, { backgroundColor: colors.primary }]}>
            <AppText style={[styles.tagText, { fontFamily: typo.medium }]}>{product.tag}</AppText>
          </View>
        ) : null}
        {product.isBestSeller && (
          <View style={[styles.bestSellerTag]}>
            <AppText style={[styles.tagText, { fontFamily: typo.medium }]}>{t.bestSellerBadge}</AppText>
          </View>
        )}
      </View>
      <View style={{ paddingTop: 12, gap: 4 }}>
        <AppText
          numberOfLines={1}
          style={{ fontFamily: typo.medium, fontSize: 14, color: colors.primary }}
        >
          {product.name}
        </AppText>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          {onSale ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
              {isAed && discountValueAed != null && discountValueAed > 0 ? (
                <Price
                  value={discountValueAed}
                  native
                  style={{ fontFamily: headingFontMedium, fontSize: 16, color: "#e11d48" }}
                  containerStyle={{ flexShrink: 0 }}
                />
              ) : (
                <Price
                  value={discountValueUsd!}
                  style={{ fontFamily: headingFontMedium, fontSize: 16, color: "#e11d48" }}
                  containerStyle={{ flexShrink: 0 }}
                />
              )}
              <Price
                value={product.priceValue}
                style={{ fontFamily: headingFontMedium, fontSize: 13, color: colors.mutedForeground, textDecorationLine: "line-through" }}
                containerStyle={{ flexShrink: 0 }}
              />
            </View>
          ) : (
            <Price
              value={product.priceValue}
              style={{ fontFamily: headingFontMedium, fontSize: 16, color: colors.primary }}
              containerStyle={{ flexShrink: 0 }}
            />
          )}
          {freeDeliveryEnabled && convertedPrice >= threshold ? (
            <AppText style={{ fontFamily: typo.regular, fontSize: 11, color: colors.gold, letterSpacing: 1 }}>
              {t.freeDelivery}
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
    </Animated.View>
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
  bestSellerTag: {
    position: "absolute",
    top: 44,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#00414e",
  },
  tagText: {
    color: "#fff",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
