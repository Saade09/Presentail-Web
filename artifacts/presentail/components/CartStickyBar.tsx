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
  const tappingRef = React.useRef(false);

  const itemLabel =
    itemCount === 1 ? t.cartStickyItemSingular : t.cartStickyItemPlural;

  const handlePress = React.useCallback(() => {
    if (tappingRef.current) return;
    tappingRef.current = true;
    try {
      onProceed();
    } finally {
      setTimeout(() => {
        tappingRef.current = false;
      }, 800);
    }
  }, [onProceed]);

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
          style={[styles.summaryText, { flexShrink: 1 }]}
        >
          <AppText style={{ fontFamily: "Inter_600SemiBold", color: colors.primary }}>
            {itemCount} {itemLabel}
          </AppText>
          <AppText
            style={{
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
            }}
          >
            {"  ·  "}
            {deliveryContext !== null ? deliveryContext : t.cartStickySelectTime}
          </AppText>
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
        onPress={handlePress}
        disabled={isDisabled || isLoading}
        accessibilityRole="button"
        accessibilityLabel={t.cartStickyLockIconLabel}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.primary,
            opacity: isDisabled ? 0.45 : pressed ? 0.88 : 1,
          },
        ]}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Feather
              name="lock"
              size={14}
              color="#fff"
              accessibilityLabel={t.cartStickyLockIconLabel}
              style={styles.lockIcon}
            />
            <AppText style={styles.buttonLabel}>
              {t.cartStickyCheckoutSecure}
              {" · "}
            </AppText>
            <Price
              value={grandTotalUsd}
              style={styles.buttonPrice}
            />
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
    minHeight: 48,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  lockIcon: {
    marginEnd: 8,
  },
  buttonLabel: {
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    fontSize: 14,
    letterSpacing: 0.2,
  },
  buttonPrice: {
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    fontSize: 14,
  },
});
