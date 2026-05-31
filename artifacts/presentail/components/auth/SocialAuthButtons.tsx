import { FontAwesome } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { AppText } from "@/components/AppText";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

type Props = {
  busyProvider: "apple" | "google" | null;
  disabled: boolean;
  onApple: () => void;
  onGoogle: () => void;
};

// "Continue with Google" is gated by this flag because it requires the
// reversed iOS Google client ID URL scheme to be baked into Info.plist
// at native build time (i.e. it cannot be enabled via OTA against an
// older binary). It is enabled here for app version 1.0.2+ which is
// the first build that ships with the URL scheme registered. The OTA
// channel for that runtime version is isolated, so flipping this on
// will not reach the older build 13 (runtime 1.0.1) clients.
const GOOGLE_SIGN_IN_ENABLED = true;

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
      {GOOGLE_SIGN_IN_ENABLED ? (
        <SocialButton
          icon={
            <AppText style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.primary }}>G</AppText>
          }
          label={t.authContinueGoogle}
          loading={busyProvider === "google"}
          disabled={disabled}
          onPress={onGoogle}
        />
      ) : null}
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
          <AppText
            style={{
              fontFamily: "Inter_600SemiBold",
              fontSize: 15,
              color: colors.primary,
            }}
          >
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}
