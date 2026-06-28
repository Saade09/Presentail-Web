import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";
import { trackEvent, fireAdsPurchaseConversion, loadStoredGclid, type AnalyticsEvent } from "@/lib/analytics";
import { clearPendingOrder, loadPendingOrder, type PendingOrder } from "@/lib/pendingOrder";
import { createWooOrder } from "@/lib/woo";
import { submitWooOrderWithRetry } from "@/lib/wooSubmit";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

function OrderConfirmed() {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { formatNative } = useCurrency();
  const t = useT();
  const { orderId, total, currency, date, slot, recipient, status, paymentRef } =
    useLocalSearchParams<{
      orderId: string;
      total: string;
      currency?: string;
      date: string;
      slot: string;
      recipient: string;
      status?: string;
      paymentRef?: string;
    }>();

  const { clear } = useCart();

  // The checkout flow routes here with status=failed when WooCommerce
  // order creation fails after a successful payment. We render a clear
  // failure variant so the customer knows to contact support with the
  // payment reference instead of assuming the order is on its way.
  //
  // localStatus lets a successful in-place retry flip the screen from the
  // failure variant to the success variant without re-navigating.
  const [localStatus, setLocalStatus] = React.useState<string | undefined>(status);
  const isFailed = localStatus === "failed";

  // When the shopper was charged but the order failed to record, the checkout
  // screen stashes the exact order payload. We load it here so the failure
  // screen can replay it through createWooOrder — letting an already-charged
  // shopper self-recover from a transient API failure without paying again.
  const [retainedOrder, setRetainedOrder] = React.useState<PendingOrder | null>(null);
  const [retrying, setRetrying] = React.useState(false);

  // Prevents the conversion from firing more than once per screen mount even
  // if the component re-renders (strict mode, foreground/background cycles).
  const purchaseFiredRef = React.useRef(false);

  React.useEffect(() => {
    if (status !== "failed") return;
    let cancelled = false;
    loadPendingOrder().then((entry) => {
      if (!cancelled) setRetainedOrder(entry);
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  // Fire Google Ads purchase conversion on the initial success path.
  // The checkout screen routes here with status=success after a confirmed
  // order — we fire exactly once using purchaseFiredRef as a guard.
  // `currency` comes from the nav param set by checkout.tsx (buildResultPath).
  React.useEffect(() => {
    if (localStatus === "failed") return;
    if (purchaseFiredRef.current) return;
    purchaseFiredRef.current = true;
    void loadStoredGclid().then((gclid) => {
      fireAdsPurchaseConversion({
        transactionId: String(orderId),
        value: Number(total) || 0,
        currency: currency ?? "USD",
        ...(gclid ? { gclid } : {}),
      });
    });
  // orderId, total, currency, and localStatus are all stable after mount;
  // purchaseFiredRef ensures this fires at most once even on re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canRetry = isFailed && retainedOrder !== null;

  const handleRetry = async () => {
    if (!retainedOrder || retrying) return;
    setRetrying(true);
    try {
      const result = await submitWooOrderWithRetry({
        createWooOrder: () =>
          createWooOrder(retainedOrder.payload, {
            authToken: retainedOrder.authToken,
            filter: retainedOrder.filter ?? undefined,
          }),
        warn: (msg, meta) =>
          console.warn(`[order-confirmed] ${msg}`, { orderId: String(orderId), ...(meta ?? {}) }),
      });
      if (result.ok) {
        // Order finally recorded: drop the stash, clear the cart (kept intact
        // until now so a retry could rebuild it), and reset the coupon.
        await clearPendingOrder();
        clear();
        AsyncStorage.removeItem("@presentail/coupon_v1").catch(() => {});
        // Funnel terminal step: emit order_placed only now that the order has
        // actually been created, so a recovered order is still counted.
        trackEvent({
          name: "order_placed",
          surface: "checkout",
          action: retainedOrder.payload.paymentMethod as AnalyticsEvent["action"],
        });
        // Fire Google Ads conversion for the recovered order. The mount effect
        // exited early (localStatus was "failed") and did not set purchaseFiredRef,
        // so this is the first and only conversion call for this order.
        void loadStoredGclid().then((gclid) => {
          fireAdsPurchaseConversion({
            transactionId: String(orderId),
            value: Number(total) || 0,
            currency: currency ?? "USD",
            ...(gclid ? { gclid } : {}),
          });
        });
        setRetainedOrder(null);
        setLocalStatus("success");
      } else {
        Alert.alert(t.checkoutOrderFailedTitle, t.checkoutOrderRetryFailedMsg);
      }
    } finally {
      setRetrying(false);
    }
  };

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
        <AppText
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
        </AppText>
        <AppText
          style={{
            fontFamily: headingFontMedium,
            fontSize: 30,
            color: colors.primary,
            textAlign: "center",
            lineHeight: 38,
          }}
        >
          {isFailed ? t.checkoutOrderFailedTitle : t.ocYourGiftOnWay}
        </AppText>
        <AppText
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
        </AppText>

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
          <Pressable
            onPress={() =>
              Linking.openURL(`https://orderstatus.presentail.com?order=${orderId}`)
            }
            style={{
              marginTop: 4,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 999,
              paddingHorizontal: 24,
              paddingVertical: 12,
            }}
          >
            <Feather name="map-pin" size={14} color={colors.primary} />
            <AppText
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: colors.primary,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              {t.ocTrackOrder}
            </AppText>
          </Pressable>
        ) : null}

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
            <AppText
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 10,
                letterSpacing: 2.5,
                color: colors.goldSoft,
                textTransform: "uppercase",
              }}
            >
              {t.ocWhatHappensNext}
            </AppText>
            {[
              { icon: "flower", text: t.ocStep1 },
              { icon: "package-variant", text: t.ocStep2 },
              { icon: "truck-fast", text: t.ocStep3 },
            ].map((s) => (
              <View key={s.text} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <MaterialCommunityIcons name={s.icon as any} size={18} color={colors.goldSoft} />
                <AppText style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: "#fff" }}>{s.text}</AppText>
              </View>
            ))}
          </View>
        ) : null}

        {isFailed ? (
          <>
            {/* When a retained payload exists, the shopper was already charged
                — the primary CTA replays the stashed order. Otherwise we fall
                back to re-entering checkout. */}
            <Pressable
              onPress={canRetry ? handleRetry : () => router.replace("/checkout")}
              disabled={retrying}
              style={{
                marginTop: 16,
                backgroundColor: colors.gold,
                opacity: retrying ? 0.7 : 1,
                paddingHorizontal: 28,
                paddingVertical: 16,
                borderRadius: 999,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              {retrying ? <ActivityIndicator size="small" color="#fff" /> : null}
              <AppText
                style={{
                  fontFamily: "Inter_600SemiBold",
                  color: "#fff",
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                {retrying ? t.checkoutOrderRetrying : t.checkoutOrderFailedRetry}
              </AppText>
            </Pressable>
            {canRetry ? (
              <Pressable onPress={() => router.replace("/checkout")} disabled={retrying}>
                <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.primary, letterSpacing: 1, textTransform: "uppercase", textAlign: "center" }}>
                  {t.checkoutOrderFailedReturnCheckout}
                </AppText>
              </Pressable>
            ) : null}
            <Pressable onPress={() => Linking.openURL("mailto:hello@presentail.com")} disabled={retrying}>
              <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.primary, letterSpacing: 1, textTransform: "uppercase", textAlign: "center" }}>
                {t.checkoutOrderFailedContact}
              </AppText>
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
              <AppText
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
              </AppText>
            </Pressable>
            <Pressable onPress={() => router.replace("/(tabs)/catalog")}>
              <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.primary, letterSpacing: 1, textTransform: "uppercase", textAlign: "center" }}>
                {t.continueShopping}
              </AppText>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ colors, icon, label, value, highlight }: any) {
  const headingFontMedium = useHeadingFont("500Medium");
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
        <AppText style={{ fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: colors.mutedForeground }}>
          {label}
        </AppText>
        <Text style={{ fontFamily: highlight ? headingFontMedium : "Inter_500Medium", fontSize: highlight ? 18 : 14, color: colors.primary, marginTop: 2 }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default withRouteErrorBoundary(OrderConfirmed, "order-confirmed");
