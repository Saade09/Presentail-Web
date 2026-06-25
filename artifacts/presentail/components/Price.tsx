import React from "react";
import { Text, View, type TextStyle, type ViewStyle } from "react-native";
import { AppText } from "@/components/AppText";

import { useCurrency } from "@/contexts/CurrencyContext";
import { DirhamSymbol } from "@/components/DirhamSymbol";
import { RiyalSymbol } from "@/components/RiyalSymbol";

type Props = {
  /** The amount to display. When `native` is true this is already in the active currency; otherwise it is USD. */
  value: number;
  /** When true, skip FX conversion — the value is already in the active currency. */
  native?: boolean;
  style?: TextStyle;
  containerStyle?: ViewStyle;
  symbolColor?: string;
  symbolSize?: number;
};

/**
 * Renders a price in the active currency. For AED, the new dirham symbol is
 * drawn as an SVG inline (since its Unicode glyph is not yet widely supported
 * across system fonts).
 */
export function Price({ value, native, style, containerStyle, symbolColor, symbolSize }: Props) {
  const { currency, convert } = useCurrency();

  const v = native ? (Number(value) || 0) : convert(value);
  const fixed =
    currency.decimals > 0 ? v.toFixed(currency.decimals) : Math.round(v).toString();
  const [intPart, decPart] = fixed.split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const numStr = decPart != null ? `${withSep}.${decPart}` : withSep;

  if (currency.code === "AED") {
    const fontSize = (style?.fontSize as number) ?? 14;
    const glyph = symbolSize ?? Math.round(fontSize * 0.75);
    const tint = symbolColor ?? (style?.color as string) ?? "#00414E";
    return (
      <View
        style={[
          { flexDirection: "row", alignItems: "center", gap: 4 },
          containerStyle,
        ]}
      >
        <DirhamSymbol size={glyph} color={tint} />
        <AppText style={style}>{numStr}</AppText>
      </View>
    );
  }

  if (currency.code === "SAR") {
    const fontSize = (style?.fontSize as number) ?? 14;
    const glyph = symbolSize ?? Math.round(fontSize * 0.75);
    const tint = symbolColor ?? (style?.color as string) ?? "#00414E";
    return (
      <View
        style={[
          { flexDirection: "row", alignItems: "center", gap: 4 },
          containerStyle,
        ]}
      >
        <RiyalSymbol size={glyph} color={tint} />
        <AppText style={style}>{numStr}</AppText>
      </View>
    );
  }

  const sep = currency.spaceBetween ? " " : "";
  const text =
    currency.symbolPosition === "left"
      ? `${currency.symbol}${sep}${numStr}`
      : `${numStr}${sep}${currency.symbol}`;

  return <AppText style={style}>{text}</AppText>;
}
