import React from "react";
import Svg, { Path } from "react-native-svg";

type Props = {
  size?: number;
  color?: string;
};

export function DirhamSymbol({ size = 14, color = "#00414E" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Path
        d="M28 18 L28 72 C28 82 36 88 48 88 L52 88 C68 88 78 78 78 60 C78 42 68 32 52 32 L40 32"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M14 50 L88 50"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <Path
        d="M14 64 L88 64"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
      />
    </Svg>
  );
}
