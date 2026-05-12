import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "@/components/BottomSheet";
import { PhoneField } from "@/components/PhoneField";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { COUNTRY_DIAL_CODES, type CountryDialCode } from "@/data/countryCodes";
import { useAuth, type AuthGender } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
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
      return {
        country: match,
        local: compact.slice(match.dial.length).replace(/^[\s-]+/, ""),
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
  const [shareBirthday, setShareBirthday] = useState<boolean>(
    user?.birthdayShareMonthDay ?? true,
  );

  const initialPhoneSplit = useMemo(() => splitPhone(user?.phone), [user?.phone]);
  const [phoneCountry, setPhoneCountry] = useState<CountryDialCode>(
    initialPhoneSplit.country,
  );
  const [phoneLocal, setPhoneLocal] = useState<string>(initialPhoneSplit.local);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [bdayError, setBdayError] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(false);

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
        setShareBirthday(
          typeof u.birthdayShareMonthDay === "boolean" ? u.birthdayShareMonthDay : true,
        );
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
      birthdayShareMonthDay: shareBirthday,
    });
    setBusy(false);
    if (!r.ok) {
      Alert.alert(t.piErrorTitle, r.message || t.piErrorGeneric);
      return;
    }
    Alert.alert(t.piUpdatedTitle, t.piUpdatedMsg);
  };

  const onUpdatePhone = async () => {
    const local = phoneLocal.trim();
    const phoneValue = local ? `${phoneCountry.dial} ${local}`.trim() : "";
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
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            color: colors.primary,
            paddingHorizontal: 32,
            textAlign: "center",
          }}
        >
          {t.piSignInRequired}
        </Text>
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
        <Text
          style={{
            flex: 1,
            fontFamily: "PlayfairDisplay_500Medium",
            fontSize: 22,
            color: "#fff",
            textAlign: "center",
            marginRight: isRTL ? 0 : 28,
            marginLeft: isRTL ? 28 : 0,
          }}
        >
          {t.personalInfoTitle}
        </Text>
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
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 15,
                  color: colors.primary,
                  textAlign: align,
                }}
              >
                {user.email}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 11,
                color: colors.mutedForeground,
                marginTop: 6,
                textAlign: align,
              }}
            >
              {t.piEmailHelper}
            </Text>
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
                  <Text
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
                  </Text>
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
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                  color: "#c0392b",
                  marginTop: 6,
                  textAlign: align,
                }}
              >
                {bdayError}
              </Text>
            ) : null}

            <View
              style={{
                marginTop: 14,
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Switch
                value={shareBirthday}
                onValueChange={setShareBirthday}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#fff"
              />
              <Text
                style={{
                  flex: 1,
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: colors.primary,
                  textAlign: align,
                }}
              >
                {t.piBirthdaySharingOn}
              </Text>
            </View>

            <Pressable
              onPress={() => setHowItWorksOpen(true)}
              style={({ pressed }) => ({
                marginTop: 8,
                opacity: pressed ? 0.7 : 1,
                alignSelf: isRTL ? "flex-end" : "flex-start",
              })}
            >
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: colors.primary,
                  textDecorationLine: "underline",
                }}
              >
                {t.piBirthdayHowItWorks}
              </Text>
            </Pressable>
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
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    color: "#fff",
                    fontSize: 14,
                    letterSpacing: 1,
                  }}
                >
                  {t.piUpdate}
                </Text>
              )}
            </Pressable>
          </View>
        </Card>

        {/* ── Phone card ── */}
        <Card colors={colors}>
          <View style={{ padding: 16, gap: 4 }}>
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                color: colors.primary,
                textAlign: align,
              }}
            >
              {t.piPhoneCardTitle}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 14,
                color: colors.mutedForeground,
                textAlign: align,
              }}
            >
              {phoneLocal ? `${phoneCountry.dial} ${phoneLocal}` : t.piPhoneNotSet}
            </Text>
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
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  color: colors.primary,
                  fontSize: 13,
                  letterSpacing: 1,
                }}
              >
                {t.piPhoneChange}
              </Text>
            </Pressable>
          </View>
        </Card>

        {/* ── Password card ── */}
        <Card colors={colors}>
          <View style={{ padding: 16, gap: 4 }}>
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                color: colors.primary,
                textAlign: align,
              }}
            >
              {t.piPasswordCardTitle}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                color: colors.mutedForeground,
                textAlign: align,
              }}
            >
              {t.piPasswordCardHelp}
            </Text>
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
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    color: colors.primary,
                    fontSize: 13,
                    letterSpacing: 1,
                  }}
                >
                  {t.piPasswordChange}
                </Text>
              )}
            </Pressable>
          </View>
        </Card>
      </ScrollView>

      {/* ── How it works sheet ── */}
      <BottomSheet visible={howItWorksOpen} onClose={() => setHowItWorksOpen(false)}>
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 12 }}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: 22,
              color: colors.primary,
              textAlign: align,
            }}
          >
            {t.piHowItWorksTitle}
          </Text>
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              lineHeight: 22,
              color: colors.primary,
              textAlign: align,
            }}
          >
            {t.piHowItWorksBody}
          </Text>
        </View>
      </BottomSheet>

      {/* ── Phone update sheet ── */}
      <BottomSheet visible={phoneOpen} onClose={() => setPhoneOpen(false)}>
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 16 }}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: 22,
              color: colors.primary,
              textAlign: align,
            }}
          >
            {t.piPhoneCardTitle}
          </Text>
          <PhoneField
            label={t.piPhoneCardTitle}
            value={phoneLocal}
            onChangeText={setPhoneLocal}
            countryCode={phoneCountry.code}
            onChangeCountry={setPhoneCountry}
          />
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
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  color: "#fff",
                  fontSize: 14,
                  letterSpacing: 1,
                }}
              >
                {t.piUpdate}
              </Text>
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
      <Text
        style={{
          fontFamily: "Inter_500Medium",
          fontSize: 12,
          color: colors.primary,
          letterSpacing: 0.4,
          textAlign: align,
        }}
      >
        {label}
        {required ? <Text style={{ color: colors.gold }}> *</Text> : null}
      </Text>
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
