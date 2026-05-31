import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FullCartView } from "@/components/FullCartView";
import { GiftIllustration } from "@/components/GiftIllustration";
import { SkeletonBox } from "@/components/SkeletonBox";
import { useCart } from "@/contexts/CartContext";
import { useWooProducts } from "@/contexts/WooProductsContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

function CartItemSkeleton() {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 14,
        backgroundColor: "#fff",
        borderRadius: 18,
        padding: 14,
      }}
    >
      <SkeletonBox width={76} height={76} borderRadius={14} />
      <View style={{ flex: 1, gap: 10, justifyContent: "center" }}>
        <SkeletonBox width="70%" height={12} />
        <SkeletonBox width="40%" height={10} />
        <SkeletonBox width="28%" height={14} />
      </View>
    </View>
  );
}

function CartLoadingSkeleton({
  colors,
  insets,
  bottomOffset,
}: {
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  insets: { top: number; bottom: number };
  bottomOffset: number;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderColor: colors.border }}>
        <SkeletonBox width={120} height={22} borderRadius={6} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
        <CartItemSkeleton />
        <CartItemSkeleton />

        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />

        <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 10 }}>
          <SkeletonBox width="60%" height={10} />
          <SkeletonBox width="100%" height={6} borderRadius={3} />
        </View>
      </View>

      <View
        style={{
          backgroundColor: "#fff",
          borderTopWidth: 1,
          borderColor: colors.border,
          padding: 20,
          paddingBottom: bottomOffset + 16,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <SkeletonBox width={70} height={10} />
          <SkeletonBox width={50} height={10} />
        </View>
        <SkeletonBox width="100%" height={52} borderRadius={999} />
      </View>
    </View>
  );
}

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
  const { items, detailed } = useCart();
  const { loading: productsLoading } = useWooProducts();

  if (items.length > 0 && productsLoading && detailed.length === 0) {
    return (
      <CartLoadingSkeleton
        colors={colors}
        insets={insets}
        bottomOffset={tabBarHeight}
      />
    );
  }

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
