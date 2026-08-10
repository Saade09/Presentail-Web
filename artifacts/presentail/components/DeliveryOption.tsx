import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { I18nManager, Pressable, View } from "react-native";

import { AppText } from "@/components/AppText";

export function DeliveryOption({
  colors,
  active,
  onPress,
  icon,
  title,
  subtitle,
  badge,
  disabled,
  feeLabel,
  feeSubLabel,
  isFree,
}: {
  colors: any;
  active: boolean;
  onPress: () => void;
  icon: string;
  title: string;
  subtitle: string;
  badge?: string;
  disabled?: boolean;
  feeLabel?: React.ReactNode;
  feeSubLabel?: React.ReactNode;
  isFree?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={!!disabled}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: "#fff",
        opacity: disabled ? 0.5 : 1,
        minHeight: 44,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? colors.primary : colors.background,
        }}
      >
        <MaterialCommunityIcons name={icon as any} size={18} color={active ? colors.goldSoft : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <AppText style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primary }}>{title}</AppText>
          {badge ? (
            <View style={{ backgroundColor: colors.gold, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
              <AppText style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: "#fff", letterSpacing: 1 }}>
                {badge}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
          {subtitle}
        </AppText>
      </View>
      {feeLabel != null ? (
        <View style={{ alignItems: "flex-end", marginEnd: 6, flexShrink: 0, maxWidth: 110 }}>
          {typeof feeLabel === "string" ? (
            <AppText
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 11,
                color: isFree ? colors.primary : colors.text,
                // In RTL the fee column sits at the left card edge; align text there.
                textAlign: I18nManager.isRTL ? "left" : "right",
              }}
            >
              {feeLabel}
            </AppText>
          ) : feeLabel}
          {feeSubLabel != null ? (
            typeof feeSubLabel === "string" ? (
              <AppText
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 10,
                  color: colors.mutedForeground,
                  marginTop: 1,
                  textAlign: I18nManager.isRTL ? "left" : "right",
                }}
              >
                {feeSubLabel}
              </AppText>
            ) : feeSubLabel
          ) : null}
        </View>
      ) : null}
      <Feather name={active ? "check-circle" : "circle"} size={20} color={active ? colors.gold : colors.border} />
    </Pressable>
  );
}
