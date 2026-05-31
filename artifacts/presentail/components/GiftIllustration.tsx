import React from "react";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

type Props = {
  size?: number;
};

// Mirrors assets/images/gift-illustration.svg using react-native-svg
// primitives (no metro transformer required). Keep both in sync.
export function GiftIllustration({ size = 220 }: Props) {
  const teal900 = "#00414E";
  const teal600 = "#177889";
  const cream = "#FAF6EE";
  const blush = "#F5DDD2";
  const gold = "#C9A94B";

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      fill="none"
      accessibilityLabel="Gift box illustration" // i18n-ignore
    >
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={cream} stopOpacity={1} />
          <Stop offset="1" stopColor={cream} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="boxFace" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={cream} stopOpacity={1} />
          <Stop offset="1" stopColor={blush} stopOpacity={0.55} />
        </LinearGradient>
        <LinearGradient id="lidFace" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={blush} stopOpacity={0.85} />
          <Stop offset="1" stopColor={cream} stopOpacity={1} />
        </LinearGradient>
      </Defs>

      <Circle cx={120} cy={132} r={104} fill="url(#bg)" />

      <Circle cx={62} cy={70} r={3} fill={gold} opacity={0.7} />
      <Circle cx={188} cy={62} r={2.5} fill={teal600} opacity={0.55} />
      <Circle cx={196} cy={156} r={3} fill={gold} opacity={0.6} />
      <Circle cx={48} cy={170} r={2.5} fill={teal600} opacity={0.5} />
      <Path
        d="M40 110 l4 4 M44 110 l-4 4"
        stroke={gold}
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.7}
      />
      <Path
        d="M198 102 l4 4 M202 102 l-4 4"
        stroke={teal600}
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.6}
      />

      <Rect
        x={56}
        y={120}
        width={128}
        height={84}
        rx={8}
        fill="url(#boxFace)"
        stroke={teal900}
        strokeWidth={3}
      />
      <Rect
        x={112}
        y={120}
        width={16}
        height={84}
        fill={teal900}
      />

      <Rect
        x={48}
        y={100}
        width={144}
        height={28}
        rx={6}
        fill="url(#lidFace)"
        stroke={teal900}
        strokeWidth={3}
      />
      <Rect
        x={112}
        y={100}
        width={16}
        height={28}
        fill={teal900}
      />

      <Path
        d="M120 100
           C 120 80, 96 76, 92 60
           C 90 50, 100 44, 108 50
           C 116 56, 120 70, 120 84
           Z"
        fill={teal900}
        stroke={teal900}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M120 100
           C 120 80, 144 76, 148 60
           C 150 50, 140 44, 132 50
           C 124 56, 120 70, 120 84
           Z"
        fill={teal900}
        stroke={teal900}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Circle cx={120} cy={96} r={5} fill={gold} />

      <Path
        d="M70 132 q 6 -6 12 0"
        stroke={teal600}
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
        opacity={0.55}
      />
      <Path
        d="M158 168 q 6 -6 12 0"
        stroke={teal600}
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
        opacity={0.55}
      />
    </Svg>
  );
}
