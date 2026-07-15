import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { AppText } from "@/components/AppText";
import { Price } from "@/components/Price";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";

type CartStickyBarProps = {
  itemCount: number;
  deliveryContext: string | null;
  grandTotalUsd: number;
  onProceed: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  bottomPadding?: number;
};

export function CartStickyBar({
  itemCount,
  deliveryContext,
  grandTotalUsd,
  onProceed,
  isLoading = false,
  isDisabled = false,
  bottomPadding = 12,
}: CartStickyBarProps) {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const t = useT();

  const itemLabel =
    itemCount === 1 ? t.cartStickyItemSingular : t.cartStickyItemPlural;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: "#fff",
          borderTopColor: colors.border,
          paddingBottom: bottomPadding,
        },
      ]}
    >
      {/* Summary row */}
      <View style={styles.summaryRow}>
        <AppText
          numberOfLines={1}
          style={[styles.summaryText, { color: colors.primary }]}
        >
          <AppText style={{ fontFamily: "Inter_600SemiBold" }}>
            {itemCount} {itemLabel}
          </AppText>
          {deliveryContext ? (
            <AppText
              style={{
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
              }}
            >
              {"  ·  "}
              {deliveryContext}
            </AppText>
          ) : null}
        </AppText>

        <View style={styles.totalBlock}>
          <AppText
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 11,
              color: colors.mutedForeground,
            }}
          >
            {t.cartTotal}
          </AppText>
          <Price
            value={grandTotalUsd}
            style={{
              fontFamily: headingFontMedium,
              fontSize: 17,
              color: colors.primary,
            }}
          />
        </View>
      </View>

      {/* CTA button */}
      <Pressable
        onPress={onProceed}
        disabled={isDisabled || isLoading}
        accessibilityRole="button"
        accessibilityLabel={t.cartProceed}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.primary,
            shadowColor: colors.primary,
            opacity: isDisabled ? 0.45 : pressed ? 0.88 : 1,
          },
        ]}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <View style={styles.buttonLeft}>
              <Feather name="lock" size={14} color="#fff" />
              <AppText style={styles.buttonLabel}>{t.cartProceed}</AppText>
            </View>
            <Feather name="chevron-right" size={18} color="#fff" />
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  totalBlock: {
    alignItems: "flex-end",
    gap: 1,
  },
  button: {
    borderRadius: 14,
    minHeight: 52,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonLabel: {
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    letterSpacing: 0.8,
    fontSize: 14,
  },
});
