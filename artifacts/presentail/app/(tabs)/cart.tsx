import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GiftIllustration } from "@/components/GiftIllustration";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import FullCartScreen from "../cart";

export default function CartTab() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { isRTL } = useLanguage();
  const { detailed } = useCart();

  if (detailed.length > 0) {
    return <FullCartScreen />;
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
