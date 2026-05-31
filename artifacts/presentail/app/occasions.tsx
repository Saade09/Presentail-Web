import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { occasions } from "@/data/catalog";
import type { Occasion } from "@/data/catalog";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";

const OCC_NAME_KEY: Record<string, string> = {
  housewarming: "occ_housewarming",
  birthday: "occ_birthday",
  "new-job": "occ_new_job",
  promotion: "occ_promotion",
  "thank-you": "occ_thank_you",
  "love-romance": "occ_love_romance",
  farewell: "occ_farewell",
  condolences: "occ_condolences",
};
const OCC_DESC_KEY: Record<string, string> = {
  housewarming: "occ_housewarming_desc",
  birthday: "occ_birthday_desc",
  "new-job": "occ_new_job_desc",
  promotion: "occ_promotion_desc",
  "thank-you": "occ_thank_you_desc",
  "love-romance": "occ_love_romance_desc",
  farewell: "occ_farewell_desc",
  condolences: "occ_condolences_desc",
};

type OccasionCardProps = {
  o: Occasion;
  displayName: string;
  displayDesc: string;
  isRTL: boolean;
  ta: "left" | "right";
  onPress: () => void;
};

function OccasionCard({ o, displayName, displayDesc, isRTL, ta, onPress }: OccasionCardProps) {
  const colors = useColors();
  const t = useT();
  const [imageLoaded, setImageLoaded] = React.useState(false);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: isRTL ? "row-reverse" : "row",
        alignItems: "center",
        gap: 16,
        borderRadius: 20,
        overflow: "hidden",
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: colors.border,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ width: 110, height: 110 }}>
        {!imageLoaded && <ShimmerPlaceholder />}
        <Image
          source={o.image}
          style={{ width: 110, height: 110 }}
          contentFit="cover"
          transition={200}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageLoaded(true)}
        />
      </View>
      <View style={{ flex: 1, paddingVertical: 16, paddingEnd: 16 }}>
        <Text
          style={{
            fontFamily: "PlayfairDisplay_500Medium",
            fontSize: 18,
            color: colors.primary,
            textAlign: ta,
          }}
        >
          {displayName}
        </Text>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            color: colors.mutedForeground,
            marginTop: 4,
            lineHeight: 17,
            textAlign: ta,
          }}
        >
          {displayDesc}
        </Text>
        <View
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            gap: 4,
            marginTop: 10,
          }}
        >
          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 12,
              color: colors.gold,
            }}
          >
            {t.seeAll}
          </Text>
          <Feather
            name={isRTL ? "arrow-up-left" : "arrow-up-right"}
            size={13}
            color={colors.gold}
          />
        </View>
      </View>
    </Pressable>
  );
}

function OccasionsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { count } = useCart();
  const t = useT();
  const { isRTL } = useLanguage();

  const ta = isRTL ? "right" : "left";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ height: 220, backgroundColor: colors.primary, overflow: "hidden" }}>
          <LinearGradient
            colors={["rgba(0,65,78,0.3)", "rgba(0,65,78,0.95)"]}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View
            style={{
              position: "absolute",
              top: insets.top + 12,
              left: 18,
              right: 18,
              flexDirection: isRTL ? "row-reverse" : "row",
              justifyContent: "space-between",
            }}
          >
            <Pressable
              onPress={() => router.back()}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.18)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name={isRTL ? "arrow-right" : "arrow-left"} size={20} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => router.push("/cart")}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.18)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="shopping-bag" size={18} color="#fff" />
              {count > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 999,
                    paddingHorizontal: 4,
                    backgroundColor: colors.gold,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 10 }}>
                    {count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
          <View style={{ position: "absolute", bottom: 28, left: 24, right: 24 }}>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 11,
                color: colors.goldSoft,
                letterSpacing: 3,
                textTransform: "uppercase",
                textAlign: ta,
              }}
            >
              {t.boutiqueSub}
            </Text>
            <Text
              style={{
                fontFamily: "PlayfairDisplay_500Medium",
                fontSize: 34,
                color: "#fff",
                marginTop: 6,
                textAlign: ta,
              }}
            >
              {t.occasionsPageTitle}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                color: "rgba(255,255,255,0.75)",
                marginTop: 4,
                textAlign: ta,
              }}
            >
              {t.occasionsPageSubtitle}
            </Text>
          </View>
        </View>

        {/* Occasion cards */}
        <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 14 }}>
          {occasions.map((o) => {
            const nameKey = OCC_NAME_KEY[o.id] as keyof typeof t;
            const descKey = OCC_DESC_KEY[o.id] as keyof typeof t;
            return (
              <OccasionCard
                key={o.id}
                o={o}
                displayName={(t[nameKey] as string) || o.name}
                displayDesc={(t[descKey] as string) || o.description || ""}
                isRTL={isRTL}
                ta={ta}
                onPress={() => router.push({ pathname: "/occasion/[slug]", params: { slug: o.id } })}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export default withRouteErrorBoundary(OccasionsScreen, "occasions");
