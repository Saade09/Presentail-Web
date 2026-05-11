import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCurrency } from "@/contexts/CurrencyContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

function OrderConfirmed() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { formatNative } = useCurrency();
  const t = useT();
  const { orderId, total, date, slot, recipient, status, paymentRef } =
    useLocalSearchParams<{
      orderId: string;
      total: string;
      date: string;
      slot: string;
      recipient: string;
      status?: string;
      paymentRef?: string;
    }>();

  // The checkout flow routes here with status=failed when WooCommerce
  // order creation fails after a successful payment. We render a clear
  // failure variant so the customer knows to contact support with the
  // payment reference instead of assuming the order is on its way.
  const isFailed = status === "failed";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 32,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 24,
          alignItems: "center",
          gap: 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 999,
            backgroundColor: isFailed ? "#C0392B" : colors.gold,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name={isFailed ? "alert-triangle" : "check"} size={40} color="#fff" />
        </View>
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 11,
            color: isFailed ? "#C0392B" : colors.gold,
            letterSpacing: 3,
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          {isFailed ? t.checkoutOrderFailedRef : t.ocOrderPlaced}
        </Text>
        <Text
          style={{
            fontFamily: "PlayfairDisplay_500Medium",
            fontSize: 30,
            color: colors.primary,
            textAlign: "center",
            lineHeight: 38,
          }}
        >
          {isFailed ? t.checkoutOrderFailedTitle : t.ocYourGiftOnWay}
        </Text>
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            color: colors.mutedForeground,
            textAlign: "center",
            lineHeight: 22,
            maxWidth: 320,
          }}
        >
          {isFailed ? t.checkoutOrderFailedMsg : t.ocThanksMsg}
        </Text>

        <View
          style={{
            marginTop: 14,
            width: "100%",
            backgroundColor: "#fff",
            borderRadius: 22,
            padding: 22,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 14,
          }}
        >
          <Row colors={colors} icon="hash" label={t.ocOrderNumber} value={String(orderId)} />
          {paymentRef ? (
            <Row colors={colors} icon="credit-card" label={t.checkoutOrderFailedRef} value={String(paymentRef)} />
          ) : null}
          <Row colors={colors} icon="user" label={t.ocRecipient} value={String(recipient || "—")} />
          <Row colors={colors} icon="calendar" label={t.ocDelivery} value={`${date} · ${slot}`} />
          <Row colors={colors} icon="dollar-sign" label={t.ocTotal} value={formatNative(Number(total || 0))} highlight />
        </View>

        {!isFailed ? (
          <View
            style={{
              width: "100%",
              backgroundColor: colors.primary,
              borderRadius: 22,
              padding: 22,
              gap: 14,
              marginTop: 4,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 10,
                letterSpacing: 2.5,
                color: colors.goldSoft,
                textTransform: "uppercase",
              }}
            >
              {t.ocWhatHappensNext}
            </Text>
            {[
              { icon: "flower", text: t.ocStep1 },
              { icon: "package-variant", text: t.ocStep2 },
              { icon: "truck-fast", text: t.ocStep3 },
            ].map((s) => (
              <View key={s.text} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <MaterialCommunityIcons name={s.icon as any} size={18} color={colors.goldSoft} />
                <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: "#fff" }}>{s.text}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {isFailed ? (
          <>
            <Pressable
              onPress={() => router.replace("/checkout")}
              style={{
                marginTop: 16,
                backgroundColor: colors.gold,
                paddingHorizontal: 28,
                paddingVertical: 16,
                borderRadius: 999,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  color: "#fff",
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                {t.checkoutOrderFailedRetry}
              </Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL("mailto:hello@presentail.com")}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.primary, letterSpacing: 1, textTransform: "uppercase", textAlign: "center" }}>
                {t.checkoutOrderFailedContact}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={() => router.replace("/(tabs)")}
              style={{
                marginTop: 16,
                backgroundColor: colors.gold,
                paddingHorizontal: 28,
                paddingVertical: 16,
                borderRadius: 999,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  color: "#fff",
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                {t.ocBackToHome}
              </Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/(tabs)/catalog")}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.primary, letterSpacing: 1, textTransform: "uppercase", textAlign: "center" }}>
                {t.continueShopping}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ colors, icon, label, value, highlight }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          backgroundColor: colors.secondary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: colors.mutedForeground }}>
          {label}
        </Text>
        <Text style={{ fontFamily: highlight ? "PlayfairDisplay_500Medium" : "Inter_500Medium", fontSize: highlight ? 18 : 14, color: colors.primary, marginTop: 2 }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default withRouteErrorBoundary(OrderConfirmed, "order-confirmed");
