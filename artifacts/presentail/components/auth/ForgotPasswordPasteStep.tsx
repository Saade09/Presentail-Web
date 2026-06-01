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
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";

type Props = {
  value: string;
  onChange: (v: string) => void;
  errorMessage: string | null;
  busy: boolean;
  onSubmit: () => void;
};

export function ForgotPasswordPasteStep({
  value,
  onChange,
  errorMessage,
  busy,
  onSubmit,
}: Props) {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const t = useT();
  const { isRTL } = useLanguage();
  const align = isRTL ? "right" : "left";

  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 8 }}>
        <AppText
          style={{
            fontFamily: headingFontMedium,
            fontSize: 28,
            color: colors.primary,
            textAlign: align,
          }}
        >
          {t.authForgotPasteLinkTitle}
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
          {t.authForgotPasteLinkSubtitle}
        </AppText>
      </View>

      <View style={{ gap: 8 }}>
        <AppText
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 13,
            color: colors.primary,
            textAlign: align,
          }}
        >
          {t.authForgotPasteLinkLabel}
        </AppText>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="https://…/wp-login.php?action=rp&key=…&login=…"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={{
            borderWidth: 1,
            borderColor: errorMessage ? "#C0392B" : colors.border ?? "#E6E0D2",
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            minHeight: 88,
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            color: colors.primary,
            textAlign: align,
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        />
        {errorMessage ? (
          <AppText
            style={{
              color: "#C0392B",
              fontFamily: "Inter_400Regular",
              fontSize: 12,
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
            {t.authForgotPasteLinkSubmit}
          </AppText>
        )}
      </Pressable>
    </View>
  );
}
