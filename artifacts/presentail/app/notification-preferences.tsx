import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import type { TranslationKey } from "@/lib/translations";
import {
  DEFAULT_CATEGORY_PREFS,
  getCategoryPreferences,
  getNativePermissionStatus,
  getNotificationStatus,
  openSystemSettings,
  saveCategoryPreferences,
  saveNotificationStatus,
  type NotificationCategory,
  type NotificationCategoryPrefs,
  type NotificationStatus,
} from "@/services/notifications";

type CategoryDef = {
  key: NotificationCategory;
  icon: React.ComponentProps<typeof Feather>["name"];
  titleKey: TranslationKey;
  descKey: TranslationKey;
};

const CATEGORIES: CategoryDef[] = [
  {
    key: "orders",
    icon: "shopping-bag",
    titleKey: "notifCatOrdersTitle",
    descKey: "notifCatOrdersDesc",
  },
  {
    key: "delivery",
    icon: "truck",
    titleKey: "notifCatDeliveryTitle",
    descKey: "notifCatDeliveryDesc",
  },
  {
    key: "drops",
    icon: "gift",
    titleKey: "notifCatDropsTitle",
    descKey: "notifCatDropsDesc",
  },
];

export default function NotificationPreferencesScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { isRTL } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [permissionStatus, setPermissionStatus] =
    useState<NotificationStatus>("not_determined");
  const [prefs, setPrefs] = useState<NotificationCategoryPrefs>(
    DEFAULT_CATEGORY_PREFS
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    const stored = await getNotificationStatus();
    let effective: NotificationStatus = stored;
    if (Platform.OS !== "web") {
      const native = await getNativePermissionStatus();
      if (native === "granted" || native === "denied") {
        if (native !== stored) {
          await saveNotificationStatus(native);
        }
        effective = native;
      }
    }
    setPermissionStatus(effective);
    const next = await getCategoryPreferences();
    setPrefs(next);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onTogglePref = async (
    category: NotificationCategory,
    value: boolean
  ) => {
    const next: NotificationCategoryPrefs = { ...prefs, [category]: value };
    setPrefs(next);
    await saveCategoryPreferences(next);
  };

  const blocked =
    Platform.OS !== "web" && permissionStatus !== "granted";

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
        <Pressable hitSlop={10} onPress={() => router.back()}>
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
            {t.notifPrefsTitle}
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
            {t.notifPrefsSubtitle}
          </Text>
        </View>
        <Feather name="bell" size={22} color="rgba(255,255,255,0.6)" />
      </View>

      {loading ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 22,
            paddingTop: 24,
            paddingBottom: insets.bottom + 40,
            gap: 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          {blocked ? (
            <View
              style={{
                backgroundColor: colors.secondary,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 18,
                gap: 10,
              }}
            >
              <View
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Feather name="bell-off" size={18} color={colors.gold} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "PlayfairDisplay_600SemiBold",
                    fontSize: 16,
                    color: colors.primary,
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  {t.notifPrefsBlockedTitle}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: colors.mutedForeground,
                  lineHeight: 20,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {t.notifPrefsBlockedBody}
              </Text>
              <Pressable
                onPress={() => openSystemSettings()}
                style={({ pressed }) => ({
                  marginTop: 6,
                  alignSelf: isRTL ? "flex-end" : "flex-start",
                  backgroundColor: colors.primary,
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 999,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 12,
                    color: "#fff",
                    letterSpacing: 0.6,
                  }}
                >
                  {t.openSettings}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                color: colors.mutedForeground,
                lineHeight: 20,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {t.notifPrefsIntro}
            </Text>
          )}

          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
              opacity: blocked ? 0.55 : 1,
            }}
          >
            {CATEGORIES.map((cat, i) => (
              <View key={cat.key}>
                {i > 0 ? (
                  <View
                    style={{
                      height: 1,
                      backgroundColor: colors.border,
                      marginHorizontal: 16,
                    }}
                  />
                ) : null}
                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    gap: 14,
                    paddingVertical: 16,
                    paddingHorizontal: 16,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: colors.secondary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather
                      name={cat.icon}
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 14,
                        color: colors.primary,
                        textAlign: isRTL ? "right" : "left",
                      }}
                    >
                      {t[cat.titleKey]}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Inter_400Regular",
                        fontSize: 12,
                        lineHeight: 17,
                        color: colors.mutedForeground,
                        textAlign: isRTL ? "right" : "left",
                      }}
                    >
                      {t[cat.descKey]}
                    </Text>
                  </View>
                  <Switch
                    value={prefs[cat.key]}
                    onValueChange={(v) => onTogglePref(cat.key, v)}
                    disabled={blocked}
                    trackColor={{
                      false: colors.border,
                      true: colors.primary,
                    }}
                    thumbColor={
                      Platform.OS === "android"
                        ? prefs[cat.key]
                          ? colors.gold
                          : "#fff"
                        : undefined
                    }
                    ios_backgroundColor={colors.border}
                  />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
