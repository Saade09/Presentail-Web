import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "@/components/BottomSheet";
import { NotificationPermissionModal } from "@/components/NotificationPermissionModal";
import { phoneNumber, whatsappNumber } from "@/constants/contact";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import type { Lang } from "@/lib/translations";
import {
  getNativePermissionStatus,
  getNotificationStatus,
  openSystemSettings,
  requestPermission,
  saveNotificationStatus,
  type NotificationStatus,
} from "@/services/notifications";

export default function AccountTab() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { lang, setLang, isRTL } = useLanguage();
  const { ready, user, logout, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);
  const [careOpen, setCareOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [notifStatus, setNotifStatus] = useState<NotificationStatus>("not_determined");
  const [notifModalOpen, setNotifModalOpen] = useState(false);

  const refreshNotifStatus = useCallback(async () => {
    const stored = await getNotificationStatus();
    if (stored === "granted" || stored === "denied") {
      const native = await getNativePermissionStatus();
      if (native === "granted" || native === "denied") {
        if (native !== stored) {
          await saveNotificationStatus(native);
        }
        setNotifStatus(native);
        return;
      }
    }
    setNotifStatus(stored);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshNotifStatus();
    }, [refreshNotifStatus])
  );

  const onNotifRowPress = async () => {
    if (Platform.OS === "web") return;
    if (notifStatus === "granted") {
      // already enabled — no-op
      return;
    }
    if (notifStatus === "denied") {
      Alert.alert(
        t.notifications,
        t.notificationsOpenSettings,
        [
          { text: t.cancel, style: "cancel" },
          {
            text: t.openSettings,
            onPress: () => openSystemSettings(),
          },
        ]
      );
      return;
    }
    // not_determined / prompted / skipped → re-show modal
    setNotifModalOpen(true);
  };

  const onNotifAllow = async () => {
    setNotifModalOpen(false);
    const next = await requestPermission();
    setNotifStatus(next);
    if (next === "denied") {
      Alert.alert(
        t.notifications,
        t.notificationsOpenSettings,
        [
          { text: t.cancel, style: "cancel" },
          {
            text: t.openSettings,
            onPress: () => openSystemSettings(),
          },
        ]
      );
    }
  };

  const onNotifSkip = async () => {
    setNotifModalOpen(false);
    await saveNotificationStatus("skipped");
    setNotifStatus("skipped");
  };

  const notifValueLabel =
    notifStatus === "granted"
      ? t.notificationsEnabled
      : notifStatus === "denied"
      ? t.notificationsDisabled
      : t.enableNotifications;

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const openTel = () => {
    setCareOpen(false);
    Linking.openURL(`tel:${phoneNumber}`).catch(() => {});
  };

  const openWhatsApp = () => {
    setCareOpen(false);
    const sanitized = whatsappNumber.replace(/[^\d]/g, "");
    Linking.openURL(`https://wa.me/${sanitized}`).catch(() => {});
  };

  const onSelectLang = (l: Lang) => {
    setLang(l);
    setLangOpen(false);
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24, paddingBottom: 120, gap: 18 }}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: 28,
              color: colors.primary,
              textAlign: isRTL ? "right" : "left",
              marginTop: 4,
            }}
          >
            {t.profileTitle}
          </Text>

          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              color: colors.primary,
              textAlign: isRTL ? "right" : "left",
              opacity: 0.85,
              lineHeight: 20,
            }}
          >
            {t.profileSignInHelper}
          </Text>

          <Pressable
            onPress={() => router.push("/login" as any)}
            style={({ pressed }) => ({
              borderWidth: 1.5,
              borderColor: colors.primary,
              borderRadius: 999,
              paddingVertical: 18,
              alignItems: "center",
              marginTop: 4,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                color: colors.primary,
                letterSpacing: 1,
                fontSize: 13,
              }}
            >
              {t.profileSignInBtn}
            </Text>
          </Pressable>

          <Card colors={colors}>
            <SettingsRow
              colors={colors}
              isRTL={isRTL}
              icon="headphones"
              label={t.customerCare}
              onPress={() => setCareOpen(true)}
            />
            <Divider colors={colors} />
            <SettingsRow
              colors={colors}
              isRTL={isRTL}
              icon="globe"
              label={t.languageLabel}
              onPress={() => setLangOpen(true)}
            />
            {Platform.OS !== "web" ? (
              <>
                <Divider colors={colors} />
                <SettingsRow
                  colors={colors}
                  isRTL={isRTL}
                  icon="bell"
                  label={t.notifications}
                  value={notifValueLabel}
                  hideChevron={notifStatus === "granted"}
                  onPress={onNotifRowPress}
                />
              </>
            ) : null}
          </Card>

          <Card colors={colors}>
            <SettingsRow
              colors={colors}
              isRTL={isRTL}
              icon="help-circle"
              label={t.faq}
              onPress={() => router.push("/faq")}
            />
            <Divider colors={colors} />
            <SettingsRow
              colors={colors}
              isRTL={isRTL}
              icon="file-text"
              label={t.termsAndConditions}
              onPress={() => router.push("/terms")}
            />
          </Card>
        </ScrollView>

        <BottomSheet visible={careOpen} onClose={() => setCareOpen(false)}>
          <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 }}>
            <Text
              style={{
                fontFamily: "PlayfairDisplay_500Medium",
                fontSize: 22,
                color: colors.primary,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {t.customerCareHeading}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 14,
                color: colors.mutedForeground,
                textAlign: isRTL ? "right" : "left",
                marginTop: 6,
                marginBottom: 18,
              }}
            >
              {t.customerCareSubheading}
            </Text>

            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: "hidden",
              }}
            >
              <SettingsRow
                colors={colors}
                isRTL={isRTL}
                icon="phone"
                label={t.phoneCall}
                onPress={openTel}
              />
              <Divider colors={colors} />
              <SettingsRow
                colors={colors}
                isRTL={isRTL}
                icon="message-circle"
                label={t.whatsApp}
                onPress={openWhatsApp}
              />
            </View>
          </View>
        </BottomSheet>

        <BottomSheet visible={langOpen} onClose={() => setLangOpen(false)}>
          <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 }}>
            <Text
              style={{
                fontFamily: "PlayfairDisplay_500Medium",
                fontSize: 22,
                color: colors.primary,
                textAlign: isRTL ? "right" : "left",
                marginBottom: 16,
              }}
            >
              {t.languageLabel}
            </Text>

            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: "hidden",
              }}
            >
              <LangOption
                colors={colors}
                isRTL={isRTL}
                label={t.langEnglish}
                active={lang === "EN"}
                onPress={() => onSelectLang("EN")}
              />
              <Divider colors={colors} />
              <LangOption
                colors={colors}
                isRTL={isRTL}
                label={t.langArabic}
                active={lang === "AR"}
                onPress={() => onSelectLang("AR")}
              />
              <Divider colors={colors} />
              <LangOption
                colors={colors}
                isRTL={isRTL}
                label={t.langFrench}
                active={lang === "FR"}
                onPress={() => onSelectLang("FR")}
              />
            </View>
          </View>
        </BottomSheet>

        <NotificationPermissionModal
          visible={notifModalOpen}
          onAllow={onNotifAllow}
          onSkip={onNotifSkip}
        />
      </View>
    );
  }

  const onLogout = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const onDelete = () => {
    Alert.alert(
      "Delete account",
      "This permanently deletes your Presentail account, profile and saved data. Past orders kept for our records will be anonymised. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            const r = await deleteAccount();
            setBusy(false);
            if (!r.ok) {
              Alert.alert("Couldn't delete account", r.message);
              return;
            }
            Alert.alert("Account deleted", "Your account has been removed.");
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 14,
          paddingBottom: 14,
          backgroundColor: colors.primary,
          alignItems: "center",
        }}
      >
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: "#fff" }}>
          My account
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 14,
            padding: 18,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 4,
          }}
        >
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: colors.primary }}>
            {`${user.firstName} ${user.lastName}`.trim() || user.email}
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
            {user.email}
          </Text>
          {user.phone ? (
            <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
              {user.phone}
            </Text>
          ) : null}
        </View>

        <Section colors={colors} title="Orders & history">
          <Row colors={colors} icon="package" label="My orders" onPress={() => router.push("/(tabs)" as any)} />
        </Section>

        {Platform.OS !== "web" ? (
          <Section colors={colors} title="Preferences">
            <SettingsRow
              colors={colors}
              isRTL={isRTL}
              icon="bell"
              label={t.notifications}
              value={notifValueLabel}
              hideChevron={notifStatus === "granted"}
              onPress={onNotifRowPress}
            />
          </Section>
        ) : null}

        <Section colors={colors} title="Account">
          <Row colors={colors} icon="log-out" label="Sign out" onPress={onLogout} />
          <Row
            colors={colors}
            icon="trash-2"
            label={busy ? "Deleting…" : "Delete account"}
            destructive
            onPress={onDelete}
            disabled={busy}
          />
        </Section>

        <Text
          style={{
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
            fontSize: 11,
            textAlign: "center",
            paddingHorizontal: 24,
            marginTop: 8,
          }}
        >
          Deleting your account permanently removes your profile and personal data.
        </Text>
      </ScrollView>

      <NotificationPermissionModal
        visible={notifModalOpen}
        onAllow={onNotifAllow}
        onSkip={onNotifSkip}
      />
    </View>
  );
}

type Colors = ReturnType<typeof useColors>;
type FeatherIcon = React.ComponentProps<typeof Feather>["name"];

function Card({ colors, children }: { colors: Colors; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}

function Divider({ colors }: { colors: Colors }) {
  return <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 16 }} />;
}

type SettingsRowProps = {
  colors: Colors;
  isRTL: boolean;
  icon: FeatherIcon;
  label: string;
  onPress: () => void;
  value?: string;
  hideChevron?: boolean;
};

function SettingsRow({ colors, isRTL, icon, label, onPress, value, hideChevron }: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: isRTL ? "row-reverse" : "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: pressed ? "#0001" : "#fff",
      })}
    >
      <Feather name={icon} size={20} color={colors.primary} />
      <Text
        style={{
          flex: 1,
          fontFamily: "Inter_500Medium",
          fontSize: 15,
          color: colors.primary,
          textAlign: isRTL ? "right" : "left",
        }}
      >
        {label}
      </Text>
      {value ? (
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 13,
            color: colors.mutedForeground,
            textAlign: isRTL ? "left" : "right",
          }}
        >
          {value}
        </Text>
      ) : null}
      {!hideChevron && (
        <Feather
          name={isRTL ? "chevron-left" : "chevron-right"}
          size={18}
          color={colors.mutedForeground}
        />
      )}
    </Pressable>
  );
}

type LangOptionProps = {
  colors: Colors;
  isRTL: boolean;
  label: string;
  active: boolean;
  onPress: () => void;
};

function LangOption({ colors, isRTL, label, active, onPress }: LangOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: isRTL ? "row-reverse" : "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: pressed ? "#0001" : "#fff",
      })}
    >
      <Text
        style={{
          flex: 1,
          fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
          fontSize: 15,
          color: colors.primary,
          textAlign: isRTL ? "right" : "left",
        }}
      >
        {label}
      </Text>
      {active ? <Feather name="check" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

function Section({ colors, title, children }: any) {
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontFamily: "Inter_600SemiBold",
          fontSize: 11,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: colors.mutedForeground,
          marginLeft: 4,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({ colors, icon, label, onPress, destructive, disabled }: any) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: pressed ? "#0001" : "#fff",
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Feather name={icon} size={18} color={destructive ? "#c0392b" : colors.primary} />
      <Text
        style={{
          flex: 1,
          fontFamily: "Inter_500Medium",
          fontSize: 15,
          color: destructive ? "#c0392b" : colors.primary,
        }}
      >
        {label}
      </Text>
      {!destructive && (
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}
