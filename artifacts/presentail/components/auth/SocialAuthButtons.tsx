import { FontAwesome } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

type Props = {
  busyProvider: "apple" | "google" | null;
  disabled: boolean;
  onApple: () => void;
  onGoogle: () => void;
};

export function SocialAuthButtons({ busyProvider, disabled, onApple, onGoogle }: Props) {
  const colors = useColors();
  const t = useT();
  return (
    <View style={{ gap: 12 }}>
      <SocialButton
        icon={<FontAwesome name="apple" size={20} color={colors.primary} />}
        label={t.authContinueApple}
        loading={busyProvider === "apple"}
        disabled={disabled}
        onPress={onApple}
      />
      <SocialButton
        icon={
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.primary }}>G</Text>
        }
        label={t.authContinueGoogle}
        loading={busyProvider === "google"}
        disabled={disabled}
        onPress={onGoogle}
      />
    </View>
  );
}

function SocialButton({
  icon,
  label,
  loading,
  disabled,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        borderWidth: 1,
        borderColor: colors.primary,
        backgroundColor: "#fff",
        borderRadius: 14,
        paddingVertical: 16,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          {icon}
          <Text
            style={{
              fontFamily: "Inter_600SemiBold",
              fontSize: 15,
              color: colors.primary,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
