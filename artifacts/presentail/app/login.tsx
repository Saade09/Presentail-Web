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
import { API_BASE } from "@/lib/stripe";

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing details", "Please enter your email and password.");
      return;
    }
    setBusy(true);
    const r = await login(email.trim(), password);
    setBusy(false);
    if (!r.ok) {
      Alert.alert("Sign in failed", r.message);
      return;
    }
    router.replace("/(tabs)/account" as any);
  };

  const onTestConnection = async () => {
    const url = `${API_BASE}/api/healthz?_=${Date.now()}`;
    try {
      const res = await fetch(url, { cache: "no-store" as RequestCache });
      const text = await res.text();
      Alert.alert(
        "Connection test",
        `URL: ${url.split("?")[0]}\nHTTP ${res.status}\nBody: ${text.slice(0, 200)}`
      );
    } catch (e: any) {
      Alert.alert("Connection test failed", `URL: ${url.split("?")[0]}\nError: ${e?.message ?? "unknown"}`);
    }
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
          Sign in
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 6, marginBottom: 6 }}>
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 26, color: colors.primary }}>
            Welcome back
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
            Sign in to track orders, save addresses and re-order favourites.
          </Text>
        </View>

        <Field
          colors={colors}
          label="Email"
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
          label="Password"
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
              Sign in
            </Text>
          )}
        </Pressable>

        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 }}>
          <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            New to Presentail?
          </Text>
          <Pressable onPress={() => router.replace("/register" as any)}>
            <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.gold }}>
              Create an account
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.replace("/(tabs)" as any)}
          style={{ alignItems: "center", marginTop: 16 }}
        >
          <Text style={{ fontFamily: "Inter_500Medium", color: colors.mutedForeground, fontSize: 12 }}>
            Continue without signing in
          </Text>
        </Pressable>

        <Pressable
          onPress={onTestConnection}
          style={{ alignItems: "center", marginTop: 24, padding: 8 }}
        >
          <Text style={{ fontFamily: "Inter_500Medium", color: colors.gold, fontSize: 11 }}>
            Test connection
          </Text>
        </Pressable>
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
            fontSize: 9,
            textAlign: "center",
            marginTop: 4,
          }}
          selectable
        >
          API: {API_BASE || "(not configured)"}
        </Text>
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
