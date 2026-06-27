import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { PhoneField } from "@/components/PhoneField";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { COUNTRY_DIAL_CODES, type CountryDialCode } from "@/data/countryCodes";
import { validateNationalNumber } from "@/data/phoneLengths";
import { useAuth, type AuthGender } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";
import { API_BASE } from "@/lib/stripe";
import { getStoredStoreHeaders } from "@/lib/storeHeaders";

type Gender = AuthGender;

const GENDER_VALUES: Gender[] = ["female", "male", "unspecified"];

function splitPhone(raw: string | undefined | null): { country: CountryDialCode; local: string } {
  const fallback = COUNTRY_DIAL_CODES[0];
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { country: fallback, local: "" };
  if (trimmed.startsWith("+")) {
    const compact = trimmed.replace(/\s+/g, "");
    // Longest-prefix match.
    const sorted = [...COUNTRY_DIAL_CODES].sort(
      (a, b) => b.dial.length - a.dial.length,
    );
    const match = sorted.find((c) => compact.startsWith(c.dial));
    if (match) {
      const local = compact.slice(match.dial.length).replace(/^[\s-]+/, "");
      return {
        country: match,
        local: local.replace(/^0+/, ""),
      };
    }
  }
  return { country: fallback, local: trimmed };
}

function isValidBirthday(y: string, m: string, d: string): boolean {
  if (!y && !m && !d) return true; // empty = unset, allowed
  if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) return false;
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  const date = new Date(Date.UTC(yy, mm - 1, dd));
  if (
    date.getUTCFullYear() !== yy ||
    date.getUTCMonth() + 1 !== mm ||
    date.getUTCDate() !== dd
  ) {
    return false;
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (date.getTime() > today.getTime()) return false;
  if (yy < today.getUTCFullYear() - 130) return false;
  return true;
}

function pad2(s: string): string {
  if (!s) return "";
  return s.length === 1 ? `0${s}` : s;
}

function PersonalInformationScreen() {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isRTL } = useLanguage();
  const align = isRTL ? "right" : "left";
  const { user, token, updateProfile } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [gender, setGender] = useState<Gender>(
    (user?.gender as Gender | undefined) ?? "unspecified",
  );
  const initialBirthday = (user?.birthday ?? "").trim();
  const [bDay, setBDay] = useState(
    initialBirthday ? initialBirthday.slice(8, 10) : "",
  );
  const [bMonth, setBMonth] = useState(
    initialBirthday ? initialBirthday.slice(5, 7) : "",
  );
  const [bYear, setBYear] = useState(
    initialBirthday ? initialBirthday.slice(0, 4) : "",
  );
  const initialPhoneSplit = useMemo(() => splitPhone(user?.phone), [user?.phone]);
  const [phoneCountry, setPhoneCountry] = useState<CountryDialCode>(
    initialPhoneSplit.country,
  );
  const [phoneLocal, setPhoneLocal] = useState<string>(initialPhoneSplit.local);
  const [phoneOpen, setPhoneOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [bdayError, setBdayError] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(false);

  // Re-sync form fields from the AuthContext user whenever the screen comes
  // into focus. This handles the case where the user edited their profile on
  // the account tab's inline sheet and then navigated to this screen: the
  // component may already be mounted, so useState initial values are stale.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setGender(((user.gender as Gender | undefined) ?? "unspecified") as Gender);
      const bd = (user.birthday ?? "").trim();
      setBYear(bd ? bd.slice(0, 4) : "");
      setBMonth(bd ? bd.slice(5, 7) : "");
      setBDay(bd ? bd.slice(8, 10) : "");
      const split = splitPhone(user.phone ?? "");
      setPhoneCountry(split.country);
      setPhoneLocal(split.local);
    }, [user]),
  );

  // Refresh from /auth/me on mount so the cached AuthUser (which may pre-date
  // gender/birthday fields being added to the response) gets the latest
  // server values before the user edits anything.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setHydrating(true);
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}`, ...getStoredStoreHeaders() },
        });
        const data = (await res.json().catch(() => ({}))) as any;
        if (cancelled || !res.ok || !data?.ok || !data.user) return;
        const u = data.user;
        setFirstName(u.firstName ?? "");
        setLastName(u.lastName ?? "");
        setGender(((u.gender as Gender | null) ?? "unspecified") as Gender);
        const bd = typeof u.birthday === "string" ? u.birthday : "";
        setBYear(bd ? bd.slice(0, 4) : "");
        setBMonth(bd ? bd.slice(5, 7) : "");
        setBDay(bd ? bd.slice(8, 10) : "");
        const split = splitPhone(u.phone ?? "");
        setPhoneCountry(split.country);
        setPhoneLocal(split.local);
      } catch {
        // ignore; user can still edit cached values
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/account");
  };

  const onUpdate = async () => {
    setBdayError(null);
    if (!firstName.trim()) {
      Alert.alert(t.piErrorTitle, t.piErrorNameRequired);
      return;
    }
    const birthdayProvided = !!(bYear || bMonth || bDay);
    if (birthdayProvided && !isValidBirthday(bYear, bMonth, bDay)) {
      setBdayError(t.piErrorBirthdayInvalid);
      return;
    }
    const birthday = birthdayProvided
      ? `${bYear}-${pad2(bMonth)}-${pad2(bDay)}`
      : null;
    setBusy(true);
    const r = await updateProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      gender,
      birthday,
    });
    setBusy(false);
    if (!r.ok) {
      Alert.alert(t.piErrorTitle, r.message || t.piErrorGeneric);
      return;
    }
    Alert.alert(t.piUpdatedTitle, t.piUpdatedMsg);
  };

  const onUpdatePhone = async () => {
    setPhoneError(null);
    const local = phoneLocal.trim();
    const validation = validateNationalNumber(phoneCountry.code, local);
    if (validation === "too_short") {
      setPhoneError(t.piPhoneErrorTooShort);
      return;
    }
    if (validation === "too_long") {
      setPhoneError(t.piPhoneErrorTooLong);
      return;
    }
    const normalizedLocal = local.replace(/^0+/, "");
    const phoneValue = normalizedLocal ? `${phoneCountry.dial} ${normalizedLocal}`.trim() : "";
    setPhoneBusy(true);
    const r = await updateProfile({ phone: phoneValue });
    setPhoneBusy(false);
    if (!r.ok) {
      Alert.alert(t.piErrorTitle, r.message || t.piErrorGeneric);
      return;
    }
    setPhoneOpen(false);
    Alert.alert(t.piUpdatedTitle, t.piPhoneUpdatedMsg);
  };

  const onChangePassword = () => {
    router.push("/reset-password");
  };

  if (!user) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AppText
          style={{
            fontFamily: "Inter_500Medium",
            color: colors.primary,
            paddingHorizontal: 32,
            textAlign: "center",
          }}
        >
          {t.piSignInRequired}
        </AppText>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <View
        style={{
          paddingTop: insets.top + 14,
          paddingBottom: 14,
          paddingHorizontal: 16,
          backgroundColor: colors.primary,
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable
          onPress={close}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
        >
          <Feather
            name={isRTL ? "chevron-right" : "chevron-left"}
            size={24}
            color="#fff"
          />
        </Pressable>
        <AppText
          style={{
            flex: 1,
            fontFamily: headingFontMedium,
            fontSize: 22,
            color: "#fff",
            textAlign: "center",
            marginRight: isRTL ? 0 : 28,
            marginLeft: isRTL ? 28 : 0,
          }}
        >
          {t.personalInfoTitle}
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 80, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {hydrating ? (
          <View style={{ alignItems: "center", paddingVertical: 12 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {/* ── Personal information card ── */}
        <Card colors={colors}>
          <Field label={t.piName} required colors={colors} align={align}>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder={t.piFirstNamePlaceholder}
              placeholderTextColor={colors.mutedForeground}
              style={inputStyle(colors, align)}
              returnKeyType="next"
            />
            <View style={{ height: 8 }} />
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              placeholder={t.piLastNamePlaceholder}
              placeholderTextColor={colors.mutedForeground}
              style={inputStyle(colors, align)}
              returnKeyType="next"
            />
          </Field>

          <Field label={t.piEmail} colors={colors} align={align}>
            <View
              style={{
                ...inputStyle(colors, align),
                backgroundColor: "#f6f3ee",
                justifyContent: "center",
              }}
            >
              <AppText
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 15,
                  color: colors.primary,
                  textAlign: align,
                }}
              >
                {user.email}
              </AppText>
            </View>
            <AppText
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 11,
                color: colors.mutedForeground,
                marginTop: 6,
                textAlign: align,
              }}
            >
              {t.piEmailHelper}
            </AppText>
          </Field>

          <Field label={t.piGender} colors={colors} align={align}>
            <View
              style={{
                flexDirection: isRTL ? "row-reverse" : "row",
                gap: 8,
              }}
            >
              {GENDER_VALUES.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setGender(g)}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: gender === g ? colors.primary : colors.border,
                    backgroundColor: gender === g ? colors.primary : "#fff",
                    alignItems: "center",
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <AppText
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 13,
                      color: gender === g ? "#fff" : colors.primary,
                    }}
                  >
                    {g === "female"
                      ? t.piGenderFemale
                      : g === "male"
                      ? t.piGenderMale
                      : t.piGenderUnspecified}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label={t.piBirthday} colors={colors} align={align}>
            <View
              style={{
                flexDirection: "row",
                gap: 8,
              }}
            >
              <BirthdayBox
                value={bDay}
                onChange={setBDay}
                placeholder={t.piBirthdayDD}
                maxLength={2}
                colors={colors}
                flex={1}
              />
              <BirthdayBox
                value={bMonth}
                onChange={setBMonth}
                placeholder={t.piBirthdayMM}
                maxLength={2}
                colors={colors}
                flex={1}
              />
              <BirthdayBox
                value={bYear}
                onChange={setBYear}
                placeholder={t.piBirthdayYYYY}
                maxLength={4}
                colors={colors}
                flex={1.4}
              />
            </View>
            {bdayError ? (
              <AppText
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                  color: "#c0392b",
                  marginTop: 6,
                  textAlign: align,
                }}
              >
                {bdayError}
              </AppText>
            ) : null}
          </Field>

          <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 }}>
            <Pressable
              onPress={onUpdate}
              disabled={busy}
              style={({ pressed }) => ({
                backgroundColor: colors.primary,
                borderRadius: 999,
                paddingVertical: 16,
                alignItems: "center",
                opacity: busy ? 0.6 : pressed ? 0.85 : 1,
              })}
            >
              {busy ? (
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
        </Card>

        {/* ── Phone card ── */}
        <Card colors={colors}>
          <View style={{ padding: 16, gap: 4 }}>
            <AppText
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                color: colors.primary,
                textAlign: align,
              }}
            >
              {t.piPhoneCardTitle}
            </AppText>
            <AppText
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 14,
                color: colors.mutedForeground,
                textAlign: align,
              }}
            >
              {phoneLocal ? `${phoneCountry.dial} ${phoneLocal}` : t.piPhoneNotSet}
            </AppText>
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <Pressable
              onPress={() => setPhoneOpen(true)}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: colors.primary,
                borderRadius: 999,
                paddingVertical: 14,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <AppText
                style={{
                  fontFamily: "Inter_600SemiBold",
                  color: colors.primary,
                  fontSize: 13,
                  letterSpacing: 1,
                }}
              >
                {t.piPhoneChange}
              </AppText>
            </Pressable>
          </View>
        </Card>

        {/* ── Password card ── */}
        <Card colors={colors}>
          <View style={{ padding: 16, gap: 4 }}>
            <AppText
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                color: colors.primary,
                textAlign: align,
              }}
            >
              {t.piPasswordCardTitle}
            </AppText>
            <AppText
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                color: colors.mutedForeground,
                textAlign: align,
              }}
            >
              {t.piPasswordCardHelp}
            </AppText>
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <Pressable
              onPress={onChangePassword}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: colors.primary,
                borderRadius: 999,
                paddingVertical: 14,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {(
                <AppText
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    color: colors.primary,
                    fontSize: 13,
                    letterSpacing: 1,
                  }}
                >
                  {t.piPasswordChange}
                </AppText>
              )}
            </Pressable>
          </View>
        </Card>
      </ScrollView>

      {/* ── Phone update sheet ── */}
      <BottomSheet visible={phoneOpen} onClose={() => setPhoneOpen(false)}>
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 16 }}>
          <AppText
            style={{
              fontFamily: headingFontMedium,
              fontSize: 22,
              color: colors.primary,
              textAlign: align,
            }}
          >
            {t.piPhoneCardTitle}
          </AppText>
          <PhoneField
            label={t.piPhoneCardTitle}
            value={phoneLocal}
            onChangeText={(v) => {
              setPhoneLocal(v);
              if (phoneError) setPhoneError(null);
            }}
            countryCode={phoneCountry.code}
            onChangeCountry={(c) => {
              setPhoneCountry(c);
              if (phoneError) setPhoneError(null);
            }}
          />
          {phoneError ? (
            <AppText
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                color: "#c0392b",
                textAlign: align,
              }}
            >
              {phoneError}
            </AppText>
          ) : null}
          <Pressable
            onPress={onUpdatePhone}
            disabled={phoneBusy}
            style={({ pressed }) => ({
              backgroundColor: colors.primary,
              borderRadius: 999,
              paddingVertical: 16,
              alignItems: "center",
              opacity: phoneBusy ? 0.6 : pressed ? 0.85 : 1,
            })}
          >
            {phoneBusy ? (
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
    </KeyboardAvoidingView>
  );
}

type Colors = ReturnType<typeof useColors>;

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

function Field({
  label,
  required,
  colors,
  align,
  children,
}: {
  label: string;
  required?: boolean;
  colors: Colors;
  align: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, gap: 8 }}>
      <AppText
        style={{
          fontFamily: "Inter_500Medium",
          fontSize: 12,
          color: colors.primary,
          letterSpacing: 0.4,
          textAlign: align,
        }}
      >
        {label}
        {required ? <AppText style={{ color: colors.gold }}> *</AppText> : null}
      </AppText>
      {children}
    </View>
  );
}

function inputStyle(colors: Colors, align: "left" | "right") {
  return {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: "Inter_400Regular" as const,
    fontSize: 15,
    color: colors.primary,
    textAlign: align,
    backgroundColor: "#fff",
  };
}

function BirthdayBox({
  value,
  onChange,
  placeholder,
  maxLength,
  colors,
  flex,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength: number;
  colors: Colors;
  flex: number;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={(v) => onChange(v.replace(/\D/g, ""))}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground}
      keyboardType="number-pad"
      maxLength={maxLength}
      style={{
        flex,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 13,
        fontFamily: "Inter_500Medium",
        fontSize: 15,
        color: colors.primary,
        textAlign: "center",
        backgroundColor: "#fff",
      }}
    />
  );
}

export default withRouteErrorBoundary(PersonalInformationScreen, "personal-information");
