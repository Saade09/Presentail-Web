import React from "react";
import { Animated, StyleProp, StyleSheet, ViewStyle } from "react-native";

import { useColors } from "@/hooks/useColors";

type Props = {
  style?: StyleProp<ViewStyle>;
};

/**
 * Animated shimmer overlay shown while an image is loading.
 * Mount it on top of the image container; unmount (or hide) once the image
 * has finished loading. Uses a native-driver opacity pulse so it runs at 60 fps
 * without touching the JS thread.
 */
export function ShimmerPlaceholder({ style }: Props) {
  const colors = useColors();
  const opacity = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: colors.imagePlaceholder, opacity },
        style,
      ]}
    />
  );
}
