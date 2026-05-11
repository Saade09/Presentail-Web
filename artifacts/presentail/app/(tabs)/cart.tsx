import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FullCartView } from "@/components/FullCartView";
import { GiftIllustration } from "@/components/GiftIllustration";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

function CartTab() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Guard against environments where useBottomTabBarHeight() resolves to 0
  // (e.g. some web layouts) — the proceed button must always clear the tab
  // bar, so fall back to a sensible per-platform minimum that matches the
  // configured tabBarStyle in (tabs)/_layout.tsx. On native we add the
  // safe-area inset so iPhones with a home indicator don't end up clipped.
  const rawTabBarHeight = useBottomTabBarHeight();
  const baseTabHeight = Platform.OS === "ios" ? 49 : Platform.OS === "android" ? 56 : 84;
  const minTabBarHeight =
    Platform.OS === "web" ? baseTabHeight : baseTabHeight + insets.bottom;
  const tabBarHeight = Math.max(rawTabBarHeight, minTabBarHeight);
  const t = useT();
  const { isRTL } = useLanguage();
  const { detailed } = useCart();

  if (detailed.length > 0) {
    return <FullCartView showBackButton={false} bottomOffset={tabBarHeight} />;
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
        paddingBottom: insets.bottom + 84,
        paddingHorizontal: 28,
      }}
    >
      <View style={{ flex: 0.85 }} />
      <View style={{ alignItems: "center", gap: 28 }}>
        <GiftIllustration size={220} />

        <View style={{ alignItems: "center", gap: 14, paddingHorizontal: 8 }}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: 26,
              lineHeight: 32,
              color: colors.primary,
              textAlign: "center",
            }}
          >
            {t.emptyCartTitle}
          </Text>
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              lineHeight: 22,
              color: colors.mutedForeground,
              textAlign: "center",
              maxWidth: 320,
            }}
          >
            {t.emptyCartSubtitle}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.browseGifts}
          onPress={() => router.push("/(tabs)/catalog")}
          style={({ pressed }) => ({
            backgroundColor: colors.primary,
            paddingHorizontal: 36,
            paddingVertical: 16,
            borderRadius: 999,
            minWidth: 240,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.9 : 1,
            shadowColor: colors.primary,
            shadowOpacity: 0.18,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 4,
          })}
        >
          <Text
            style={{
              fontFamily: "Inter_600SemiBold",
              color: "#fff",
              fontSize: 15,
              textAlign: "center",
              writingDirection: isRTL ? "rtl" : "ltr",
            }}
          >
            {t.browseGifts}
          </Text>
        </Pressable>
      </View>
      <View style={{ flex: 1.15 }} />
    </View>
  );
}

export default withRouteErrorBoundary(CartTab, "(tabs)/cart");
