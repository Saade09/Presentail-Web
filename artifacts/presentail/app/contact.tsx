import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

const SOCIALS = [
  {
    id: "instagram",
    icon: "instagram" as const,
    label: "Instagram",
    handle: "@presentail.gifts",
    url: "https://www.instagram.com/presentail.gifts/",
    color: "#E1306C",
  },
  {
    id: "facebook",
    icon: "facebook" as const,
    label: "Facebook",
    handle: "presentail",
    url: "https://www.facebook.com/presentail",
    color: "#1877F2",
  },
  {
    id: "linkedin",
    icon: "linkedin" as const,
    label: "LinkedIn",
    handle: "presentail",
    url: "https://www.linkedin.com/company/presentail",
    color: "#0A66C2",
  },
  {
    id: "tiktok",
    icon: "music" as const,
    label: "TikTok",
    handle: "@presentail.gifts",
    url: "https://www.tiktok.com/@presentail.gifts",
    color: "#000000",
  },
];

export default function ContactScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();

  const CHANNELS = [
    {
      id: "whatsapp",
      icon: "message-circle" as const,
      label: "WhatsApp",
      value: "+961 3 136 532",
      action: () => Linking.openURL("https://wa.me/9613136532"),
      color: "#25D366",
      bg: "#f0fdf4",
      border: "#bbf7d0",
    },
    {
      id: "email",
      icon: "mail" as const,
      label: "Email",
      value: "hello@presentail.com",
      action: () => Linking.openURL("mailto:hello@presentail.com"),
      color: "#1a4e5f",
      bg: "#f0f9ff",
      border: "#bae6fd",
    },
  ];

  const LOCATIONS = [
    { name: t.contactLocAchrafieh, icon: "map-pin" as const },
    { name: t.contactLocJdeideh, icon: "map-pin" as const },
    { name: t.contactLocHQ, icon: "home" as const },
    { name: t.contactLocDubai, icon: "map-pin" as const },
    { name: t.contactLocAbuDhabi, icon: "map-pin" as const },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingBottom: 14,
          paddingHorizontal: 18,
          backgroundColor: colors.primary,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
        }}
      >
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_600SemiBold",
              fontSize: 22,
              color: "#fff",
            }}
          >
            {t.contactTitle}
          </Text>
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              color: "rgba(255,255,255,0.72)",
              marginTop: 2,
            }}
          >
            {t.contactSubtitle}
          </Text>
        </View>
        <Feather name="phone" size={20} color="rgba(255,255,255,0.6)" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: insets.bottom + 40, gap: 32 }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <View style={{ paddingTop: 28, gap: 8 }}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_600SemiBold",
              fontSize: 24,
              color: colors.primary,
              lineHeight: 32,
            }}
          >
            {t.contactReachUs}
          </Text>
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 13,
              color: colors.mutedForeground,
              lineHeight: 20,
            }}
          >
            {t.contactReachUsDesc}
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          {CHANNELS.map((ch) => (
            <Pressable
              key={ch.id}
              onPress={ch.action}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
                backgroundColor: ch.bg,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: ch.border,
                padding: 18,
              }}
            >
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 999,
                  backgroundColor: ch.color,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name={ch.icon} size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 15,
                    color: colors.primary,
                  }}
                >
                  {ch.label}
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 13,
                    color: colors.mutedForeground,
                    marginTop: 2,
                  }}
                >
                  {ch.value}
                </Text>
              </View>
              <Feather name="external-link" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>

        <View style={{ gap: 14 }}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_600SemiBold",
              fontSize: 18,
              color: colors.primary,
            }}
          >
            {t.contactFollowUs}
          </Text>
          <View style={{ gap: 10 }}>
            {SOCIALS.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => Linking.openURL(s.url)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  backgroundColor: "#fff",
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: s.color,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name={s.icon} size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 14,
                      color: colors.primary,
                    }}
                  >
                    {s.label}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_400Regular",
                      fontSize: 12,
                      color: colors.mutedForeground,
                    }}
                  >
                    {s.handle}
                  </Text>
                </View>
                <Feather name="external-link" size={14} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ gap: 14 }}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_600SemiBold",
              fontSize: 18,
              color: colors.primary,
            }}
          >
            {t.contactVisitUs}
          </Text>
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
            }}
          >
            {LOCATIONS.map((loc, i) => (
              <View
                key={loc.name}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  paddingVertical: 15,
                  paddingHorizontal: 18,
                  borderBottomWidth: i < LOCATIONS.length - 1 ? 1 : 0,
                  borderColor: colors.border,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    backgroundColor: colors.secondary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name={loc.icon} size={15} color={colors.gold} />
                </View>
                <Text
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 14,
                    color: colors.primary,
                    flex: 1,
                  }}
                >
                  {loc.name}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable
          onPress={() => router.push("/faq")}
          style={{
            backgroundColor: colors.secondary,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 20,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
          }}
        >
          <Feather name="help-circle" size={24} color={colors.gold} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
                color: colors.primary,
              }}
            >
              {t.contactFAQTitle}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                color: colors.mutedForeground,
                marginTop: 2,
              }}
            >
              {t.contactFAQDesc}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </Pressable>
      </ScrollView>
    </View>
  );
}
