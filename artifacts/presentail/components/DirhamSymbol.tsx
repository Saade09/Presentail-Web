import React from "react";
import { Image, type StyleProp, type ImageStyle } from "react-native";

type Props = {
  size?: number;
  color?: string;
};

export function DirhamSymbol({ size = 14, color = "#00414E" }: Props) {
  const imageStyle: StyleProp<ImageStyle> = {
    width: size,
    height: size,
    tintColor: color,
  };
  return (
    <Image
      source={require("@/assets/images/dirham-logo.png")}
      style={imageStyle}
      resizeMode="contain"
    />
  );
}
