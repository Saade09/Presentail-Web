import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { AppText } from "@/components/AppText";

import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTypography } from "@/hooks/useTypography";

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
  const { lang, isReady } = useLanguage();
  const isArabic = lang === "AR";
  const useWhite = inverse ?? (color === "#ffffff" || color === "#fff");
  const source = isArabic
    ? useWhite ? LOGO_AR_WHITE : LOGO_AR
    : useWhite ? LOGO_EN_WHITE : LOGO_EN;
  const ratio = isArabic ? LOGO_AR_RATIO : LOGO_EN_RATIO;
  const height = isArabic ? size * LOGO_AR_HEIGHT_SCALE : size;
  const width = height * ratio;
  const placeholderWidth = size * LOGO_EN_RATIO;
  return (
    <View style={styles.wordmarkRow}>
      {isReady ? (
        <Image
          source={source}
          accessibilityLabel="Presentail" // i18n-ignore
          resizeMode="contain"
          style={{ width, height }}
        />
      ) : (
        <View style={{ width: placeholderWidth, height: size }} />
      )}
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
  const typo = useTypography();
  const titleColor = inverse ? "#ffffff" : colors.primary;
  const eyebrowColor = inverse ? colors.goldSoft : colors.gold;
  const descColor = inverse ? "rgba(255,255,255,0.78)" : colors.mutedForeground;
  return (
    <View style={{ alignItems: align === "center" ? "center" : "flex-start", gap: 10 }}>
      {eyebrow ? (
        <AppText
          style={{
            fontFamily: typo.medium,
            fontSize: 11,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: eyebrowColor,
          }}
        >
          {eyebrow}
        </AppText>
      ) : null}
      <AppText
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
      </AppText>
      {description ? (
        <AppText
          style={{
            fontFamily: typo.regular,
            fontSize: 14,
            lineHeight: 22,
            color: descColor,
            textAlign: align,
            maxWidth: 360,
          }}
        >
          {description}
        </AppText>
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
