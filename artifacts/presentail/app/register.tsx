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

export default function RegisterScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing details", "Email and password are required.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Weak password", "Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords don't match", "Please make sure the passwords are the same.");
      return;
    }
    setBusy(true);
    const r = await register({
      email: email.trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      Alert.alert("Couldn't create account", r.message);
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
          Create account
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 14, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 6, marginBottom: 6 }}>
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 26, color: colors.primary }}>
            Join Presentail
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
            Save addresses, view past orders and re-order favourites in one tap.
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field colors={colors} label="First name" value={firstName} onChangeText={setFirstName} placeholder="Ahmad" autoCapitalize="words" />
          </View>
          <View style={{ flex: 1 }}>
            <Field colors={colors} label="Last name" value={lastName} onChangeText={setLastName} placeholder="Saadé" autoCapitalize="words" />
          </View>
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
          placeholder="At least 8 characters"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <Field
          colors={colors}
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Re-enter your password"
          secureTextEntry
          autoComplete="new-password"
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
              Create account
            </Text>
          )}
        </Pressable>

        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 }}>
          <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            Already have an account?
          </Text>
          <Pressable onPress={() => router.replace("/login" as any)}>
            <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.gold }}>
              Sign in
            </Text>
          </Pressable>
        </View>
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
