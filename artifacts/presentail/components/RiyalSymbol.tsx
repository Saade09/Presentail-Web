import React from "react";
import Svg, { G, Path } from "react-native-svg";

type Props = {
  size?: number;
  color?: string;
};

const RIYAL_PATH_1 =
  "M598 900 c-28 -21 -28 -22 -28 -145 0 -136 4 -129 -74 -140 -53 -8 -76 -26 -76 -60 l0 -23 58 14 c87 20 92 19 92 -21 0 -37 -7 -41 -120 -62 -36 -7 -47 -14 -54 -36 -5 -14 -7 -29 -4 -33 3 -3 45 2 93 12 77 15 89 21 115 53 23 27 30 46 30 77 0 40 12 53 53 54 4 0 7 -27 7 -60 0 -41 4 -60 13 -60 6 0 50 9 96 19 83 18 101 29 101 65 0 16 -5 18 -37 12 -117 -21 -115 -22 -111 10 3 27 8 30 68 43 69 14 80 22 80 59 0 18 -4 21 -22 17 -64 -14 -114 -25 -120 -25 -5 0 -8 50 -8 111 l0 110 -30 -21 c-30 -21 -30 -22 -30 -120 l0 -98 -30 -4 -29 -4 -3 139 -3 139 -27 -22z";

const RIYAL_PATH_2 =
  "M796 430 c-87 -20 -92 -23 -102 -64 -6 -23 -4 -28 8 -24 8 3 52 14 99 23 87 18 99 25 99 63 0 25 1 25 -104 2z";

export function RiyalSymbol({ size = 14, color = "#00414E" }: Props) {
  const width = Math.round((size * 53) / 59);
  return (
    <Svg viewBox="38 15 53 59" width={width} height={size} fill={color}>
      <G transform="translate(0, 108) scale(0.1, -0.1)">
        <Path d={RIYAL_PATH_1} />
        <Path d={RIYAL_PATH_2} />
      </G>
    </Svg>
  );
}
