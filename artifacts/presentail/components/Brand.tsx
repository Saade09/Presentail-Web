import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type WordmarkProps = {
  size?: number;
  color?: string;
};

export function Wordmark({ size = 28, color }: WordmarkProps) {
  const colors = useColors();
  const tone = color ?? colors.primary;
  return (
    <View style={styles.wordmarkRow}>
      <Text
        style={{
          fontFamily: "PlayfairDisplay_500Medium",
          fontSize: size,
          color: tone,
          letterSpacing: 0.4,
        }}
      >
        Presentail
      </Text>
      <View
        style={[
          styles.dot,
          { backgroundColor: colors.gold, width: size * 0.18, height: size * 0.18, borderRadius: size * 0.09 },
        ]}
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
