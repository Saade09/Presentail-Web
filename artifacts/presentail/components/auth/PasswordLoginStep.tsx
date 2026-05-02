import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
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
  email: string;
  password: string;
  onPasswordChange: (v: string) => void;
  busy: boolean;
  errorMessage: string | null;
  onSubmit: () => void;
  onForgotPassword: () => void;
};

export function PasswordLoginStep({
  email,
  password,
  onPasswordChange,
  busy,
  errorMessage,
  onSubmit,
  onForgotPassword,
}: Props) {
  const colors = useColors();
  const t = useT();
  const { isRTL } = useLanguage();
  const align = isRTL ? "right" : "left";
  const [show, setShow] = useState(false);

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
          {t.authWelcomeBack}
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
          {t.authEnterPassword}
        </Text>
      </View>

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
          {email}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 12,
            color: colors.mutedForeground,
            textAlign: align,
          }}
        >
          {t.authPasswordLabel}
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
            onChangeText={onPasswordChange}
            placeholder={t.authPasswordPlaceholder}
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry={!show}
            autoComplete="password"
            textContentType="password"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
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
            {t.authSignIn}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={onForgotPassword} style={{ alignSelf: "center" }}>
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 13,
            color: colors.primary,
            textDecorationLine: "underline",
          }}
        >
          {t.authForgotPassword}
        </Text>
      </Pressable>
    </View>
  );
}
