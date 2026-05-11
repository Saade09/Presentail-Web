import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { getStoredStoreHeaders } from "@/lib/storeHeaders";
import { useT } from "@/hooks/useT";
import { API_BASE } from "@/lib/stripe";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";

type MyOrder = {
  appOrderId: string;
  wcOrderId: number | null;
  state: string;
  recipientName: string | null;
  deliveryDate: string | null;
  deliverySlot: string | null;
  createdAt: string;
  status: string | null;
  total: string | null;
  currency: string | null;
  itemsCount: number;
  items: { name: string; quantity: number; image: string | null }[];
};

type FetchState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; orders: MyOrder[] };

function OrdersScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { isRTL } = useLanguage();
  const { ready, user, token } = useAuth();
  const [state, setState] = useState<FetchState>({ kind: "loading" });

  const load = useCallback(async () => {
    if (!token) {
      setState({ kind: "ok", orders: [] });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch(`${API_BASE}/api/me/orders`, {
        headers: { Authorization: `Bearer ${token}`, ...getStoredStoreHeaders() },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        orders?: MyOrder[];
        message?: string;
      };
      if (!res.ok || !data.ok) {
        setState({ kind: "error", message: data.message ?? t.ordersError });
        return;
      }
      setState({ kind: "ok", orders: Array.isArray(data.orders) ? data.orders : [] });
    } catch (err: any) {
      setState({ kind: "error", message: err?.message ?? t.ordersError });
    }
  }, [token, t.ordersError]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  // If the user signs out from another screen, bounce back.
  useEffect(() => {
    if (ready && !user) router.replace("/(tabs)/account");
  }, [ready, user, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingBottom: 14,
          paddingHorizontal: 18,
          backgroundColor: colors.primary,
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          gap: 14,
        }}
      >
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Feather
            name={isRTL ? "arrow-right" : "arrow-left"}
            size={22}
            color="#fff"
          />
        </Pressable>
        <Text
          style={{
            flex: 1,
            fontFamily: "PlayfairDisplay_500Medium",
            fontSize: 22,
            color: "#fff",
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {t.ordersTitle}
        </Text>
        <Feather name="package" size={22} color="rgba(255,255,255,0.6)" />
      </View>

      {state.kind === "loading" || !ready ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
          <Text
            style={{
              marginTop: 12,
              color: colors.mutedForeground,
              fontFamily: "Inter_400Regular",
            }}
          >
            {t.ordersLoading}
          </Text>
        </View>
      ) : state.kind === "error" ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: "Inter_400Regular",
              textAlign: "center",
            }}
          >
            {t.ordersError}
          </Text>
        </View>
      ) : state.orders.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Feather name="package" size={36} color={colors.mutedForeground} />
          <Text
            style={{
              marginTop: 12,
              color: colors.mutedForeground,
              fontFamily: "Inter_400Regular",
              textAlign: "center",
            }}
          >
            {t.ordersEmpty}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 80 }}>
          {state.orders.map((o) => (
            <OrderCard key={o.appOrderId} order={o} t={t} colors={colors} isRTL={isRTL} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function OrderCard({
  order,
  t,
  colors,
  isRTL,
}: {
  order: MyOrder;
  t: ReturnType<typeof useT>;
  colors: ReturnType<typeof useColors>;
  isRTL: boolean;
}) {
  const placed = formatDate(order.createdAt);
  const itemWord = order.itemsCount === 1 ? t.ordersItem : t.ordersItems;
  const totalLabel =
    order.total && order.currency ? `${order.currency} ${order.total}` : null;
  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        gap: 6,
      }}
    >
      <View
        style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 11,
              letterSpacing: 1,
              color: colors.mutedForeground,
              textTransform: "uppercase",
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t.ordersOrderNumber} #{order.appOrderId}
          </Text>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: 18,
              color: colors.primary,
              marginTop: 4,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {order.itemsCount} {itemWord}
          </Text>
        </View>
        <View style={{ alignItems: isRTL ? "flex-start" : "flex-end" }}>
          {totalLabel ? (
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 15,
                color: colors.primary,
              }}
            >
              {totalLabel}
            </Text>
          ) : null}
          {order.status ? (
            <Text
              style={{
                marginTop: 2,
                fontSize: 11,
                letterSpacing: 1,
                color: colors.mutedForeground,
                fontFamily: "Inter_500Medium",
                textTransform: "uppercase",
              }}
            >
              {order.status}
            </Text>
          ) : null}
        </View>
      </View>

      {order.recipientName ? (
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            color: colors.mutedForeground,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {t.ordersDeliveryFor} {order.recipientName}
        </Text>
      ) : null}

      <Text
        style={{
          fontFamily: "Inter_400Regular",
          fontSize: 12,
          color: colors.mutedForeground,
          textAlign: isRTL ? "right" : "left",
        }}
      >
        {t.ordersPlacedOn} {placed}
      </Text>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default withRouteErrorBoundary(OrdersScreen, "orders");
