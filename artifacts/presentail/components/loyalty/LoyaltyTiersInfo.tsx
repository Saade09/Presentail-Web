import React from "react";
import { Text, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

// Mirror of the server-side tier table. Keep in sync with
// `artifacts/api-server/src/lib/loyalty.ts`.
export const LOYALTY_TIERS_INFO = [
  { key: "regular", label: "Regular", threshold: 300, discountPercent: 10 }, // i18n-ignore
  { key: "loyal", label: "Loyal", threshold: 600, discountPercent: 15 }, // i18n-ignore
  { key: "vip", label: "VIP", threshold: 1000, discountPercent: 20 }, // i18n-ignore
] as const;

export function LoyaltyTiersExplainer({
  current,
  points,
}: {
  current?: string;
  points?: number;
}) {
  const colors = useColors();
  const t = useT();
  return (
    <View style={{ gap: 14 }}>
      <AppText
        style={{
          fontFamily: "Inter_400Regular",
          fontSize: 14,
          lineHeight: 20,
          color: colors.primary,
          opacity: 0.85,
        }}
      >
        {t.loyaltyTiersExplainer}
      </AppText>
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
                <AppText
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 14,
                    color: colors.primary,
                  }}
                >
                  {tier.label}
                </AppText>
                <AppText
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 12,
                    color: colors.mutedForeground,
                    marginTop: 2,
                  }}
                >
                  {tier.threshold} {t.loyaltyPoints}
                </AppText>
              </View>
              <AppText
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 14,
                  color: colors.primary,
                }}
              >
                {t.loyaltyTierDiscount.replace("{n}", String(tier.discountPercent))}
              </AppText>
            </View>
          );
        })}
      </View>
      <AppText
        style={{
          fontFamily: "Inter_400Regular",
          fontSize: 12,
          color: colors.mutedForeground,
          lineHeight: 18,
        }}
      >
        {t.loyaltyCouponNote}
      </AppText>
    </View>
  );
}
