import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function AccountTab() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready, user, logout, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 40, gap: 18 }}>
          <View style={{ alignItems: "center", marginBottom: 14 }}>
            <View
              style={{
                width: 86,
                height: 86,
                borderRadius: 999,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <Feather name="user" size={36} color="#fff" />
            </View>
            <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 24, color: colors.primary }}>
              Your Presentail account
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
                fontSize: 13,
                textAlign: "center",
                marginTop: 6,
                paddingHorizontal: 16,
              }}
            >
              Sign in to track orders, save addresses, and re-order favourites — or continue browsing without an account.
            </Text>
          </View>

          <Pressable
            onPress={() => router.push("/login" as any)}
            style={({ pressed }) => ({
              backgroundColor: colors.primary,
              paddingVertical: 16,
              borderRadius: 14,
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, fontSize: 14 }}>
              Sign in
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/register" as any)}
            style={({ pressed }) => ({
              borderWidth: 1,
              borderColor: colors.primary,
              paddingVertical: 16,
              borderRadius: 14,
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, fontSize: 14 }}>
              Create an account
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  const onLogout = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const onDelete = () => {
    Alert.alert(
      "Delete account",
      "This permanently deletes your Presentail account, profile and saved data. Past orders kept for our records will be anonymised. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            const r = await deleteAccount();
            setBusy(false);
            if (!r.ok) {
              Alert.alert("Couldn't delete account", r.message);
              return;
            }
            Alert.alert("Account deleted", "Your account has been removed.");
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 14,
          paddingBottom: 14,
          backgroundColor: colors.primary,
          alignItems: "center",
        }}
      >
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: "#fff" }}>
          My account
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 14,
            padding: 18,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 4,
          }}
        >
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: colors.primary }}>
            {`${user.firstName} ${user.lastName}`.trim() || user.email}
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
            {user.email}
          </Text>
          {user.phone ? (
            <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13 }}>
              {user.phone}
            </Text>
          ) : null}
        </View>

        <Section colors={colors} title="Orders & history">
          <Row colors={colors} icon="package" label="My orders" onPress={() => router.push("/(tabs)" as any)} />
        </Section>

        <Section colors={colors} title="Account">
          <Row colors={colors} icon="log-out" label="Sign out" onPress={onLogout} />
          <Row
            colors={colors}
            icon="trash-2"
            label={busy ? "Deleting…" : "Delete account"}
            destructive
            onPress={onDelete}
            disabled={busy}
          />
        </Section>

        <Text
          style={{
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
            fontSize: 11,
            textAlign: "center",
            paddingHorizontal: 24,
            marginTop: 8,
          }}
        >
          Deleting your account permanently removes your profile and personal data.
        </Text>
      </ScrollView>
    </View>
  );
}

function Section({ colors, title, children }: any) {
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontFamily: "Inter_600SemiBold",
          fontSize: 11,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: colors.mutedForeground,
          marginLeft: 4,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({ colors, icon, label, onPress, destructive, disabled }: any) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: pressed ? "#0001" : "#fff",
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Feather name={icon} size={18} color={destructive ? "#c0392b" : colors.primary} />
      <Text
        style={{
          flex: 1,
          fontFamily: "Inter_500Medium",
          fontSize: 15,
          color: destructive ? "#c0392b" : colors.primary,
        }}
      >
        {label}
      </Text>
      {!destructive && (
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}
