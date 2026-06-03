import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";
import { API_BASE } from "@/lib/stripe";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { LoyaltyTiersExplainer } from "@/components/loyalty/LoyaltyTiersInfo";

type LoyaltyCoupon = {
  id: number;
  tier: string;
  tierLabel: string;
  discountPercent: number;
  code: string;
  status: string;
  storeKey: string | null;
  createdAt: string;
};

type LoyaltySummary = {
  points: number;
  tier: { key: string; label: string; threshold: number; discountPercent: number };
  nextTier: { key: string; label: string; threshold: number; discountPercent: number } | null;
  pointsToNext: number | null;
  coupons: LoyaltyCoupon[];
};

type FetchState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; loyalty: LoyaltySummary };

function LoyaltyScreen() {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isRTL } = useLanguage();
  const { ready, user, token } = useAuth();
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setState({ kind: "error", message: "Please sign in to see your points." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch(`${API_BASE}/api/loyalty/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        loyalty?: LoyaltySummary;
        message?: string;
      };
      if (!res.ok || !data.ok || !data.loyalty) {
        setState({
          kind: "error",
          message: data.message ?? "Couldn't load your points.", // i18n-ignore
        });
        return;
      }
      setState({ kind: "ok", loyalty: data.loyalty });
    } catch (err: any) {
      setState({
        kind: "error",
        message: err?.message ?? "Couldn't load your points.", // i18n-ignore
      });
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  useEffect(() => {
    if (ready && !user) router.replace("/(tabs)/account");
  }, [ready, user, router]);

  const onCopy = async (coupon: LoyaltyCoupon) => {
    await Clipboard.setStringAsync(coupon.code).catch(() => {});
    setCopiedId(coupon.id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === coupon.id ? null : prev));
    }, 1500);
  };

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
            fontSize: 20,
            color: "#fff",
            textAlign: isRTL ? "right" : "left",
          }}
        >
          Presentail Points {/* i18n-ignore */}
        </AppText>
      </View>

      {state.kind === "loading" ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : state.kind === "error" ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <AppText
            style={{
              fontFamily: "Inter_400Regular",
              color: colors.primary,
              textAlign: "center",
            }}
          >
            {state.message}
          </AppText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 80 }}
        >
          <SummaryCard summary={state.loyalty} />
          {state.loyalty.coupons.length > 0 ? (
            <View style={{ gap: 10 }}>
              <AppText
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: colors.mutedForeground,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {t.loyaltyActiveCoupons}
              </AppText>
              {state.loyalty.coupons.map((c) => (
                <CouponRow
                  key={c.id}
                  coupon={c}
                  copied={copiedId === c.id}
                  onCopy={() => onCopy(c)}
                />
              ))}
            </View>
          ) : null}
          <View style={{ gap: 10 }}>
            <AppText
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: colors.mutedForeground,
                letterSpacing: 1,
                textTransform: "uppercase",
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {t.loyaltyHowTiersWork}
            </AppText>
            <LoyaltyTiersExplainer
              current={state.loyalty.tier.key}
              points={state.loyalty.points}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function SummaryCard({ summary }: { summary: LoyaltySummary }) {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const t = useT();
  const pct = summary.nextTier
    ? Math.min(
        100,
        Math.max(
          0,
          ((summary.points - summary.tier.threshold) /
            (summary.nextTier.threshold - summary.tier.threshold)) *
            100,
        ),
      )
    : 100;

  if (summary.points === 0) {
    return (
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 18,
          padding: 24,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          gap: 12,
        }}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: "#f5ede0",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="star" size={24} color="#c9a35a" />
        </View>
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            color: colors.mutedForeground,
            textAlign: "center",
            lineHeight: 20,
          }}
        >
          {t.loyaltyNoPointsYet}
        </AppText>
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 18,
        padding: 20,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 16,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "#c9a35a",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="star" size={20} color="#fff" />
          </View>
          <View>
            <AppText
              style={{
                fontFamily: headingFontMedium,
                fontSize: 28,
                color: colors.primary,
              }}
            >
              {summary.points}
            </AppText>
            <AppText
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 11,
                color: colors.mutedForeground,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              points
            </AppText>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <AppText
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 11,
              color: colors.mutedForeground,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {t.loyaltyCurrentTier}
          </AppText>
          <AppText
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 16,
              color: colors.primary,
              marginTop: 2,
            }}
          >
            {summary.tier.label}
          </AppText>
        </View>
      </View>
      {summary.nextTier && summary.pointsToNext != null ? (
        <View>
          <View
            style={{
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.border,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${pct}%`,
                backgroundColor: "#c9a35a",
              }}
            />
          </View>
          <AppText
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              color: colors.mutedForeground,
              marginTop: 8,
            }}
          >
            {summary.pointsToNext} points to {summary.nextTier.label} (
            {summary.nextTier.discountPercent}% off)
          </AppText>
        </View>
      ) : (
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            color: colors.mutedForeground,
          }}
        >
          {t.loyaltyTopTierThankYou}
        </AppText>
      )}
    </View>
  );
}

function CouponRow({
  coupon,
  copied,
  onCopy,
}: {
  coupon: LoyaltyCoupon;
  copied: boolean;
  onCopy: () => void;
}) {
  const colors = useColors();
  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 14,
            color: colors.primary,
          }}
        >
          {coupon.tierLabel} · {coupon.discountPercent}% off
        </AppText>
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            color: colors.mutedForeground,
            marginTop: 4,
          }}
          numberOfLines={1}
        >
          {coupon.code}
        </AppText>
      </View>
      <Pressable
        onPress={onCopy}
        style={({ pressed }) => ({
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.primary,
          backgroundColor: copied ? colors.primary : "#fff",
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <AppText
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 12,
            color: copied ? "#fff" : colors.primary,
          }}
        >
          {copied ? "Copied" : "Copy"}
        </AppText>
      </Pressable>
    </View>
  );
}

export default withRouteErrorBoundary(LoyaltyScreen, "loyalty");
