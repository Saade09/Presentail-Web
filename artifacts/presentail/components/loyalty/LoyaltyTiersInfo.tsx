import React from "react";
import { Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";

// Mirror of the server-side tier table. Keep in sync with
// `artifacts/api-server/src/lib/loyalty.ts`.
export const LOYALTY_TIERS_INFO = [
  { key: "regular", label: "Regular", threshold: 300, discountPercent: 10 },
  { key: "loyal", label: "Loyal", threshold: 600, discountPercent: 15 },
  { key: "vip", label: "VIP", threshold: 1000, discountPercent: 20 },
] as const;

export function LoyaltyTiersExplainer({
  current,
  points,
}: {
  current?: string;
  points?: number;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 14 }}>
      <Text
        style={{
          fontFamily: "Inter_400Regular",
          fontSize: 14,
          lineHeight: 20,
          color: colors.primary,
          opacity: 0.85,
        }}
      >
        Earn 1 point for every $1 you spend at Presentail. Points are credited
        once your order is delivered. Reach a tier and we'll mint a personal
        discount coupon you can use on your next order.
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
        {LOYALTY_TIERS_INFO.map((tier, idx) => {
          const reached =
            typeof points === "number" && points >= tier.threshold;
          const isCurrent = current === tier.key;
          return (
            <View
              key={tier.key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderTopWidth: idx === 0 ? 0 : 1,
                borderTopColor: colors.border,
                backgroundColor: isCurrent ? "#fff8ee" : "#fff",
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: reached ? "#c9a35a" : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather
                  name="star"
                  size={16}
                  color={reached ? "#fff" : colors.mutedForeground}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 14,
                    color: colors.primary,
                  }}
                >
                  {tier.label}
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 12,
                    color: colors.mutedForeground,
                    marginTop: 2,
                  }}
                >
                  {tier.threshold} points
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 14,
                  color: colors.primary,
                }}
              >
                {tier.discountPercent}% off
              </Text>
            </View>
          );
        })}
      </View>
      <Text
        style={{
          fontFamily: "Inter_400Regular",
          fontSize: 12,
          color: colors.mutedForeground,
          lineHeight: 18,
        }}
      >
        Your tier coupon is single-use and personal to your account. If an
        order is cancelled or refunded, the points credited for it are
        reversed.
      </Text>
    </View>
  );
}
