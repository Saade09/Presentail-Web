import React from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
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
  const t = useT();
  const { isRTL } = useLanguage();
  const align = isRTL ? "right" : "left";

  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 8 }}>
        <Text
          style={{
            fontFamily: "PlayfairDisplay_500Medium",
            fontSize: 28,
            color: colors.primary,
            textAlign: align,
          }}
        >
          {t.authForgotPasteLinkTitle}
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
          {t.authForgotPasteLinkSubtitle}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 13,
            color: colors.primary,
            textAlign: align,
          }}
        >
          {t.authForgotPasteLinkLabel}
        </Text>
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
          <Text
            style={{
              color: "#C0392B",
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              textAlign: align,
            }}
          >
            {errorMessage}
          </Text>
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
          <Text
            style={{
              color: "#fff",
              fontFamily: "Inter_600SemiBold",
              fontSize: 14,
              letterSpacing: 0.6,
            }}
          >
            {t.authForgotPasteLinkSubmit}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
