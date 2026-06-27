import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "@/components/BottomSheet";
import { NotificationPermissionModal } from "@/components/NotificationPermissionModal";
import { PhoneField } from "@/components/PhoneField";
import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";
import { phoneNumber, whatsappNumber } from "@/constants/contact";
import { COUNTRY_DIAL_CODES, type CountryDialCode } from "@/data/countryCodes";
import { validateNationalNumber } from "@/data/phoneLengths";
import { API_BASE } from "@/lib/stripe";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { CurrencyCode } from "@/data/currencies";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
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
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

function splitPhone(raw: string | undefined | null): { country: CountryDialCode; local: string } {
  const fallback = COUNTRY_DIAL_CODES[0];
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { country: fallback, local: "" };
  if (trimmed.startsWith("+")) {
    const compact = trimmed.replace(/\s+/g, "");
    const sorted = [...COUNTRY_DIAL_CODES].sort((a, b) => b.dial.length - a.dial.length);
    const match = sorted.find((c) => compact.startsWith(c.dial));
    if (match) {
      const local = compact.slice(match.dial.length).replace(/^[\s-]+/, "");
      return { country: match, local: local.replace(/^0+/, "") };
    }
  }
  return { country: fallback, local: trimmed };
}

function AccountTab() {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { lang, setLang, isRTL } = useLanguage();
  const { ready, user, token, logout, deleteAccount, updateProfile, refreshUser } = useAuth();
  const { currencyCode, isManualOverride, setCurrency, clearManualCurrency, list: currencyList } = useCurrency();
  const [busy, setBusy] = useState(false);
  const [careOpen, setCareOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [nameEditOpen, setNameEditOpen] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [phoneEditOpen, setPhoneEditOpen] = useState(false);
  const [editPhoneCountry, setEditPhoneCountry] = useState<CountryDialCode>(COUNTRY_DIAL_CODES[0]);
  const [editPhoneLocal, setEditPhoneLocal] = useState("");
  const [phoneSaveBusy, setPhoneSaveBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [notifStatus, setNotifStatus] = useState<NotificationStatus>("not_determined");
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [loyaltyTierLabel, setLoyaltyTierLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/loyalty/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { ok?: boolean; loyalty?: { tier?: { label?: string } } }) => {
        if (data.ok && data.loyalty?.tier?.label) {
          setLoyaltyTierLabel(data.loyalty.tier.label);
        }
      })
      .catch(() => {});
  }, [token]);

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

  useFocusEffect(
    useCallback(() => {
      refreshUser();
    }, [refreshUser])
  );

  const onNotifRowPress = async () => {
    if (Platform.OS === "web") return;
    // skipped, granted and denied all go straight to the prefs screen.
    // skipped means the user previously chose "Maybe Later" — respect that
    // decision and don't re-show the modal unsolicited; the prefs screen
    // has its own opt-in CTA for those users.
    if (
      notifStatus === "granted" ||
      notifStatus === "denied" ||
      notifStatus === "skipped"
    ) {
      router.push("/notification-preferences");
      return;
    }
    // Only truly undecided states (not_determined / prompted) trigger the
    // in-app permission modal.
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
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            paddingTop: insets.top + 14,
            paddingBottom: 14,
            backgroundColor: colors.primary,
            alignItems: "center",
          }}
        >
          <View style={{ height: 24, width: 130, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
            <ShimmerPlaceholder />
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 120 }} scrollEnabled={false}>
          <View
            style={{
              backgroundColor: colors.primary,
              borderRadius: 20,
              padding: 20,
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 16,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: "rgba(255,255,255,0.25)",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <ShimmerPlaceholder />
            </View>
            <View style={{ flex: 1, gap: 10 }}>
              <View style={{ height: 16, width: "55%", borderRadius: 4, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
                <ShimmerPlaceholder />
              </View>
              <View style={{ height: 11, width: "75%", borderRadius: 4, backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
                <ShimmerPlaceholder />
              </View>
            </View>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={{
                  width: "47.5%",
                  height: 88,
                  backgroundColor: colors.muted,
                  borderRadius: 16,
                  overflow: "hidden",
                }}
              >
                <ShimmerPlaceholder />
              </View>
            ))}
          </View>

          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
            }}
          >
            {[0, 1, 2].map((i) => (
              <View key={i}>
                {i > 0 && <View style={{ height: 1, backgroundColor: colors.border }} />}
                <View style={{ height: 52, paddingHorizontal: 16, justifyContent: "center" }}>
                  <View style={{ height: 10, width: "50%", borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" }}>
                    <ShimmerPlaceholder />
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
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

  const onSelectCurrency = (code: CurrencyCode) => {
    setCurrency(code);
    setCurrencyOpen(false);
  };

  const onUseAutomaticCurrency = () => {
    clearManualCurrency();
    setCurrencyOpen(false);
  };

  const renderCurrencySheet = () => (
    <BottomSheet visible={currencyOpen} onClose={() => setCurrencyOpen(false)}>
      <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8, maxHeight: 520 }}>
        <AppText
          style={{
            fontFamily: headingFontMedium,
            fontSize: 22,
            color: colors.primary,
            textAlign: isRTL ? "right" : "left",
            marginBottom: 16,
          }}
        >
          {t.selectCurrency}
        </AppText>
        <ScrollView
          style={{
            backgroundColor: "#fff",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          contentContainerStyle={{ paddingVertical: 0 }}
          showsVerticalScrollIndicator={false}
        >
          <CurrencyOption
            colors={colors}
            isRTL={isRTL}
            label={t.currencyUseAutomatic}
            hint={t.currencyAutomaticHint}
            active={!isManualOverride}
            onPress={onUseAutomaticCurrency}
          />
          {currencyList.map((c) => (
            <React.Fragment key={c.code}>
              <Divider colors={colors} />
              <CurrencyOption
                colors={colors}
                isRTL={isRTL}
                label={`${c.flag}  ${c.code}`}
                hint={c.name}
                active={isManualOverride && currencyCode === c.code}
                onPress={() => onSelectCurrency(c.code)}
              />
            </React.Fragment>
          ))}
        </ScrollView>
      </View>
    </BottomSheet>
  );

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24, paddingBottom: 120, gap: 18 }}>
          {/* Guest hero card */}
          <View
            style={{
              backgroundColor: colors.primary,
              borderRadius: 20,
              padding: 24,
              alignItems: "center",
              gap: 12,
            }}
          >
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: "rgba(255,255,255,0.15)",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 4,
              }}
            >
              <Feather name="user" size={28} color="#fff" />
            </View>
            <AppText
              style={{
                fontFamily: headingFontMedium,
                fontSize: 22,
                color: "#fff",
                textAlign: "center",
              }}
            >
              {t.profileTitle}
            </AppText>
            <AppText
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 14,
                color: "rgba(255,255,255,0.8)",
                textAlign: "center",
                lineHeight: 21,
                paddingHorizontal: 8,
              }}
            >
              {t.profileSignInHelper}
            </AppText>
            <Pressable
              onPress={() => router.push("/auth")}
              style={({ pressed }) => ({
                backgroundColor: "#fff",
                borderRadius: 999,
                paddingVertical: 14,
                paddingHorizontal: 32,
                alignItems: "center",
                marginTop: 4,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <AppText
                style={{
                  fontFamily: "Inter_600SemiBold",
                  color: colors.primary,
                  letterSpacing: 1,
                  fontSize: 13,
                }}
              >
                {t.profileSignInBtn}
              </AppText>
            </Pressable>
          </View>

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
                  onPress={onNotifRowPress}
                />
              </>
            ) : null}
          </Card>

          <Card colors={colors}>
            <SettingsRow
              colors={colors}
              isRTL={isRTL}
              icon="dollar-sign"
              label={t.currency}
              value={currencyCode}
              valueLTR
              onPress={() => setCurrencyOpen(true)}
            />
            <Divider colors={colors} />
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
            <AppText
              style={{
                fontFamily: headingFontMedium,
                fontSize: 22,
                color: colors.primary,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {t.customerCareHeading}
            </AppText>
            <AppText
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
            </AppText>

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
            <AppText
              style={{
                fontFamily: headingFontMedium,
                fontSize: 22,
                color: colors.primary,
                textAlign: isRTL ? "right" : "left",
                marginBottom: 16,
              }}
            >
              {t.languageLabel}
            </AppText>

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

        {renderCurrencySheet()}

        <NotificationPermissionModal
          visible={notifModalOpen}
          onAllow={onNotifAllow}
          onSkip={onNotifSkip}
        />
      </View>
    );
  }

  // react-native-web's Alert.alert doesn't render multi-button confirmation
  // dialogs reliably — tapping the destructive action never fires its
  // onPress, which made the Sign out / Delete buttons appear "clickable but
  // dead" in the web preview. Use the browser's native confirm there and
  // keep the native iOS/Android Alert flow everywhere else.
  const confirmDestructive = (
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void | Promise<void>,
  ) => {
    if (Platform.OS === "web") {
      const ok =
        typeof window !== "undefined" && typeof window.confirm === "function"
          ? window.confirm(`${title}\n\n${message}`)
          : true;
      if (ok) {
        void onConfirm();
      }
      return;
    }
    Alert.alert(title, message, [
      { text: t.accountCancel, style: "cancel" },
      {
        text: confirmLabel,
        style: "destructive",
        onPress: () => {
          void onConfirm();
        },
      },
    ]);
  };

  const notify = (title: string, message: string) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(`${title}\n\n${message}`);
      }
      return;
    }
    Alert.alert(title, message);
  };

  const onLogout = () => {
    confirmDestructive(
      t.accountSignOut,
      t.accountSignOutMsg,
      t.accountSignOut,
      async () => {
        await logout();
      },
    );
  };

  const onDelete = () => {
    confirmDestructive(
      t.accountDeleteAccount,
      t.accountDeleteMsg,
      t.accountDelete,
      async () => {
        setBusy(true);
        const r = await deleteAccount();
        setBusy(false);
        if (!r.ok) {
          notify(t.accountCouldntDelete, r.message);
          return;
        }
        notify(t.accountDeletedTitle, t.accountDeletedMsg);
      },
    );
  };

  const openNameEdit = () => {
    setEditFirstName(user?.firstName ?? "");
    setEditLastName(user?.lastName ?? "");
    setNameEditOpen(true);
  };

  const onSaveName = async () => {
    if (!editFirstName.trim()) {
      Alert.alert(t.piErrorTitle, t.piErrorNameRequired);
      return;
    }
    setNameBusy(true);
    const r = await updateProfile({
      firstName: editFirstName.trim(),
      lastName: editLastName.trim(),
    });
    setNameBusy(false);
    if (!r.ok) {
      Alert.alert(t.piErrorTitle, r.message || t.piErrorGeneric);
      return;
    }
    setNameEditOpen(false);
  };

  const openPhoneEdit = () => {
    const split = splitPhone(user?.phone);
    setEditPhoneCountry(split.country);
    setEditPhoneLocal(split.local);
    setPhoneError(null);
    setPhoneEditOpen(true);
  };

  const onSavePhone = async () => {
    setPhoneError(null);
    const local = editPhoneLocal.trim();
    const validation = validateNationalNumber(editPhoneCountry.code, local);
    if (validation === "too_short") {
      setPhoneError(t.piPhoneErrorTooShort);
      return;
    }
    if (validation === "too_long") {
      setPhoneError(t.piPhoneErrorTooLong);
      return;
    }
    const normalizedLocal = local.replace(/^0+/, "");
    const phoneValue = normalizedLocal ? `${editPhoneCountry.dial} ${normalizedLocal}`.trim() : "";
    setPhoneSaveBusy(true);
    const r = await updateProfile({ phone: phoneValue });
    setPhoneSaveBusy(false);
    if (!r.ok) {
      Alert.alert(t.piErrorTitle, r.message || t.piErrorGeneric);
      return;
    }
    setPhoneEditOpen(false);
    Alert.alert(t.piUpdatedTitle, t.piPhoneUpdatedMsg);
  };

  const phoneSplit = useMemo(() => splitPhone(user?.phone), [user?.phone]);
  const phoneDisplayValue = phoneSplit.local
    ? `${phoneSplit.country.dial} ${phoneSplit.local}`
    : t.piPhoneNotSet;

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
        <Text style={{ fontFamily: headingFontMedium, fontSize: 22, color: "#fff" }}>
          {t.accountMyAccount}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 120 }}>
        {/* Polished header card */}
        <Pressable
          onPress={openNameEdit}
          style={({ pressed }) => ({
            backgroundColor: colors.primary,
            borderRadius: 20,
            padding: 20,
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            gap: 16,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          {/* Avatar initial */}
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "rgba(255,255,255,0.18)",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AppText
              style={{
                fontFamily: headingFontMedium,
                fontSize: 22,
                color: "#fff",
              }}
            >
              {(user.firstName?.[0] ?? user.email?.[0] ?? "?").toUpperCase()}
            </AppText>
          </View>

          <View style={{ flex: 1 }}>
            <AppText
              style={{
                fontFamily: headingFontMedium,
                fontSize: 19,
                color: "#fff",
                textAlign: isRTL ? "right" : "left",
              }}
              numberOfLines={1}
            >
              {`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email}
            </AppText>
            <AppText
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                color: "rgba(255,255,255,0.72)",
                textAlign: isRTL ? "right" : "left",
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {user.email}
            </AppText>
            {loyaltyTierLabel ? (
              <View
                style={{
                  alignSelf: isRTL ? "flex-end" : "flex-start",
                  marginTop: 8,
                  backgroundColor: "rgba(255,255,255,0.18)",
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.35)",
                }}
              >
                <AppText
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 11,
                    color: "#fff",
                    letterSpacing: 0.5,
                  }}
                >
                  ★ {loyaltyTierLabel}
                </AppText>
              </View>
            ) : null}
          </View>

          {/* Edit icon */}
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: "rgba(255,255,255,0.18)",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Feather name="edit-2" size={14} color="#fff" />
          </View>
        </Pressable>

        {/* 2×2 Shortcut cards */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {([
            { icon: "package" as const, label: t.accountMyOrders, onPress: () => router.push("/orders" as never) },
            { icon: "star" as const, label: "Points", onPress: () => router.push("/loyalty" as never) },
            { icon: "map-pin" as const, label: t.savedAddressesTitle, onPress: () => router.push("/saved-addresses" as never) },
            { icon: "bell" as const, label: t.notifications, onPress: () => router.push("/notification-preferences" as never) },
          ] as const).map((item) => (
            <Pressable
              key={item.icon}
              onPress={item.onPress}
              style={({ pressed }) => ({
                width: "47.5%",
                backgroundColor: "#fff",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 16,
                alignItems: "center",
                gap: 8,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: `${colors.primary}12`,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name={item.icon} size={18} color={colors.primary} />
              </View>
              <AppText
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: colors.primary,
                  textAlign: "center",
                }}
              >
                {item.label}
              </AppText>
            </Pressable>
          ))}
        </View>

        <Section colors={colors} title={t.accountOrdersHistory}>
          <Row colors={colors} icon="package" label={t.accountMyOrders} onPress={() => router.push("/orders" as never)} />
          <Divider colors={colors} />
          <Row colors={colors} icon="star" label="Presentail Points" onPress={() => router.push("/loyalty" as never)} // i18n-ignore
          />
          <Divider colors={colors} />
          <Row colors={colors} icon="map-pin" label={t.savedAddressesTitle} onPress={() => router.push("/saved-addresses" as never)} />
          <Divider colors={colors} />
          <Row colors={colors} icon="calendar" label={t.accountOccasions} onPress={() => router.push("/occasions-manager" as never)} />
          <Divider colors={colors} />
          <Row colors={colors} icon="heart" label={t.favorites} onPress={() => router.push("/(tabs)/favorites" as never)} />
        </Section>

        <Section colors={colors} title={t.accountPreferences}>
          <SettingsRow
            colors={colors}
            isRTL={isRTL}
            icon="user"
            label={t.personalInfoTitle}
            onPress={() => router.push("/personal-information" as never)}
          />
          <Divider colors={colors} />
          <PhoneRow
            colors={colors}
            isRTL={isRTL}
            label={t.piPhoneCardTitle}
            value={phoneDisplayValue}
            onPress={openPhoneEdit}
          />
          <Divider colors={colors} />
          <SettingsRow
            colors={colors}
            isRTL={isRTL}
            icon="globe"
            label={t.languageLabel}
            onPress={() => setLangOpen(true)}
          />
          <Divider colors={colors} />
          <SettingsRow
            colors={colors}
            isRTL={isRTL}
            icon="dollar-sign"
            label={t.currency}
            value={currencyCode}
            valueLTR
            onPress={() => setCurrencyOpen(true)}
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
                onPress={onNotifRowPress}
              />
            </>
          ) : null}
        </Section>

        <Section colors={colors} title={t.accountSection}>
          <Row colors={colors} icon="log-out" label={t.accountSignOut} onPress={onLogout} />
          <Row
            colors={colors}
            icon="trash-2"
            label={busy ? t.accountDeleting : t.accountDeleteAccount}
            destructive
            onPress={onDelete}
            disabled={busy}
          />
        </Section>

        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
            fontSize: 11,
            textAlign: "center",
            paddingHorizontal: 24,
            marginTop: 8,
          }}
        >
          {t.accountFooterNote}
        </AppText>
      </ScrollView>

      <BottomSheet visible={langOpen} onClose={() => setLangOpen(false)}>
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 }}>
          <AppText
            style={{
              fontFamily: headingFontMedium,
              fontSize: 22,
              color: colors.primary,
              textAlign: isRTL ? "right" : "left",
              marginBottom: 16,
            }}
          >
            {t.languageLabel}
          </AppText>
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

      {renderCurrencySheet()}

      {/* ── Name edit sheet ── */}
      <BottomSheet visible={nameEditOpen} onClose={() => setNameEditOpen(false)}>
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 16 }}>
          <AppText
            style={{
              fontFamily: headingFontMedium,
              fontSize: 22,
              color: colors.primary,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t.piName}
          </AppText>
          <TextInput
            value={editFirstName}
            onChangeText={setEditFirstName}
            placeholder={t.piFirstNamePlaceholder}
            placeholderTextColor={colors.mutedForeground}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 13,
              fontFamily: "Inter_400Regular",
              fontSize: 15,
              color: colors.primary,
              textAlign: isRTL ? "right" : "left",
              backgroundColor: "#fff",
            }}
            returnKeyType="next"
          />
          <TextInput
            value={editLastName}
            onChangeText={setEditLastName}
            placeholder={t.piLastNamePlaceholder}
            placeholderTextColor={colors.mutedForeground}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 13,
              fontFamily: "Inter_400Regular",
              fontSize: 15,
              color: colors.primary,
              textAlign: isRTL ? "right" : "left",
              backgroundColor: "#fff",
            }}
            returnKeyType="done"
            onSubmitEditing={onSaveName}
          />
          <Pressable
            onPress={onSaveName}
            disabled={nameBusy}
            style={({ pressed }) => ({
              backgroundColor: colors.primary,
              borderRadius: 999,
              paddingVertical: 16,
              alignItems: "center",
              opacity: nameBusy ? 0.6 : pressed ? 0.85 : 1,
            })}
          >
            {nameBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <AppText
                style={{
                  fontFamily: "Inter_600SemiBold",
                  color: "#fff",
                  fontSize: 14,
                  letterSpacing: 1,
                }}
              >
                {t.piUpdate}
              </AppText>
            )}
          </Pressable>
        </View>
      </BottomSheet>

      {/* ── Phone edit sheet ── */}
      <BottomSheet visible={phoneEditOpen} onClose={() => setPhoneEditOpen(false)}>
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 16 }}>
          <AppText
            style={{
              fontFamily: headingFontMedium,
              fontSize: 22,
              color: colors.primary,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t.piPhoneCardTitle}
          </AppText>
          <PhoneField
            label={t.piPhoneCardTitle}
            value={editPhoneLocal}
            onChangeText={(v) => {
              setEditPhoneLocal(v);
              if (phoneError) setPhoneError(null);
            }}
            countryCode={editPhoneCountry.code}
            onChangeCountry={(c) => {
              setEditPhoneCountry(c);
              if (phoneError) setPhoneError(null);
            }}
          />
          {phoneError ? (
            <AppText
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                color: "#c0392b",
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {phoneError}
            </AppText>
          ) : null}
          <Pressable
            onPress={onSavePhone}
            disabled={phoneSaveBusy}
            style={({ pressed }) => ({
              backgroundColor: colors.primary,
              borderRadius: 999,
              paddingVertical: 16,
              alignItems: "center",
              opacity: phoneSaveBusy ? 0.6 : pressed ? 0.85 : 1,
            })}
          >
            {phoneSaveBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <AppText
                style={{
                  fontFamily: "Inter_600SemiBold",
                  color: "#fff",
                  fontSize: 14,
                  letterSpacing: 1,
                }}
              >
                {t.piUpdate}
              </AppText>
            )}
          </Pressable>
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
  /** Force the trailing value to render LTR even in RTL layouts (e.g. currency codes). */
  valueLTR?: boolean;
};

function SettingsRow({ colors, isRTL, icon, label, onPress, value, hideChevron, valueLTR }: SettingsRowProps) {
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
      <AppText
        style={{
          flex: 1,
          fontFamily: "Inter_500Medium",
          fontSize: 15,
          color: colors.primary,
          textAlign: isRTL ? "right" : "left",
        }}
      >
        {label}
      </AppText>
      {value ? (
        <AppText
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 13,
            color: colors.mutedForeground,
            textAlign: isRTL ? "left" : "right",
            ...(valueLTR ? { writingDirection: "ltr" as const } : {}),
          }}
        >
          {value}
        </AppText>
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

function PhoneRow({
  colors,
  isRTL,
  label,
  value,
  onPress,
}: {
  colors: Colors;
  isRTL: boolean;
  label: string;
  value: string;
  onPress: () => void;
}) {
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
      <Feather name="phone" size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <AppText
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 15,
            color: colors.primary,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {label}
        </AppText>
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            color: colors.mutedForeground,
            textAlign: isRTL ? "right" : "left",
            marginTop: 1,
          }}
        >
          {value}
        </AppText>
      </View>
      <Feather name="edit-2" size={16} color={colors.mutedForeground} />
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

type CurrencyOptionProps = {
  colors: Colors;
  isRTL: boolean;
  label: string;
  hint?: string;
  active: boolean;
  onPress: () => void;
};

function CurrencyOption({ colors, isRTL, label, hint, active, onPress }: CurrencyOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: isRTL ? "row-reverse" : "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: pressed ? "#0001" : "#fff",
      })}
    >
      <View style={{ flex: 1 }}>
        <AppText
          style={{
            fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
            fontSize: 15,
            color: colors.primary,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {label}
        </AppText>
        {hint ? (
          <AppText
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              color: colors.mutedForeground,
              textAlign: isRTL ? "right" : "left",
              marginTop: 2,
            }}
          >
            {hint}
          </AppText>
        ) : null}
      </View>
      {active ? <Feather name="check" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

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
      <AppText
        style={{
          flex: 1,
          fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
          fontSize: 15,
          color: colors.primary,
          textAlign: isRTL ? "right" : "left",
        }}
      >
        {label}
      </AppText>
      {active ? <Feather name="check" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

function Section({ colors, title, children }: any) {
  return (
    <View style={{ gap: 8 }}>
      <AppText
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
      </AppText>
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
      <AppText
        style={{
          flex: 1,
          fontFamily: "Inter_500Medium",
          fontSize: 15,
          color: destructive ? "#c0392b" : colors.primary,
        }}
      >
        {label}
      </AppText>
      {!destructive && (
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}

export default withRouteErrorBoundary(AccountTab, "(tabs)/account");
