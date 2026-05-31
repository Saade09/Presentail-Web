import React from "react";
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
import { useT } from "@/hooks/useT";

type Props = {
  email: string;
  onEmailChange: (v: string) => void;
  errorMessage: string | null;
  busy: boolean;
  onSubmit: () => void;
};

export function ForgotPasswordStep({
  email,
  onEmailChange,
  errorMessage,
  busy,
  onSubmit,
}: Props) {
  const colors = useColors();
  const t = useT();
  const { isRTL } = useLanguage();
  const align = isRTL ? "right" : "left";

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
          {t.authForgotTitle}
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
          {t.authForgotSubtitle}
        </AppText>
      </View>

      <View style={{ gap: 8 }}>
        <AppText
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 12,
            color: colors.mutedForeground,
            textAlign: align,
          }}
        >
          {t.authForgotEmailLabel}
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
          editable={!busy}
          onSubmitEditing={onSubmit}
          returnKeyType="send"
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 15,
            color: colors.primary,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: errorMessage ? colors.destructive : colors.border,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 16,
            textAlign: align,
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        />
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
      </View>

      <Pressable
        disabled={busy}
        onPress={onSubmit}
        style={({ pressed }) => ({
          backgroundColor: colors.primary,
          paddingVertical: 16,
          borderRadius: 14,
          alignItems: "center",
          opacity: busy ? 0.7 : pressed ? 0.85 : 1,
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
            {t.authForgotSendBtn}
          </AppText>
        )}
      </Pressable>
    </View>
  );
}
