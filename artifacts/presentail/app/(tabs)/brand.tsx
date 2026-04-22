import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SectionTitle, Wordmark } from "@/components/Brand";
import { useColors } from "@/hooks/useColors";

export default function BrandScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: topPad + 12,
          paddingBottom: 24,
          gap: 14,
        }}
      >
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 11,
            color: colors.gold,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          The Brand
        </Text>
        <Wordmark size={44} />
        <Text
          style={{
            fontFamily: "PlayfairDisplay_400Regular",
            fontSize: 20,
            lineHeight: 30,
            color: colors.primary,
            marginTop: 6,
          }}
        >
          A modern flower house, rooted in Beirut and delivered across Lebanon
          with quiet, deliberate care.
        </Text>
      </View>

      <View style={{ marginHorizontal: 24, borderRadius: 24, overflow: "hidden", height: 280 }}>
        <Image
          source={require("@/assets/images/hero-gifts.png")}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <LinearGradient
          colors={["transparent", "rgba(0,65,78,0.7)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ position: "absolute", bottom: 22, left: 22, right: 22 }}>
          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 10,
              letterSpacing: 2,
              color: colors.goldSoft,
              textTransform: "uppercase",
            }}
          >
            Established Beirut
          </Text>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: 26,
              color: "#fff",
              marginTop: 6,
            }}
          >
            Crafted, never assembled.
          </Text>
        </View>
      </View>

      <Identity />
      <PalettePreview />
      <Pillars />
      <Numbers />
      <Contact />
    </ScrollView>
  );
}

function Identity() {
  const colors = useColors();
  return (
    <View style={{ paddingHorizontal: 24, marginTop: 44, gap: 18 }}>
      <SectionTitle
        eyebrow="Identity"
        title="The voice"
        description="We speak with the calm confidence of a luxury house — warm, never loud. Every word is chosen the way our florists choose a stem."
      />
      <View style={{ flexDirection: "row", gap: 12 }}>
        {[
          { word: "Refined", icon: "diamond-stone" as const },
          { word: "Personal", icon: "hand-heart" as const },
          { word: "Lebanese", icon: "pine-tree" as const },
        ].map((v) => (
          <View
            key={v.word}
            style={{
              flex: 1,
              backgroundColor: "#fff",
              borderRadius: 18,
              padding: 18,
              gap: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <MaterialCommunityIcons name={v.icon} size={22} color={colors.gold} />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.primary }}>
              {v.word}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PalettePreview() {
  const colors = useColors();
  const swatches = [
    { name: "Atelier Teal", hex: "#00414E", text: "#ffffff" },
    { name: "Mountain Mint", hex: "#5EEAD4", text: "#00414E" },
    { name: "Beirut Gold", hex: "#C9A94B", text: "#00414E" },
    { name: "Petal Cream", hex: "#FAF6EE", text: "#00414E" },
  ];
  return (
    <View style={{ paddingHorizontal: 24, marginTop: 44, gap: 18 }}>
      <SectionTitle
        eyebrow="Palette"
        title="Our colours"
        description="Drawn from the cedar forests, Mediterranean coast and warm marble of Beirut townhouses."
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {swatches.map((s) => (
          <View
            key={s.hex}
            style={{
              flexBasis: "48%",
              flexGrow: 1,
              borderRadius: 16,
              padding: 16,
              backgroundColor: s.hex,
              gap: 6,
              minHeight: 110,
              borderWidth: s.hex === "#FAF6EE" ? 1 : 0,
              borderColor: colors.border,
              justifyContent: "flex-end",
            }}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: s.text }}>
              {s.name}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 11,
                color: s.text,
                opacity: 0.7,
                letterSpacing: 1,
              }}
            >
              {s.hex}
            </Text>
          </View>
        ))}
      </View>
      <View
        style={{
          marginTop: 6,
          backgroundColor: "#fff",
          borderRadius: 18,
          padding: 18,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 10,
        }}
      >
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.gold, letterSpacing: 2, textTransform: "uppercase" }}>
          Typography
        </Text>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 26, color: colors.primary }}>
          Playfair Display
        </Text>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, lineHeight: 20 }}>
          Used for editorial headlines. Paired with Inter for clear, modern body
          text — together they feel both Lebanese and contemporary.
        </Text>
      </View>
    </View>
  );
}

function Pillars() {
  const colors = useColors();
  const pillars = [
    {
      icon: "flower-tulip" as const,
      title: "Atelier-first",
      text: "Every bouquet is composed by hand in our Beirut atelier — never machine packed.",
    },
    {
      icon: "earth" as const,
      title: "Sourced with intention",
      text: "From Holland's tulip auctions to Lebanon's family-run rose farms in Mount Lebanon.",
    },
    {
      icon: "truck-fast" as const,
      title: "Delivered with care",
      text: "Climate-controlled vans, real-time tracking and a no-compromise freshness promise.",
    },
    {
      icon: "shield-heart" as const,
      title: "Resilient & local",
      text: "Through every chapter Lebanon has lived through, we have kept delivering.",
    },
  ];
  return (
    <View style={{ paddingHorizontal: 24, marginTop: 44, gap: 18 }}>
      <SectionTitle eyebrow="What we stand for" title="Four quiet promises" />
      <View style={{ gap: 12 }}>
        {pillars.map((p) => (
          <View
            key={p.title}
            style={{
              flexDirection: "row",
              gap: 16,
              backgroundColor: "#fff",
              borderRadius: 18,
              padding: 18,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: colors.secondary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialCommunityIcons name={p.icon} size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primary }}>
                {p.title}
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, lineHeight: 20 }}>
                {p.text}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function Numbers() {
  const colors = useColors();
  const stats = [
    { v: "12+", l: "Years in Beirut" },
    { v: "120k", l: "Gifts delivered" },
    { v: "4.6★", l: "On 837 reviews" },
    { v: "24h", l: "Same-day service" },
  ];
  return (
    <View
      style={{
        marginTop: 44,
        marginHorizontal: 24,
        backgroundColor: colors.primary,
        borderRadius: 24,
        padding: 24,
      }}
    >
      <Text
        style={{
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          color: colors.goldSoft,
          letterSpacing: 3,
          textTransform: "uppercase",
        }}
      >
        Presentail in numbers
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 18 }}>
        {stats.map((s, i) => (
          <View
            key={s.l}
            style={{
              width: "50%",
              paddingVertical: 16,
              paddingRight: i % 2 === 0 ? 8 : 0,
            }}
          >
            <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 36, color: "#fff" }}>
              {s.v}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                color: "rgba(255,255,255,0.7)",
                marginTop: 4,
              }}
            >
              {s.l}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Contact() {
  const colors = useColors();
  const items = [
    { icon: "phone" as const, label: "+961 1 200 200", sub: "Daily 9am — 9pm" },
    { icon: "mail" as const, label: "hello@presentail.com", sub: "We reply within 2 hours" },
    { icon: "map-pin" as const, label: "Hamra · Beirut", sub: "Atelier & boutique" },
  ];
  return (
    <View style={{ paddingHorizontal: 24, marginTop: 44, gap: 18 }}>
      <SectionTitle eyebrow="Visit" title="Stop by, write, or call" />
      <View style={{ gap: 10 }}>
        {items.map((c) => (
          <Pressable
            key={c.label}
            style={({ pressed }) => [
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                backgroundColor: "#fff",
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                backgroundColor: colors.secondary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name={c.icon} size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.primary }}>
                {c.label}
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                {c.sub}
              </Text>
            </View>
            <Feather name="arrow-up-right" size={16} color={colors.gold} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
