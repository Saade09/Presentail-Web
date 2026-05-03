import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductCard } from "@/components/ProductCard";
import { useCart } from "@/contexts/CartContext";
import { getOccasion, occasions } from "@/data/catalog";
import { useColors } from "@/hooks/useColors";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import { fetchOccasionProducts, type OccasionGroup } from "@/lib/woo";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = Math.min(160, (SCREEN_W - 48) / 2.3);

export default function OccasionScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { count } = useCart();
  const occasion = getOccasion(String(slug));

  const [groups, setGroups] = useState<OccasionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const countryCode = selectedCountry?.code ?? null;
  const cityId = selectedCity?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setGroups([]);
    fetchOccasionProducts(String(slug), { countryCode, cityId }).then((g) => {
      if (!cancelled) {
        setGroups(g.filter((gr) => gr.products.length > 0));
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [slug, countryCode, cityId]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={{ height: 260, backgroundColor: colors.muted }}>
          {occasion ? (
            <Image source={occasion.image} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <LinearGradient
            colors={["rgba(0,65,78,0.2)", "rgba(0,65,78,0.88)"]}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={{
              position: "absolute",
              top: insets.top + 12,
              left: 18,
              right: 18,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Pressable onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}>
              <Feather name="arrow-left" size={20} color={colors.primary} />
            </Pressable>
            <Pressable onPress={() => router.push("/cart" as any)} style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}>
              <Feather name="shopping-bag" size={18} color={colors.primary} />
              {count > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.gold }]}>
                  <Text style={styles.badgeText}>{count}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
          <View style={{ position: "absolute", bottom: 22, left: 24, right: 24 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.goldSoft, letterSpacing: 3, textTransform: "uppercase" }}>
              {t.occasionForTheOccasion}
            </Text>
            <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 30, color: "#fff", marginTop: 6 }}>
              {occasion?.name ?? t.occasionFallback}
            </Text>
            {occasion?.description ? (
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.82)", marginTop: 6, lineHeight: 19 }}>
                {occasion.description}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Occasion pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingTop: 18, paddingBottom: 4 }}
        >
          {occasions.map((o) => {
            const active = o.id === slug;
            return (
              <Pressable
                key={o.id}
                onPress={() => router.replace(`/occasion/${o.id}` as any)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary : "#fff",
                }}
              >
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: active ? "#fff" : colors.primary }}>
                  {o.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Category sections */}
        {loading ? (
          <View style={{ paddingTop: 60, alignItems: "center", gap: 12 }}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>
              {t.occasionFindingGifts}
            </Text>
          </View>
        ) : groups.length === 0 ? (
          <View style={{ padding: 48, alignItems: "center", gap: 8 }}>
            <Feather name="inbox" size={28} color={colors.mutedForeground} />
            <Text style={{ fontFamily: "PlayfairDisplay_400Regular", color: colors.primary, fontSize: 18, textAlign: "center" }}>
              {t.occasionCuratingTitle}
            </Text>
            <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
              {t.occasionCuratingDesc}
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 10 }}>
            {groups.map((group) => (
              <CategorySection
                key={group.slug}
                group={group}
                colors={colors}
                t={t}
                onProduct={(id) => router.push(`/product/${id}` as any)}
                onSeeAll={() => router.push(`/category/${group.slug}` as any)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function CategorySection({
  group,
  colors,
  t,
  onProduct,
  onSeeAll,
}: {
  group: OccasionGroup;
  colors: any;
  t: any;
  onProduct: (id: string) => void;
  onSeeAll: () => void;
}) {
  return (
    <View style={{ marginTop: 28 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 24,
          marginBottom: 14,
        }}
      >
        <View>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: 18,
              color: colors.primary,
            }}
          >
            {group.label}
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
            {group.count} {group.count !== 1 ? t.occasionItems : t.occasionItem}
          </Text>
        </View>
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 12,
              color: colors.primary,
              textDecorationLine: "underline",
            }}
          >
            {t.seeAll}
          </Text>
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={group.products}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
        renderItem={({ item }) => (
          <ProductCard
            product={item as any}
            width={CARD_W}
            onPress={() => onProduct(item.id)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 999, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 10 },
});
