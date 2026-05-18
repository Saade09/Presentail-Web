import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductCard } from "@/components/ProductCard";
import { useAuth } from "@/contexts/AuthContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useWooProducts } from "@/contexts/WooProductsContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { useWindowDimensions } from "react-native";

const CARD_GAP = 12;
const HORIZONTAL_PADDING = 20;

function FavoritesTab() {
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, ready } = useAuth();
  const { favorites, isLoaded } = useFavorites();
  const { products: allProducts } = useWooProducts();
  const { width: screenWidth } = useWindowDimensions();

  const cardWidth = (screenWidth - HORIZONTAL_PADDING * 2 - CARD_GAP) / 2;

  const favoriteProducts = useMemo(() => {
    return allProducts.filter((p) => favorites.has(p.id));
  }, [allProducts, favorites]);

  if (!ready || !isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Ionicons name="heart-outline" size={56} color={colors.mutedForeground} style={{ marginBottom: 20 }} />
        <Text
          style={{
            fontFamily: "PlayfairDisplay_400Regular",
            fontSize: 24,
            color: colors.primary,
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          {t.favoritesSignInTitle}
        </Text>
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 15,
            color: colors.mutedForeground,
            textAlign: "center",
            marginBottom: 32,
            lineHeight: 22,
          }}
        >
          {t.favoritesSignInDesc}
        </Text>
        <Pressable
          onPress={() => router.push("/auth")}
          style={({ pressed }) => ({
            backgroundColor: colors.primary,
            paddingHorizontal: 32,
            paddingVertical: 14,
            borderRadius: 999,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 13, letterSpacing: 1.4, textTransform: "uppercase" }}>
            {t.authSignIn}
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (favoriteProducts.length === 0) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Ionicons name="heart-outline" size={56} color={colors.mutedForeground} style={{ marginBottom: 20 }} />
        <Text
          style={{
            fontFamily: "PlayfairDisplay_400Regular",
            fontSize: 24,
            color: colors.primary,
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          {t.favoritesEmptyTitle}
        </Text>
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 15,
            color: colors.mutedForeground,
            textAlign: "center",
            lineHeight: 22,
          }}
        >
          {t.favoritesEmptyDesc}
        </Text>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 16,
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingBottom: 16,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text
          style={{
            fontFamily: "PlayfairDisplay_400Regular",
            fontSize: 28,
            color: colors.primary,
          }}
        >
          {t.favoritesTitle}
        </Text>
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            color: colors.mutedForeground,
            marginTop: 4,
          }}
        >
          {favoriteProducts.length} {favoriteProducts.length === 1 ? t.favoritesSingular : t.favoritesPlural}
        </Text>
      </View>
      <FlatList
        data={favoriteProducts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: CARD_GAP, paddingHorizontal: HORIZONTAL_PADDING }}
        contentContainerStyle={{ paddingTop: 20, paddingBottom: insets.bottom + 120 }}
        ItemSeparatorComponent={() => <View style={{ height: CARD_GAP }} />}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <ProductCard product={item} width={cardWidth} />
        )}
      />
    </View>
  );
}

export default withRouteErrorBoundary(FavoritesTab, "favorites");
