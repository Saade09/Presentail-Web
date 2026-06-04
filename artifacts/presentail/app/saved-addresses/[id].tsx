import { Feather } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import {
  type CustomerAddressInput,
  getListMyAddressesQueryKey,
  useCreateMyAddress,
  useListMyAddresses,
  useUpdateMyAddress,
} from "@workspace/api-client-react";

import { useAuth } from "@/contexts/AuthContext";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";
import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js";
import { COUNTRY_DIAL_CODES, type CountryDialCode } from "@/data/countryCodes";
import { districtsForCountry, type District } from "@/data/districts";
import { PhoneField } from "@/components/PhoneField";

const DELIVERY_COUNTRIES = ["LB", "AE", "CY"] as const;
const DELIVERY_DIAL_CODES = COUNTRY_DIAL_CODES.filter((c) =>
  (DELIVERY_COUNTRIES as readonly string[]).includes(c.code),
);

const colors = {
  primary: "#1a1a1a",
  border: "#e5dfd4",
  mutedForeground: "#7a7264",
  gold: "#b08948",
  background: "#faf7f2",
};

type LabelOpt = "home" | "work" | "other";

export default function SavedAddressFormScreen() {
  const headingFontSemiBold = useHeadingFont("600SemiBold");
  const t = useT();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const idStr = Array.isArray(id) ? id[0] : id;
  const isNew = !idStr || idStr === "new";
  const numericId = isNew ? null : Number(idStr);

  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useListMyAddresses({
    query: { queryKey: getListMyAddressesQueryKey(), enabled: !!user },
  });
  const createMut = useCreateMyAddress();
  const updateMut = useUpdateMyAddress();

  const existing = useMemo(() => {
    if (isNew || numericId == null || !data) return null;
    return data.addresses.find((a) => a.id === numericId) ?? null;
  }, [isNew, numericId, data]);

  const [label, setLabel] = useState<LabelOpt>("home");
  const [nickname, setNickname] = useState("");
  const [country, setCountry] = useState<CountryDialCode>(
    DELIVERY_DIAL_CODES.find((c) => c.code === "LB") ?? DELIVERY_DIAL_CODES[0],
  );
  const [district, setDistrict] = useState<District | null>(null);
  const [addressLine, setAddressLine] = useState("");
  const [recipientFirst, setRecipientFirst] = useState("");
  const [recipientLast, setRecipientLast] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientPhoneCountry, setRecipientPhoneCountry] =
    useState<CountryDialCode>(
      COUNTRY_DIAL_CODES.find((c) => c.code === "LB") ?? COUNTRY_DIAL_CODES[0],
    );
  const [countryOpen, setCountryOpen] = useState(false);
  const [districtOpen, setDistrictOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [phoneShowError, setPhoneShowError] = useState(false);

  const districtList = useMemo(
    () => districtsForCountry(country.code),
    [country.code],
  );

  useEffect(() => {
    if (hydrated) return;
    if (existing) {
      setLabel((existing.label as LabelOpt) ?? "home");
      setNickname(existing.nickname ?? "");
      const matched = DELIVERY_DIAL_CODES.find((c) => c.code === existing.countryCode);
      if (matched) setCountry(matched);
      const list = districtsForCountry(existing.countryCode);
      const matchedDistrict =
        list.find(
          (d) =>
            d.name.trim().toLowerCase() ===
            existing.district.trim().toLowerCase(),
        ) ?? null;
      setDistrict(matchedDistrict);
      // Merge any legacy building / apartment / directions detail into the
      // combined address line so editing an old saved address doesn't
      // silently drop information captured under the old multi-field form.
      setAddressLine(
        [
          existing.addressLine,
          existing.building && `Bldg: ${existing.building}`,
          existing.apartment && `Apt/Floor: ${existing.apartment}`,
          existing.directions,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      setRecipientFirst(existing.recipientFirstName ?? "");
      setRecipientLast(existing.recipientLastName ?? "");
      setRecipientPhone(existing.recipientPhone ?? "");
      if (existing.recipientPhoneCountryCode) {
        const matchedDial = COUNTRY_DIAL_CODES.find(
          (c) => c.dial === existing.recipientPhoneCountryCode,
        );
        if (matchedDial) setRecipientPhoneCountry(matchedDial);
      } else if (matched) {
        setRecipientPhoneCountry(matched);
      }
      setHydrated(true);
    } else if (isNew) {
      setHydrated(true);
    }
  }, [existing, isNew, hydrated]);

  // When the country changes, clear any selected district that no longer
  // belongs to the new country's list so we don't ship a mismatched value.
  useEffect(() => {
    if (!hydrated) return;
    if (district && !districtList.some((d) => d.name === district.name)) {
      setDistrict(null);
    }
  }, [country.code, hydrated, district, districtList]);

  const saving = createMut.isPending || updateMut.isPending;

  const onSave = () => {
    const trimmedAddress = addressLine.trim();
    if (!district || !trimmedAddress) {
      Alert.alert(t.addressFormError, t.addressFormMissingFields);
      return;
    }
    const trimmedPhone = recipientPhone.trim();
    if (trimmedPhone) {
      let phoneValid = true;
      try {
        phoneValid = isValidPhoneNumber(trimmedPhone, recipientPhoneCountry.code as CountryCode);
      } catch {
        phoneValid = false;
      }
      if (!phoneValid) {
        setPhoneShowError(true);
        return;
      }
    }
    const payload: CustomerAddressInput = {
      label,
      nickname: nickname.trim() ? nickname.trim() : null,
      countryCode: country.code,
      district: district.name,
      addressLine: trimmedAddress,
      apartment: null,
      building: null,
      directions: null,
      recipientFirstName: recipientFirst.trim() ? recipientFirst.trim() : null,
      recipientLastName: recipientLast.trim() ? recipientLast.trim() : null,
      recipientPhoneCountryCode: trimmedPhone ? recipientPhoneCountry.dial : null,
      recipientPhone: trimmedPhone ? trimmedPhone : null,
      isDefault: false,
    };
    const onDone = () => {
      qc.invalidateQueries({ queryKey: getListMyAddressesQueryKey() });
      router.back();
    };
    const onError = (err: unknown) => {
      const e = err as
        | { status?: number; data?: { message?: string } | null; message?: string }
        | null;
      const status = e?.status;
      const serverMsg =
        (typeof e?.data?.message === "string" && e.data.message.trim()) ||
        (typeof e?.message === "string" && e.message.trim()) ||
        "";
      // 401/403 means the auth token isn't valid for this store anymore (most
      // commonly: the session was minted in a different country store, or the
      // WP JWT has expired). Tell the user to sign back in instead of showing
      // a generic "try again" message that they'd just keep retrying.
      if (status === 401 || status === 403) {
        Alert.alert(
          t.addressFormError,
          t.addressFormSessionExpired,
          [
            { text: t.addressFormSignInAgain, style: "default" },
          ],
        );
        return;
      }
      Alert.alert(
        t.addressFormError,
        serverMsg ? `${t.addressFormSaveFailed}\n\n${serverMsg}` : t.addressFormSaveFailed,
      );
    };
    if (isNew || numericId == null) {
      createMut.mutate({ data: payload }, { onSuccess: onDone, onError });
    } else {
      updateMut.mutate({ id: numericId, data: payload }, { onSuccess: onDone, onError });
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header title={isNew ? t.addressFormNewTitle : t.addressFormEditTitle} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <AppText style={{ color: colors.mutedForeground, textAlign: "center" }}>
            {t.savedAddressesSignInRequired}
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (!isNew && (isLoading || !hydrated)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header title={t.addressFormEditTitle} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header title={isNew ? t.addressFormNewTitle : t.addressFormEditTitle} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 16 }} keyboardShouldPersistTaps="handled">
          <FieldGroup label={t.addressFormLabelField} required>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["home", "work", "other"] as const).map((opt) => (
                <LabelChip key={opt} active={label === opt} text={
                  opt === "home" ? t.addressLabelHome : opt === "work" ? t.addressLabelWork : t.addressLabelOther
                } onPress={() => setLabel(opt)} />
              ))}
            </View>
          </FieldGroup>

          <FieldGroup label={t.addressFormNickname} hint={t.addressFormNicknameHint}>
            <Input value={nickname} onChangeText={setNickname} placeholder={t.addressFormNicknamePlaceholder} />
          </FieldGroup>

          <FieldGroup label={t.addressFormCountry} required>
            <Pressable
              onPress={() => setCountryOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                backgroundColor: "#fff",
                paddingHorizontal: 14,
                paddingVertical: 13,
              }}
            >
              <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.primary }}>
                {country.flag} {country.name}
              </AppText>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </Pressable>
          </FieldGroup>

          <FieldGroup label={t.addressFormDistrict} required>
            <Pressable
              onPress={() => setDistrictOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                backgroundColor: "#fff",
                paddingHorizontal: 14,
                paddingVertical: 13,
              }}
            >
              <AppText
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 14,
                  color: district ? colors.primary : "#bbb1a0",
                }}
              >
                {district ? district.name : t.addressFormDistrictPlaceholder}
              </AppText>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </Pressable>
          </FieldGroup>

          <FieldGroup
            label={t.addressFormAddressLine}
            hint={t.addressFormAddressLineHint}
            required
          >
            <Input
              value={addressLine}
              onChangeText={setAddressLine}
              placeholder={t.addressFormAddressLinePlaceholder}
              multiline
            />
          </FieldGroup>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FieldGroup label={t.addressFormRecipientFirst}>
                <Input
                  value={recipientFirst}
                  onChangeText={setRecipientFirst}
                  placeholder={t.addressFormRecipientFirstPlaceholder}
                />
              </FieldGroup>
            </View>
            <View style={{ flex: 1 }}>
              <FieldGroup label={t.addressFormRecipientLast}>
                <Input
                  value={recipientLast}
                  onChangeText={setRecipientLast}
                  placeholder={t.addressFormRecipientLastPlaceholder}
                />
              </FieldGroup>
            </View>
          </View>

          <PhoneField
            label={t.addressFormRecipientPhone}
            value={recipientPhone}
            onChangeText={(v) => { setPhoneShowError(false); setRecipientPhone(v); }}
            countryCode={recipientPhoneCountry.code}
            onChangeCountry={(c) => { setPhoneShowError(false); setRecipientPhoneCountry(c); }}
            showError={phoneShowError}
          />

        </ScrollView>

        <View style={{ position: "absolute", left: 16, right: 16, bottom: 24 }}>
          <Pressable
            onPress={onSave}
            disabled={saving}
            style={({ pressed }) => ({
              backgroundColor: saving ? "#c2a572" : pressed ? "#8c6d39" : colors.gold,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
            })}
          >
            <AppText style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
              {saving ? t.addressFormSaving : t.addressFormSave}
            </AppText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={districtOpen} transparent animationType="slide" onRequestClose={() => setDistrictOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setDistrictOpen(false)} />
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "#fff",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "72%",
            paddingBottom: 32,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f0ebe3" }}>
            <AppText style={{ fontFamily: headingFontSemiBold, fontSize: 17, color: colors.primary }}>{t.addressFormDistrict}</AppText>
            <Pressable onPress={() => setDistrictOpen(false)}>
              <Feather name="x" size={20} color={colors.primary} />
            </Pressable>
          </View>
          <FlatList
            data={districtList}
            keyExtractor={(item) => item.name}
            renderItem={({ item }) => {
              const selected = district?.name === item.name;
              return (
                <Pressable
                  onPress={() => {
                    setDistrict(item);
                    setDistrictOpen(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 20,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: "#f7f4ef",
                    backgroundColor: selected ? "#f9f6f1" : "#fff",
                    gap: 12,
                  }}
                >
                  <AppText style={{ flex: 1, fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular", fontSize: 15, color: colors.primary }}>
                    {item.name}
                  </AppText>
                  {selected ? <Feather name="check" size={16} color={colors.gold} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>

      <Modal visible={countryOpen} transparent animationType="slide" onRequestClose={() => setCountryOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setCountryOpen(false)} />
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "#fff",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "72%",
            paddingBottom: 32,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f0ebe3" }}>
            <AppText style={{ fontFamily: headingFontSemiBold, fontSize: 17, color: colors.primary }}>{t.addressFormCountry}</AppText>
            <Pressable onPress={() => setCountryOpen(false)}>
              <Feather name="x" size={20} color={colors.primary} />
            </Pressable>
          </View>
          <FlatList
            data={DELIVERY_DIAL_CODES}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => {
              const selected = item.code === country.code;
              return (
                <Pressable
                  onPress={() => {
                    setCountry(item);
                    setCountryOpen(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 20,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: "#f7f4ef",
                    backgroundColor: selected ? "#f9f6f1" : "#fff",
                    gap: 12,
                  }}
                >
                  <AppText style={{ fontSize: 20 }}>{item.flag}</AppText>
                  <AppText style={{ flex: 1, fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular", fontSize: 15, color: colors.primary }}>
                    {item.name}
                  </AppText>
                  {selected ? <Feather name="check" size={16} color={colors.gold} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Header({ title }: { title: string }) {
  const headingFontSemiBold = useHeadingFont("600SemiBold");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: "#fff",
      }}
    >
      <Pressable onPress={() => router.back()} style={{ padding: 8 }} hitSlop={8}>
        <Feather name="chevron-left" size={22} color={colors.primary} />
      </Pressable>
      <AppText
        style={{
          flex: 1,
          fontFamily: headingFontSemiBold,
          fontSize: 18,
          color: colors.primary,
          textAlign: "center",
          marginRight: 38,
        }}
      >
        {title}
      </AppText>
    </View>
  );
}

function FieldGroup({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <AppText style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" }}>
        {label}
        {required ? <AppText style={{ color: "#c0392b" }}> *</AppText> : null}
      </AppText>
      {children}
      {hint ? (
        <AppText style={{ color: colors.mutedForeground, fontSize: 11 }}>{hint}</AppText>
      ) : null}
    </View>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      placeholderTextColor="#bbb1a0"
      style={[
        {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          backgroundColor: "#fff",
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: colors.primary,
          fontFamily: "Inter_400Regular",
          fontSize: 14,
          minHeight: props.multiline ? 70 : undefined,
          textAlignVertical: props.multiline ? "top" : "auto",
        },
        props.style as object,
      ]}
    />
  );
}

function LabelChip({ active, text, onPress }: { active: boolean; text: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? colors.gold : colors.border,
        backgroundColor: active ? "#f4ead6" : "#fff",
      }}
    >
      <AppText style={{ color: active ? colors.gold : colors.primary, fontFamily: "Inter_500Medium", fontSize: 13 }}>
        {text}
      </AppText>
    </Pressable>
  );
}
