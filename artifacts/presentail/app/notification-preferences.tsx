import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";
import type { TranslationKey } from "@/lib/translations";
import {
  DEFAULT_CATEGORY_PREFS,
  getCategoryPreferences,
  getNativePermissionStatus,
  getNotificationStatus,
  openSystemSettings,
  requestPermission,
  saveCategoryPreferences,
  saveNotificationStatus,
  type NotificationCategory,
  type NotificationCategoryPrefs,
  type NotificationStatus,
} from "@/services/notifications";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

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

function NotificationPreferencesScreen() {
  const colors = useColors();
  const headingFontSemiBold = useHeadingFont("600SemiBold");
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

  // Track whether this is the first time the screen has gained focus in
  // the current mount — used to auto-trigger the OS permission dialog for
  // undecided users (not_determined / prompted) without re-prompting on
  // every subsequent focus (e.g. after the OS dialog steals and returns focus).
  const isFirstFocus = useRef(true);

  const refresh = useCallback(async (shouldAutoPrompt: boolean) => {
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

    // Auto-trigger the OS permission dialog when the user lands here and
    // hasn't been asked yet (not_determined) or was shown the in-app nudge
    // card but the decision is still pending (prompted). We only do this on
    // the first focus so that the dialog fires once — subsequent focus
    // events (e.g. app-foreground after the OS dialog) simply re-read the
    // now-resolved status.
    if (
      shouldAutoPrompt &&
      Platform.OS !== "web" &&
      (effective === "not_determined" || effective === "prompted")
    ) {
      const next = await requestPermission();
      effective = next;
    }

    setPermissionStatus(effective);
    const nextPrefs = await getCategoryPreferences();
    setPrefs(nextPrefs);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const autoPrompt = isFirstFocus.current;
      isFirstFocus.current = false;
      refresh(autoPrompt);
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

  // "skipped" means the user explicitly dismissed the in-app permission
  // prompt — respect that decision; show an opt-in CTA rather than treating
  // them as blocked.
  const deniedByOS =
    Platform.OS !== "web" && permissionStatus === "denied";
  const skippedByUser =
    Platform.OS !== "web" && permissionStatus === "skipped";
  const blocked = deniedByOS || skippedByUser;

  const onEnablePress = async () => {
    // If the OS has already denied permission, we can only open settings.
    // Otherwise trigger the system dialog directly.
    const native = await getNativePermissionStatus();
    if (native === "denied") {
      openSystemSettings();
    } else {
      const next = await requestPermission();
      setPermissionStatus(next);
      if (next === "granted") {
        const nextPrefs = await getCategoryPreferences();
        setPrefs(nextPrefs);
      }
    }
  };

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
          <AppText
            style={{
              fontFamily: headingFontSemiBold,
              fontSize: 22,
              color: "#fff",
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t.notifPrefsTitle}
          </AppText>
          <AppText
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              color: "rgba(255,255,255,0.72)",
              marginTop: 2,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t.notifPrefsSubtitle}
          </AppText>
        </View>
        <Feather name="bell" size={22} color="rgba(255,255,255,0.6)" /> {/* contrast-ok: decorative header icon, non-text UI component (WCAG SC 1.4.11 requires 3.0:1; ≈4.1:1 on teal800 passes) */}
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
          {deniedByOS ? (
            /* OS-level blocked: direct user to system settings */
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
                <AppText
                  style={{
                    flex: 1,
                    fontFamily: headingFontSemiBold,
                    fontSize: 16,
                    color: colors.primary,
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  {t.notifPrefsBlockedTitle}
                </AppText>
              </View>
              <AppText
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: colors.mutedForeground,
                  lineHeight: 20,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {t.notifPrefsBlockedBody}
              </AppText>
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
                <AppText
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 12,
                    color: "#fff",
                    letterSpacing: 0.6,
                  }}
                >
                  {t.openSettings}
                </AppText>
              </Pressable>
            </View>
          ) : skippedByUser ? (
            /* User skipped the in-app prompt — show a gentle opt-in CTA */
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
                <Feather name="bell" size={18} color={colors.gold} />
                <AppText
                  style={{
                    flex: 1,
                    fontFamily: headingFontSemiBold,
                    fontSize: 16,
                    color: colors.primary,
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  {t.notifPrefsOptInTitle}
                </AppText>
              </View>
              <AppText
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: colors.mutedForeground,
                  lineHeight: 20,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {t.notifPrefsOptInBody}
              </AppText>
              <Pressable
                onPress={onEnablePress}
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
                <AppText
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 12,
                    color: "#fff",
                    letterSpacing: 0.6,
                  }}
                >
                  {t.enableNotifications}
                </AppText>
              </Pressable>
            </View>
          ) : (
            <AppText
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                color: colors.mutedForeground,
                lineHeight: 20,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {t.notifPrefsIntro}
            </AppText>
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
                    <AppText
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 14,
                        color: colors.primary,
                        textAlign: isRTL ? "right" : "left",
                      }}
                    >
                      {t[cat.titleKey]}
                    </AppText>
                    <AppText
                      style={{
                        fontFamily: "Inter_400Regular",
                        fontSize: 12,
                        lineHeight: 17,
                        color: colors.mutedForeground,
                        textAlign: isRTL ? "right" : "left",
                      }}
                    >
                      {t[cat.descKey]}
                    </AppText>
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

export default withRouteErrorBoundary(NotificationPreferencesScreen, "notification-preferences");
