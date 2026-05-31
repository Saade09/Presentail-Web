import React from "react";
import { StyleSheet, Text, type TextProps } from "react-native";

import { useTypography } from "@/hooks/useTypography";

type WeightKey = "regular" | "medium" | "semibold" | "bold";

const BODY_FONT_TO_WEIGHT: Record<string, WeightKey> = {
  Inter_400Regular: "regular",
  Inter_500Medium: "medium",
  Inter_600SemiBold: "semibold",
  Inter_700Bold: "bold",
};

const DISPLAY_FONT_TO_WEIGHT: Record<string, WeightKey> = {
  PlayfairDisplay_400Regular: "regular",
  PlayfairDisplay_500Medium: "medium",
  PlayfairDisplay_600SemiBold: "semibold",
  PlayfairDisplay_700Bold: "bold",
};

/**
 * Drop-in replacement for React Native `Text` that automatically maps
 * font families to the language-appropriate equivalent at render time.
 *
 * EN / FR:
 *   Inter_*          → Inter (unchanged)
 *   PlayfairDisplay_* → PlayfairDisplay (unchanged)
 *
 * AR:
 *   Inter_*          → NotoNaskhArabic (bundled Arabic body font)
 *   PlayfairDisplay_* → NotoNaskhArabic (PlayfairDisplay has no Arabic
 *                       glyphs; the Arabic font is used for all weights)
 *
 * Both plain style objects and arrays of styles are handled. Numeric
 * StyleSheet IDs are resolved via StyleSheet.flatten() before lookup so
 * that styles defined in StyleSheet.create() are remapped correctly.
 *
 * Any fontFamily not listed above (custom brand fonts, etc.) is left
 * untouched, as is text with no fontFamily at all.
 *
 * Usage: replace `import { Text } from "react-native"` with
 * `import { AppText as Text } from "@/components/AppText"`.
 */
export function AppText({ style, ...props }: TextProps) {
  const typo = useTypography();

  const remapStyle = (s: unknown): unknown => {
    if (!s) return s;
    const flat = StyleSheet.flatten(s as never) as Record<string, unknown> | null | undefined;
    if (!flat) return s;
    const fontFamily = flat.fontFamily as string | undefined;
    if (!fontFamily) return flat;

    const bodyWeight = BODY_FONT_TO_WEIGHT[fontFamily];
    if (bodyWeight) {
      return { ...flat, fontFamily: typo.body[bodyWeight] };
    }

    const displayWeight = DISPLAY_FONT_TO_WEIGHT[fontFamily];
    if (displayWeight) {
      return { ...flat, fontFamily: typo.display[displayWeight] };
    }

    return flat;
  };

  const resolvedStyle = Array.isArray(style)
    ? style.map(remapStyle)
    : remapStyle(style);

  return <Text style={resolvedStyle as TextProps["style"]} {...props} />;
}
