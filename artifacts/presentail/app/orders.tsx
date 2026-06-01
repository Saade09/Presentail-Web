import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  UIManager,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";

import { useSafeAreaInsets } from "react-native-safe-area-context";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
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

function statusStyle(status: string | null): { bg: string; text: string } {
  if (!status) return { bg: "transparent", text: "" };
  const s = status.toLowerCase();
  if (s === "completed" || s === "delivered")
    return { bg: "#d1fae5", text: "#065f46" };
  if (s === "processing" || s === "on-hold" || s === "pending")
    return { bg: "#fef3c7", text: "#92400e" };
  if (s === "cancelled" || s === "failed" || s === "refunded")
    return { bg: "#fee2e2", text: "#991b1b" };
  return { bg: "#f1f5f9", text: "#475569" };
}

function OrdersScreen() {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { isRTL } = useLanguage();
  const { ready, user, token } = useAuth();
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!token) {
      setState({ kind: "ok", orders: [] });
      return;
    }
    if (!isRefresh) setState({ kind: "loading" });
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

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
        <AppText
          style={{
            flex: 1,
            fontFamily: headingFontMedium,
            fontSize: 22,
            color: "#fff",
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {t.ordersTitle}
        </AppText>
        <Feather name="package" size={22} color="rgba(255,255,255,0.6)" />
      </View>

      {state.kind === "loading" || !ready ? (
        <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 80 }}>
          {[1, 2, 3].map((i) => (
            <OrderSkeleton key={i} colors={colors} />
          ))}
        </ScrollView>
      ) : state.kind === "error" ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
          <AppText
            style={{
              marginTop: 12,
              color: colors.mutedForeground,
              fontFamily: "Inter_400Regular",
              textAlign: "center",
            }}
          >
            {t.ordersError}
          </AppText>
        </View>
      ) : state.orders.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Feather name="package" size={40} color={colors.mutedForeground} />
          <AppText
            style={{
              marginTop: 14,
              fontFamily: headingFontMedium,
              fontSize: 18,
              color: colors.primary,
              textAlign: "center",
            }}
          >
            {t.ordersEmpty}
          </AppText>
          <AppText
            style={{
              marginTop: 6,
              color: colors.mutedForeground,
              fontFamily: "Inter_400Regular",
              textAlign: "center",
              fontSize: 13,
            }}
          >
            {t.ordersHistoryEmpty}
          </AppText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 80 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          {state.orders.map((o) => (
            <OrderCard key={o.appOrderId} order={o} t={t} colors={colors} isRTL={isRTL} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function OrderSkeleton({ colors }: { colors: ReturnType<typeof useColors> }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
    return () => shimmer.stopAnimation();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] });

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        gap: 8,
      }}
    >
      <Animated.View style={{ opacity }}>
        <View
          style={{
            height: 10,
            width: 80,
            borderRadius: 5,
            backgroundColor: colors.border,
            marginBottom: 6,
          }}
        />
        <View
          style={{
            height: 18,
            width: "55%",
            borderRadius: 5,
            backgroundColor: colors.border,
            marginBottom: 6,
          }}
        />
        <View
          style={{
            height: 12,
            width: "40%",
            borderRadius: 5,
            backgroundColor: colors.border,
          }}
        />
      </Animated.View>
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
  const headingFontMedium = useHeadingFont("500Medium");
  const [expanded, setExpanded] = useState(false);
  const placed = formatDate(order.createdAt);
  const itemWord = order.itemsCount === 1 ? t.ordersItem : t.ordersItems;
  const totalLabel =
    order.total && order.currency ? `${order.currency} ${order.total}` : null;
  const { bg: statusBg, text: statusText } = statusStyle(order.status);
  const hasItems = Array.isArray(order.items) && order.items.length > 0;

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 18,
        gap: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
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
          <AppText
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
          </AppText>
          <AppText
            style={{
              fontFamily: headingFontMedium,
              fontSize: 18,
              color: colors.primary,
              marginTop: 4,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {order.itemsCount} {itemWord}
          </AppText>
        </View>
        <View style={{ alignItems: isRTL ? "flex-start" : "flex-end", gap: 6 }}>
          {totalLabel ? (
            <AppText
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 16,
                color: colors.primary,
              }}
            >
              {totalLabel}
            </AppText>
          ) : null}
          {order.status ? (
            <View
              style={{
                backgroundColor: statusBg,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
              }}
            >
              <AppText
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 11,
                  letterSpacing: 0.5,
                  color: statusText,
                  textTransform: "capitalize",
                }}
              >
                {order.status}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>

      {order.recipientName ? (
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            color: colors.mutedForeground,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {t.ordersDeliveryFor} {order.recipientName}
        </AppText>
      ) : null}

      <AppText
        style={{
          fontFamily: "Inter_400Regular",
          fontSize: 12,
          color: colors.mutedForeground,
          textAlign: isRTL ? "right" : "left",
        }}
      >
        {t.ordersPlacedOn} {placed}
      </AppText>

      {/* Footer row: track order + view details toggle */}
      {(order.wcOrderId != null || hasItems) && (
        <View
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 10,
            marginTop: 2,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: 8,
          }}
        >
          {order.wcOrderId != null ? (
            <Pressable
              hitSlop={6}
              onPress={() =>
                Linking.openURL(
                  `https://orderstatus.presentail.com?order=${order.wcOrderId}`
                )
              }
              style={({ pressed }) => ({
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 4,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Feather name="external-link" size={12} color={colors.primary} />
              <AppText
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: colors.primary,
                }}
              >
                {t.ordersTrackOrder}
              </AppText>
            </Pressable>
          ) : (
            <View />
          )}
          {hasItems && (
            <Pressable
              onPress={toggleExpand}
              hitSlop={6}
              style={({ pressed }) => ({
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 4,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Feather
                name={expanded ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.mutedForeground}
              />
              <AppText
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: colors.mutedForeground,
                }}
              >
                {expanded ? "Hide details" : "View details"}
              </AppText>
            </Pressable>
          )}
        </View>
      )}
      {hasItems && expanded && (
        <View style={{ gap: 6, paddingTop: 4 }}>
          {order.items.map((item, i) => (
            <View
              key={i}
              style={{
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <AppText
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: colors.primary,
                  flex: 1,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {item.name}
              </AppText>
              {item.quantity > 1 && (
                <AppText
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: colors.mutedForeground,
                    marginLeft: 8,
                  }}
                >
                  ×{item.quantity}
                </AppText>
              )}
            </View>
          ))}
        </View>
      )}
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
