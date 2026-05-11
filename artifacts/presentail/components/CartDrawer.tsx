import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Price } from "@/components/Price";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useColors } from "@/hooks/useColors";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import { freeDeliveryThresholdUsd } from "@/lib/freeDelivery";

export function CartDrawer() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isCartOpen, closeCart, detailed, count, total, remove, setQty } = useCart();
  const { formatNative, currencyCode, convert } = useCurrency();
  const { selectedCountry } = useDeliveryLocation();
  const t = useT();

  const countryCode =
    selectedCountry?.code ||
    (currencyCode === "AED" ? "AE" : currencyCode === "EUR" ? "CY" : "LB");
  const thresholdUsd = freeDeliveryThresholdUsd(countryCode);
  const remainingUsd = Math.max(thresholdUsd - total, 0);
  const unlocked = total >= thresholdUsd;
  const progress = thresholdUsd > 0 ? Math.min(total / thresholdUsd, 1) : 1;

  return (
    <Modal
      visible={isCartOpen}
      transparent
      animationType="slide"
      onRequestClose={closeCart}
    >
      <TouchableWithoutFeedback onPress={closeCart}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} />
      </TouchableWithoutFeedback>

      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: "80%",
          paddingBottom: insets.bottom + 16,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: -4 },
          elevation: 20,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, color: colors.primary }}>
            Your Cart {count > 0 ? `(${count})` : ""}
          </Text>
          <Pressable onPress={closeCart} hitSlop={12}>
            <Feather name="x" size={22} color={colors.primary} />
          </Pressable>
        </View>

        {detailed.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 48, gap: 12 }}>
            <Feather name="shopping-bag" size={40} color={colors.mutedForeground} />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.mutedForeground }}>
              Your cart is empty
            </Text>
          </View>
        ) : (
          <>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 14, gap: 14 }}
              showsVerticalScrollIndicator={false}
            >
              {detailed.map(({ product, qty, lineTotal }) => (
                <View
                  key={product.id}
                  style={{
                    flexDirection: "row",
                    gap: 14,
                    backgroundColor: "#fff",
                    borderRadius: 16,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Image
                    source={product.image}
                    style={{ width: 70, height: 70, borderRadius: 10 }}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.primary }}
                    >
                      {product.name}
                    </Text>
                    <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 15, color: colors.primary }}>
                      {formatNative(lineTotal)}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Pressable
                        onPress={() => setQty(product.id, qty - 1)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          backgroundColor: colors.secondary,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        hitSlop={6}
                      >
                        <Feather name="minus" size={12} color={colors.primary} />
                      </Pressable>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primary, minWidth: 20, textAlign: "center" }}>
                        {qty}
                      </Text>
                      <Pressable
                        onPress={() => setQty(product.id, qty + 1)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          backgroundColor: colors.secondary,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        hitSlop={6}
                      >
                        <Feather name="plus" size={12} color={colors.primary} />
                      </Pressable>
                      <Pressable onPress={() => remove(product.id)} hitSlop={8} style={{ marginLeft: "auto" }}>
                        <Feather name="trash-2" size={14} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 14,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                gap: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  backgroundColor: colors.secondary,
                  borderRadius: 16,
                  padding: 12,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    backgroundColor: "#fff",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="truck" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  {unlocked ? (
                    <Text
                      style={{
                        fontFamily: "Inter_500Medium",
                        fontSize: 12,
                        color: colors.primary,
                      }}
                    >
                      {t.cartFreeDeliveryUnlocked}
                    </Text>
                  ) : (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Inter_500Medium",
                          fontSize: 12,
                          color: colors.primary,
                        }}
                      >
                        {t.cartFreeDeliveryRemainingPrefix}{" "}
                      </Text>
                      <Price
                        value={convert(remainingUsd)}
                        native
                        style={{
                          fontFamily: "Inter_600SemiBold",
                          fontSize: 12,
                          color: colors.primary,
                        }}
                        symbolSize={11}
                      />
                      <Text
                        style={{
                          fontFamily: "Inter_500Medium",
                          fontSize: 12,
                          color: colors.primary,
                        }}
                      >
                        {" "}{t.cartFreeDeliveryRemainingSuffix}
                      </Text>
                    </View>
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        height: 6,
                        borderRadius: 999,
                        backgroundColor: "#fff",
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          width: `${Math.round(progress * 100)}%`,
                          height: "100%",
                          backgroundColor: colors.gold,
                        }}
                      />
                    </View>
                    <Price
                      value={total}
                      native
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 11,
                        color: colors.primary,
                      }}
                      symbolSize={10}
                    />
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.mutedForeground }}>
                  Total
                </Text>
                <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, color: colors.primary }}>
                  {formatNative(total)}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  closeCart();
                  router.push("/checkout");
                }}
                style={({ pressed }) => ({
                  backgroundColor: colors.primary,
                  borderRadius: 999,
                  paddingVertical: 16,
                  alignItems: "center",
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff", letterSpacing: 1 }}>
                  CHECKOUT · {formatNative(total)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  closeCart();
                  router.push("/cart");
                }}
                style={{ alignItems: "center", paddingVertical: 4 }}
              >
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>
                  View full cart
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
