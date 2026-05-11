import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import type { TranslationKey } from "@/lib/translations";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

type PrivacySection = { titleKey: TranslationKey; bodyKey: TranslationKey };

const SECTIONS: PrivacySection[] = [
  { titleKey: "privacy_sec1_title", bodyKey: "privacy_sec1_body" },
  { titleKey: "privacy_sec2_title", bodyKey: "privacy_sec2_body" },
  { titleKey: "privacy_sec3_title", bodyKey: "privacy_sec3_body" },
  { titleKey: "privacy_sec4_title", bodyKey: "privacy_sec4_body" },
  { titleKey: "privacy_sec5_title", bodyKey: "privacy_sec5_body" },
  { titleKey: "privacy_sec6_title", bodyKey: "privacy_sec6_body" },
  { titleKey: "privacy_sec7_title", bodyKey: "privacy_sec7_body" },
  { titleKey: "privacy_sec8_title", bodyKey: "privacy_sec8_body" },
  { titleKey: "privacy_sec9_title", bodyKey: "privacy_sec9_body" },
  { titleKey: "privacy_sec10_title", bodyKey: "privacy_sec10_body" },
];

function PrivacyScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { isRTL } = useLanguage();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
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
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(tabs)/account")
          }
          accessibilityLabel={t.authBack}
        >
          <Feather
            name={isRTL ? "arrow-right" : "arrow-left"}
            size={22}
            color="#fff"
          />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_600SemiBold",
              fontSize: 22,
              color: "#fff",
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t.privacyTitle}
          </Text>
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              color: "rgba(255,255,255,0.72)",
              marginTop: 2,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t.privacyPageSubtitle}
          </Text>
        </View>
        <Feather name="shield" size={22} color="rgba(255,255,255,0.6)" />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 22,
          paddingTop: 24,
          paddingBottom: insets.bottom + 40,
          gap: 26,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Last updated */}
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 12,
            color: colors.mutedForeground,
            letterSpacing: 0.4,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {t.privacyLastUpdated}
        </Text>

        {/* Intro */}
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            color: colors.primary,
            lineHeight: 22,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {t.privacyIntro}
        </Text>

        {/* Sections */}
        {SECTIONS.map((s, i) => (
          <View key={i} style={{ gap: 8 }}>
            <View
              style={{
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    color: colors.gold,
                    fontSize: 12,
                  }}
                >
                  {i + 1}
                </Text>
              </View>
              <Text
                style={{
                  flex: 1,
                  fontFamily: "PlayfairDisplay_600SemiBold",
                  fontSize: 17,
                  color: colors.primary,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {t[s.titleKey]}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                color: colors.mutedForeground,
                lineHeight: 21,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {t[s.bodyKey]}
            </Text>
          </View>
        ))}

        {/* Bottom CTA — Contact */}
        <Pressable
          onPress={() => router.push("/contact")}
          style={{
            marginTop: 12,
            backgroundColor: colors.secondary,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 18,
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            gap: 14,
          }}
        >
          <Feather name="mail" size={22} color={colors.gold} />
          <Text
            style={{
              flex: 1,
              fontFamily: "Inter_600SemiBold",
              fontSize: 14,
              color: colors.primary,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t.contactUs}
          </Text>
          <Feather
            name={isRTL ? "chevron-left" : "chevron-right"}
            size={18}
            color={colors.mutedForeground}
          />
        </Pressable>
      </ScrollView>
    </View>
  );
}

export default withRouteErrorBoundary(PrivacyScreen, "privacy");
