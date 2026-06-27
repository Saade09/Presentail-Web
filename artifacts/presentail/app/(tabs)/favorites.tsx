import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductCard } from "@/components/ProductCard";
import { useAuth } from "@/contexts/AuthContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useWooProducts } from "@/contexts/WooProductsContext";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

const WEB_BASE_URL = "https://presentail.com";

const CARD_GAP = 12;
const HORIZONTAL_PADDING = 20;

function FavoritesTab() {
  const colors = useColors();
  const headingFontRegular = useHeadingFont("400Regular");
  const headingFontMedium = useHeadingFont("500Medium");
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, ready, token } = useAuth();
  const { favorites, isLoaded, refreshFavorites } = useFavorites();
  const [sharing, setSharing] = useState(false);

  // Re-fetch the server-side list whenever this tab comes into focus so that
  // toggling a heart on the product detail screen (or anywhere else) is always
  // reflected here without the user having to manually pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      void refreshFavorites();
    }, [refreshFavorites]),
  );

  const handleShareList = useCallback(async () => {
    if (sharing || !token) return;
    setSharing(true);
    try {
      const apiBase = process.env["EXPO_PUBLIC_API_BASE_URL"] ?? "";
      const res = await fetch(`${apiBase}/api/me/favorites/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await res.json()) as { ok: boolean; token?: string; message?: string };
      if (!data.ok || !data.token) {
        throw new Error(data.message ?? "Could not create share link"); // i18n-ignore
      }
      const shareUrl = `${WEB_BASE_URL}/favorites/share/${data.token}`;
      const sharePayload =
        Platform.OS === "ios"
          ? { message: "My gift wishlist on Presentail", url: shareUrl }
          : { message: `My gift wishlist on Presentail\n${shareUrl}` };
      await Share.share(sharePayload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      Alert.alert("Couldn't share list", msg);
    } finally {
      setSharing(false);
    }
  }, [sharing, token]);
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
        <AppText
          style={{
            fontFamily: headingFontRegular,
            fontSize: 24,
            color: colors.primary,
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          {t.favoritesSignInTitle}
        </AppText>
        <AppText
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
        </AppText>
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
          <AppText style={{ fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 13, letterSpacing: 1.4, textTransform: "uppercase" }}>
            {t.authSignIn}
          </AppText>
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
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2,
          }}
        >
          <Ionicons name="heart-outline" size={40} color={colors.primary} />
        </View>
        <AppText
          style={{
            fontFamily: headingFontMedium,
            fontSize: 22,
            color: colors.primary,
            textAlign: "center",
            marginBottom: 10,
          }}
        >
          {t.favoritesEmptyTitle}
        </AppText>
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            color: colors.mutedForeground,
            textAlign: "center",
            lineHeight: 22,
            marginBottom: 28,
          }}
        >
          {t.favoritesEmptyDesc}
        </AppText>
        <Pressable
          onPress={() => router.push("/(tabs)/" as never)}
          style={({ pressed }) => ({
            borderWidth: 1.5,
            borderColor: colors.primary,
            borderRadius: 999,
            paddingVertical: 12,
            paddingHorizontal: 28,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <AppText
            style={{
              fontFamily: "Inter_600SemiBold",
              color: colors.primary,
              fontSize: 13,
              letterSpacing: 0.8,
            }}
          >
            {t.favoritesDiscoverProducts}
          </AppText>
        </Pressable>
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
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <AppText
              style={{
                fontFamily: headingFontRegular,
                fontSize: 28,
                color: colors.primary,
              }}
            >
              {t.favoritesTitle}
            </AppText>
            <AppText
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                color: colors.mutedForeground,
                marginTop: 4,
              }}
            >
              {favoriteProducts.length} {favoriteProducts.length === 1 ? t.favoritesSingular : t.favoritesPlural}
            </AppText>
          </View>
          <Pressable
            onPress={handleShareList}
            disabled={sharing}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 999,
              paddingVertical: 8,
              paddingHorizontal: 14,
              marginTop: 4,
              opacity: pressed || sharing ? 0.6 : 1,
              backgroundColor: colors.background,
            })}
            accessibilityLabel={t.favoritesShareList}
          >
            <Ionicons name="share-outline" size={16} color={colors.primary} />
            <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}>
              Share
            </AppText>
          </Pressable>
        </View>
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
