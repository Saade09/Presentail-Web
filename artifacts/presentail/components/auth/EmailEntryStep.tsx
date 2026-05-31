import React from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";

import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/hooks/useT";
import { useTypography } from "@/hooks/useTypography";

import { SocialAuthButtons } from "./SocialAuthButtons";

type Props = {
  email: string;
  onEmailChange: (v: string) => void;
  emailError: string | null;
  busy: boolean;
  socialBusy: "apple" | "google" | null;
  onContinue: () => void;
  onApple: () => void;
  onGoogle: () => void;
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
};

export function EmailEntryStep({
  email,
  onEmailChange,
  emailError,
  busy,
  socialBusy,
  onContinue,
  onApple,
  onGoogle,
  onOpenPrivacy,
  onOpenTerms,
}: Props) {
  const colors = useColors();
  const typo = useTypography();
  const t = useT();
  const { isRTL } = useLanguage();
  const align = isRTL ? "right" : "left";

  const proceedTpl = t.authProceedAgree;
  const [beforePrivacy, afterPrivacy] = proceedTpl.split("{privacy}");
  const [betweenLinks, afterTerms] = (afterPrivacy ?? "").split("{terms}");

  const anyBusy = busy || socialBusy !== null;

  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 8 }}>
        <AppText
          style={{
            fontFamily: "PlayfairDisplay_500Medium",
            fontSize: 28,
            color: colors.primary,
            textAlign: align,
          }}
        >
          {t.authTitle}
        </AppText>
        <AppText
          style={{
            fontFamily: typo.regular,
            fontSize: 14,
            color: colors.mutedForeground,
            textAlign: align,
            lineHeight: 20,
          }}
        >
          {t.authSubtitle}
        </AppText>
      </View>

      <View style={{ gap: 8 }}>
        <AppText
          style={{
            fontFamily: typo.medium,
            fontSize: 12,
            color: colors.mutedForeground,
            textAlign: align,
          }}
        >
          {t.authEmailLabel}
        </AppText>
        <TextInput
          value={email}
          onChangeText={onEmailChange}
          placeholder={t.authEmailPlaceholder}
          placeholderTextColor={colors.mutedForeground}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          autoCorrect={false}
          editable={!anyBusy}
          onSubmitEditing={onContinue}
          returnKeyType="next"
          style={{
            fontFamily: typo.regular,
            fontSize: 15,
            color: colors.primary,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: emailError ? colors.destructive : colors.border,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 16,
            textAlign: align,
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        />
        {emailError ? (
          <AppText
            style={{
              fontFamily: typo.regular,
              fontSize: 12,
              color: colors.destructive,
              textAlign: align,
            }}
          >
            {emailError}
          </AppText>
        ) : null}
      </View>

      <Pressable
        disabled={anyBusy}
        onPress={onContinue}
        style={({ pressed }) => ({
          backgroundColor: colors.primary,
          paddingVertical: 16,
          borderRadius: 14,
          alignItems: "center",
          opacity: anyBusy ? 0.7 : pressed ? 0.85 : 1,
        })}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <AppText
            style={{
              color: "#fff",
              fontFamily: typo.semibold,
              fontSize: 14,
              letterSpacing: 0.6,
            }}
          >
            {t.authContinue}
          </AppText>
        )}
      </Pressable>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <AppText
          style={{
            fontFamily: typo.medium,
            fontSize: 12,
            color: colors.mutedForeground,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          {t.authOr}
        </AppText>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>

      <SocialAuthButtons
        busyProvider={socialBusy}
        disabled={anyBusy}
        onApple={onApple}
        onGoogle={onGoogle}
      />

      <AppText
        style={{
          fontFamily: typo.regular,
          fontSize: 12,
          color: colors.mutedForeground,
          textAlign: "center",
          lineHeight: 18,
          paddingHorizontal: 4,
        }}
      >
        {beforePrivacy}
        <AppText
          onPress={onOpenPrivacy}
          style={{
            fontFamily: typo.semibold,
            color: colors.primary,
            textDecorationLine: "underline",
          }}
        >
          {t.authPrivacyLink}
        </AppText>
        {betweenLinks}
        <AppText
          onPress={onOpenTerms}
          style={{
            fontFamily: typo.semibold,
            color: colors.primary,
            textDecorationLine: "underline",
          }}
        >
          {t.authTermsLink}
        </AppText>
        {afterTerms}
      </AppText>
    </View>
  );
}
