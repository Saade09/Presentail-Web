import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { completePasswordReset } from "@/services/authService";
import { passwordMeetsAll, passwordRequirements } from "@/utils/validation";

export default function ResetPasswordScreen() {
  const colors = useColors();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isRTL } = useLanguage();
  const align = isRTL ? "right" : "left";
  const params = useLocalSearchParams<{ key?: string; login?: string }>();
  const key = String(params.key ?? "");
  const login = String(params.login ?? "");
  const hasLink = key.length > 0 && login.length > 0;

  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    hasLink ? null : t.authResetMissingLink,
  );
  const [success, setSuccess] = useState(false);

  const reqs = passwordRequirements(password);
  const canSubmit = hasLink && !busy && passwordMeetsAll(password);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/account");
  };

  const onSubmit = async () => {
    if (!hasLink) {
      setErrorMessage(t.authResetMissingLink);
      return;
    }
    if (!passwordMeetsAll(password)) return;
    setErrorMessage(null);
    setBusy(true);
    const r = await completePasswordReset({ key, login, password });
    setBusy(false);
    if (!r.ok) {
      if (r.code === "expired_link") setErrorMessage(t.authResetExpired);
      else if (r.code === "weak_password") setErrorMessage(t.authResetWeak);
      else if (r.code === "missing_link") setErrorMessage(t.authResetMissingLink);
      else if (r.code === "network") setErrorMessage(t.authNetworkError);
      else setErrorMessage(r.serverMessage || t.authGenericError);
      return;
    }
    setSuccess(true);
  };

  const onSignIn = () => {
    router.replace("/auth");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          paddingTop: insets.top + 6,
          paddingBottom: 8,
          paddingHorizontal: 12,
        }}
      >
        <Pressable
          onPress={close}
          hitSlop={12}
          accessibilityLabel={t.authClose}
          style={({ pressed }) => ({
            padding: 8,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="x" size={24} color={colors.primary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 24) + 32,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {success ? (
            <View style={{ gap: 24 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.muted ?? "#F1ECE2",
                  alignSelf: isRTL ? "flex-end" : "flex-start",
                }}
              >
                <Feather name="check-circle" size={28} color={colors.primary} />
              </View>
              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    fontFamily: "PlayfairDisplay_500Medium",
                    fontSize: 28,
                    color: colors.primary,
                    textAlign: align,
                  }}
                >
                  {t.authResetSuccessTitle}
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 14,
                    color: colors.mutedForeground,
                    textAlign: align,
                    lineHeight: 20,
                  }}
                >
                  {t.authResetSuccessBody}
                </Text>
              </View>
              <Pressable
                onPress={onSignIn}
                style={({ pressed }) => ({
                  backgroundColor: colors.primary,
                  paddingVertical: 16,
                  borderRadius: 14,
                  alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 14,
                    letterSpacing: 0.6,
                  }}
                >
                  {t.authResetSuccessBtn}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 22 }}>
              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    fontFamily: "PlayfairDisplay_500Medium",
                    fontSize: 28,
                    color: colors.primary,
                    textAlign: align,
                  }}
                >
                  {t.authResetTitle}
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 14,
                    color: colors.mutedForeground,
                    textAlign: align,
                    lineHeight: 20,
                  }}
                >
                  {t.authResetSubtitle}
                </Text>
              </View>

              {hasLink ? (
                <View
                  style={{
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_400Regular",
                      fontSize: 15,
                      color: colors.primary,
                      textAlign: align,
                    }}
                    numberOfLines={1}
                  >
                    {login}
                  </Text>
                </View>
              ) : null}

              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: colors.mutedForeground,
                    textAlign: align,
                  }}
                >
                  {t.authCreatePasswordLabel}
                </Text>
                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: errorMessage ? colors.destructive : colors.border,
                    borderRadius: 12,
                    paddingHorizontal: 16,
                  }}
                >
                  <TextInput
                    value={password}
                    onChangeText={(v) => {
                      setPassword(v);
                      if (errorMessage && hasLink) setErrorMessage(null);
                    }}
                    placeholder={t.authCreatePasswordPlaceholder}
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry={!show}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!busy && hasLink}
                    style={{
                      flex: 1,
                      fontFamily: "Inter_400Regular",
                      fontSize: 15,
                      color: colors.primary,
                      paddingVertical: 16,
                      textAlign: align,
                      writingDirection: isRTL ? "rtl" : "ltr",
                    }}
                  />
                  <Pressable
                    onPress={() => setShow((s) => !s)}
                    hitSlop={10}
                    accessibilityLabel={
                      show ? t.authHidePassword : t.authShowPassword
                    }
                    style={{ padding: 6 }}
                  >
                    <Feather
                      name={show ? "eye-off" : "eye"}
                      size={18}
                      color={colors.mutedForeground}
                    />
                  </Pressable>
                </View>
              </View>

              <View style={{ gap: 8, marginTop: -4 }}>
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: colors.mutedForeground,
                    textAlign: align,
                  }}
                >
                  {t.authPasswordMustContain}
                </Text>
                <Requirement
                  isRTL={isRTL}
                  met={reqs.lower}
                  label={t.authReqLower}
                  colors={colors}
                />
                <Requirement
                  isRTL={isRTL}
                  met={reqs.upper}
                  label={t.authReqUpper}
                  colors={colors}
                />
                <Requirement
                  isRTL={isRTL}
                  met={reqs.lengthAndNumber}
                  label={t.authReqLengthNumber}
                  colors={colors}
                />
              </View>

              {errorMessage ? (
                <Text
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 12,
                    color: colors.destructive,
                    textAlign: align,
                  }}
                >
                  {errorMessage}
                </Text>
              ) : null}

              <Pressable
                disabled={!canSubmit}
                onPress={onSubmit}
                style={({ pressed }) => ({
                  backgroundColor: colors.primary,
                  paddingVertical: 16,
                  borderRadius: 14,
                  alignItems: "center",
                  opacity: !canSubmit ? 0.45 : pressed ? 0.85 : 1,
                })}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    style={{
                      color: "#fff",
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 14,
                      letterSpacing: 0.6,
                    }}
                  >
                    {t.authResetSubmit}
                  </Text>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Requirement({
  met,
  label,
  isRTL,
  colors,
}: {
  met: boolean;
  label: string;
  isRTL: boolean;
  colors: { primary: string; mutedForeground: string };
}) {
  const tone = met ? colors.primary : colors.mutedForeground;
  return (
    <View
      style={{
        flexDirection: isRTL ? "row-reverse" : "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Feather name={met ? "check-circle" : "circle"} size={16} color={tone} />
      <Text
        style={{
          fontFamily: met ? "Inter_500Medium" : "Inter_400Regular",
          fontSize: 13,
          color: tone,
          textAlign: isRTL ? "right" : "left",
          flex: 1,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
