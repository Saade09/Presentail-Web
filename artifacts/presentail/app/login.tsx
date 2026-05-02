import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const t = useT();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t.loginMissingTitle, t.loginMissingMsg);
      return;
    }
    setBusy(true);
    const r = await login(email.trim(), password);
    setBusy(false);
    if (!r.ok) {
      Alert.alert(t.loginFailedTitle, r.message);
      return;
    }
    router.replace("/(tabs)/account" as any);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={{
          paddingTop: insets.top + 14,
          paddingBottom: 14,
          backgroundColor: colors.primary,
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{ position: "absolute", left: 18, top: insets.top + 14, padding: 6 }}
        >
          <Feather name="arrow-left" size={20} color="#fff" />
        </Pressable>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: "#fff" }}>
          {t.loginTitle}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 6, marginBottom: 6 }}>
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 26, color: colors.primary }}>
            {t.loginWelcomeBack}
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
            {t.loginHelper}
          </Text>
        </View>

        <Field
          colors={colors}
          label={t.loginEmailLabel}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <Field
          colors={colors}
          label={t.loginPasswordLabel}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoComplete="password"
          textContentType="password"
        />

        <Pressable
          disabled={busy}
          onPress={onSubmit}
          style={({ pressed }) => ({
            marginTop: 8,
            backgroundColor: colors.primary,
            paddingVertical: 16,
            borderRadius: 14,
            alignItems: "center",
            opacity: pressed || busy ? 0.85 : 1,
          })}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              style={{
                color: "#fff",
                fontFamily: "Inter_600SemiBold",
                letterSpacing: 0.6,
                fontSize: 14,
              }}
            >
              {t.loginTitle}
            </Text>
          )}
        </Pressable>

        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            {t.loginNewTo}
          </Text>
          <Pressable onPress={() => router.replace("/register" as any)}>
            <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.gold }}>
              {t.loginCreateAccountLink}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.replace("/(tabs)" as any)}
          style={{ alignItems: "center", marginTop: 16 }}
        >
          <Text style={{ fontFamily: "Inter_500Medium", color: colors.mutedForeground, fontSize: 12, textAlign: "center" }}>
            {t.loginContinueWithout}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ colors, label, ...rest }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground }}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        style={{
          fontFamily: "Inter_400Regular",
          fontSize: 15,
          color: colors.primary,
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 14,
        }}
        {...rest}
      />
    </View>
  );
}
