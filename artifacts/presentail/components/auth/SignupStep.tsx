import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";

import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";
import { passwordRequirements, passwordMeetsAll } from "@/utils/validation";

type Props = {
  firstName: string;
  lastName: string;
  password: string;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  busy: boolean;
  errorMessage: string | null;
  onSubmit: () => void;
  /**
   * Optional escape hatch shown as a link below the create-account button.
   * Lets shoppers who landed here by mistake — typically because the
   * `/auth/exists` lookup was inconclusive and the system couldn't be
   * sure their account existed — jump straight to the password-login
   * step without re-typing their email.
   */
  onAlreadyHaveAccount?: () => void;
};

export function SignupStep({
  firstName,
  lastName,
  password,
  onFirstNameChange,
  onLastNameChange,
  onPasswordChange,
  busy,
  errorMessage,
  onSubmit,
  onAlreadyHaveAccount,
}: Props) {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const t = useT();
  const { isRTL } = useLanguage();
  const align = isRTL ? "right" : "left";
  const [show, setShow] = useState(false);

  const reqs = passwordRequirements(password);
  const canSubmit =
    !busy &&
    firstName.trim().length > 0 &&
    passwordMeetsAll(password);

  const submitLabel = t.authContinue;

  const inputStyle = {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.primary,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    textAlign: align,
    writingDirection: isRTL ? "rtl" : "ltr",
  } as const;

  const labelStyle = {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: colors.mutedForeground,
    textAlign: align,
  } as const;

  return (
    <View style={{ gap: 22 }}>
      <View style={{ gap: 8 }}>
        <AppText
          style={{
            fontFamily: headingFontMedium,
            fontSize: 28,
            color: colors.primary,
            textAlign: align,
          }}
        >
          {t.authSignUpTitle}
        </AppText>
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            color: colors.mutedForeground,
            textAlign: align,
            lineHeight: 20,
          }}
        >
          {t.authSignUpSubtitle}
        </AppText>
      </View>

      <View style={{ gap: 8 }}>
        <AppText style={labelStyle}>{t.authFirstNameLabel}</AppText>
        <TextInput
          value={firstName}
          onChangeText={onFirstNameChange}
          placeholder={t.authFirstNamePlaceholder}
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          editable={!busy}
          returnKeyType="next"
          style={inputStyle}
        />
      </View>

      <View style={{ gap: 8 }}>
        <AppText style={labelStyle}>{t.authLastNameLabel}</AppText>
        <TextInput
          value={lastName}
          onChangeText={onLastNameChange}
          placeholder={t.authLastNamePlaceholder}
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="words"
          autoComplete="family-name"
          textContentType="familyName"
          editable={!busy}
          returnKeyType="next"
          style={inputStyle}
        />
      </View>

      <View style={{ gap: 8 }}>
        <AppText style={labelStyle}>{t.authCreatePasswordLabel}</AppText>
        <View
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingHorizontal: 16,
          }}
        >
          <TextInput
            value={password}
            onChangeText={onPasswordChange}
            placeholder={t.authCreatePasswordPlaceholder}
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry={!show}
            autoComplete="new-password"
            textContentType="newPassword"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
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
            accessibilityLabel={show ? t.authHidePassword : t.authShowPassword}
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
        <AppText style={labelStyle}>{t.authPasswordMustContain}</AppText>
        <Requirement isRTL={isRTL} met={reqs.lower} label={t.authReqLower} />
        <Requirement isRTL={isRTL} met={reqs.upper} label={t.authReqUpper} />
        <Requirement isRTL={isRTL} met={reqs.lengthAndNumber} label={t.authReqLengthNumber} />
      </View>

      {errorMessage ? (
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            color: colors.destructive,
            textAlign: align,
          }}
        >
          {errorMessage}
        </AppText>
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
          <AppText
            style={{
              color: "#fff",
              fontFamily: "Inter_600SemiBold",
              fontSize: 14,
              letterSpacing: 0.6,
            }}
          >
            {submitLabel}
          </AppText>
        )}
      </Pressable>

      {onAlreadyHaveAccount ? (
        <Pressable
          onPress={onAlreadyHaveAccount}
          disabled={busy}
          hitSlop={8}
          accessibilityRole="link"
          style={({ pressed }) => ({
            alignItems: "center",
            opacity: busy ? 0.5 : pressed ? 0.6 : 1,
            marginTop: -6,
          })}
        >
          <AppText
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 13,
              color: colors.primary,
              textDecorationLine: "underline",
              textAlign: "center",
            }}
          >
            {t.authAlreadyHaveAccount}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function Requirement({ met, label, isRTL }: { met: boolean; label: string; isRTL: boolean }) {
  const colors = useColors();
  const tone = met ? colors.primary : colors.mutedForeground;
  return (
    <View
      style={{
        flexDirection: isRTL ? "row-reverse" : "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Feather
        name={met ? "check-circle" : "circle"}
        size={16}
        color={tone}
      />
      <AppText
        style={{
          fontFamily: met ? "Inter_500Medium" : "Inter_400Regular",
          fontSize: 13,
          color: tone,
          textAlign: isRTL ? "right" : "left",
          flex: 1,
        }}
      >
        {label}
      </AppText>
    </View>
  );
}
