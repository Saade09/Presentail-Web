import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { AppText } from "@/components/AppText";

import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

type Props = {
  email: string;
  busy: boolean;
  onResend: () => void;
  onBackToSignIn: () => void;
  onPasteLink: () => void;
};

export function ForgotPasswordSentStep({
  email,
  busy,
  onResend,
  onBackToSignIn,
  onPasteLink,
}: Props) {
  const colors = useColors();
  const t = useT();
  const { isRTL } = useLanguage();
  const align = isRTL ? "right" : "left";

  const body = t.authForgotSentBody.replace("{email}", email);

  return (
    <View style={{ gap: 24 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
          alignSelf: isRTL ? "flex-end" : "flex-start",
        }}
      >
        <Feather name="mail" size={28} color={colors.primary} />
      </View>

      <View style={{ gap: 8 }}>
        <AppText
          style={{
            fontFamily: "PlayfairDisplay_500Medium",
            fontSize: 28,
            color: colors.primary,
            textAlign: align,
          }}
        >
          {t.authForgotSentTitle}
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
          {body}
        </AppText>
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            color: colors.mutedForeground,
            textAlign: align,
            lineHeight: 18,
            marginTop: 4,
          }}
        >
          {t.authForgotSentTip}
        </AppText>
      </View>

      <Pressable
        disabled={busy}
        onPress={onBackToSignIn}
        style={({ pressed }) => ({
          backgroundColor: colors.primary,
          paddingVertical: 16,
          borderRadius: 14,
          alignItems: "center",
          opacity: busy ? 0.7 : pressed ? 0.85 : 1,
        })}
      >
        <AppText
          style={{
            color: "#fff",
            fontFamily: "Inter_600SemiBold",
            fontSize: 14,
            letterSpacing: 0.6,
          }}
        >
          {t.authForgotSentBackToSignIn}
        </AppText>
      </Pressable>

      <Pressable
        disabled={busy}
        onPress={onPasteLink}
        style={{ alignSelf: "center" }}
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
          {t.authForgotSentPasteLink}
        </AppText>
      </Pressable>

      <Pressable
        disabled={busy}
        onPress={onResend}
        style={{ alignSelf: "center" }}
      >
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <AppText
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 13,
              color: colors.mutedForeground,
              textDecorationLine: "underline",
            }}
          >
            {t.authForgotSentResend}
          </AppText>
        )}
      </Pressable>
    </View>
  );
}
