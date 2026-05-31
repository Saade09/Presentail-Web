import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";

import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";
import { useColors } from "@/hooks/useColors";

type Props = {
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A shimmer skeleton block. Drop it wherever a real UI element will load —
 * it shows the same animated opacity pulse as ShimmerPlaceholder but also
 * provides the base background colour and dimensions, so callers don't have
 * to wrap it manually.
 */
export function SkeletonBox({ width, height, borderRadius = 4, style }: Props) {
  const colors = useColors();
  return (
    <View
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius,
          backgroundColor: colors.muted,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <ShimmerPlaceholder />
    </View>
  );
}
