import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

export function LegalPlaceholder({ title, body }: { title: string; body: string }) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { isRTL } = useLanguage();
  const align = isRTL ? "right" : "left";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingBottom: 14,
          paddingHorizontal: 18,
          backgroundColor: colors.primary,
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          gap: 14,
        }}
      >
        <Pressable
          hitSlop={10}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/account"))}
          accessibilityLabel={t.authBack}
        >
          <Feather name={isRTL ? "arrow-right" : "arrow-left"} size={22} color="#fff" />
        </Pressable>
        <Text
          style={{
            fontFamily: "PlayfairDisplay_500Medium",
            fontSize: 22,
            color: "#fff",
            flex: 1,
            textAlign: align,
          }}
        >
          {title}
        </Text>
      </View>

      <View style={{ flex: 1, padding: 24, justifyContent: "center", alignItems: "center" }}>
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 15,
            color: colors.mutedForeground,
            textAlign: "center",
            lineHeight: 22,
          }}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}
