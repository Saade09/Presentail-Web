import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";

const LOGO_EN = require("@/assets/images/presentail-logo-en.png");
const LOGO_AR = require("@/assets/images/presentail-logo-ar.png");
const LOGO_EN_WHITE = require("@/assets/images/presentail-logo-en-white.png");
const LOGO_AR_WHITE = require("@/assets/images/presentail-logo-ar-white.png");

const LOGO_EN_RATIO = 4167 / 2383;
const LOGO_AR_RATIO = 3250 / 792;
const LOGO_AR_HEIGHT_SCALE = LOGO_EN_RATIO / LOGO_AR_RATIO;

type WordmarkProps = {
  size?: number;
  color?: string;
  inverse?: boolean;
};

export function Wordmark({ size = 28, color, inverse }: WordmarkProps) {
  const { lang } = useLanguage();
  const isArabic = lang === "AR";
  const useWhite = inverse ?? (color === "#ffffff" || color === "#fff");
  const source = isArabic
    ? useWhite ? LOGO_AR_WHITE : LOGO_AR
    : useWhite ? LOGO_EN_WHITE : LOGO_EN;
  const ratio = isArabic ? LOGO_AR_RATIO : LOGO_EN_RATIO;
  const height = isArabic ? size * LOGO_AR_HEIGHT_SCALE : size;
  const width = height * ratio;
  return (
    <View style={styles.wordmarkRow}>
      <Image
        source={source}
        accessibilityLabel="Presentail"
        resizeMode="contain"
        style={{ width, height }}
      />
    </View>
  );
}

type SectionTitleProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  inverse?: boolean;
};

export function SectionTitle({ eyebrow, title, description, align = "left", inverse = false }: SectionTitleProps) {
  const colors = useColors();
  const titleColor = inverse ? "#ffffff" : colors.primary;
  const eyebrowColor = inverse ? colors.goldSoft : colors.gold;
  const descColor = inverse ? "rgba(255,255,255,0.78)" : colors.mutedForeground;
  return (
    <View style={{ alignItems: align === "center" ? "center" : "flex-start", gap: 10 }}>
      {eyebrow ? (
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 11,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: eyebrowColor,
          }}
        >
          {eyebrow}
        </Text>
      ) : null}
      <Text
        style={{
          fontFamily: "PlayfairDisplay_500Medium",
          fontSize: 30,
          lineHeight: 36,
          color: titleColor,
          textAlign: align,
          letterSpacing: 0.2,
        }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            lineHeight: 22,
            color: descColor,
            textAlign: align,
            maxWidth: 360,
          }}
        >
          {description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    marginTop: 8,
  },
});
