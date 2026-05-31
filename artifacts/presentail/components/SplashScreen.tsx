import { Image } from "expo-image";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

const LOGO = require("@/assets/images/splash-icon-cream.png");
const LOGO_AR = require("@/assets/images/splash-icon-cream-ar.png");

type Props = {
  fadingOut?: boolean;
  onFadeOutEnd?: () => void;
};

export function AnimatedSplash({ fadingOut = false, onFadeOutEnd }: Props) {
  const c = useColors();
  const t = useT();
  const { lang, isReady: langReady } = useLanguage();

  const containerOpacity = useSharedValue(1);
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.95);
  const taglineOpacity = useSharedValue(0);
  const taglineTranslate = useSharedValue(6);
  const indicatorOpacity = useSharedValue(0);

  // Defer the logo fade-in until the stored language preference has resolved
  // so AR users never see a flash of the Latin wordmark first.
  useEffect(() => {
    if (!langReady) return;
    logoOpacity.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) });
    logoScale.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) });
    indicatorOpacity.value = withDelay(
      560,
      withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }),
    );
  }, [langReady, logoOpacity, logoScale, indicatorOpacity]);

  // Defer the tagline animation until the stored language preference has
  // resolved so AR/FR users never see a flash of the default EN string.
  useEffect(() => {
    if (!langReady) return;
    taglineOpacity.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) });
    taglineTranslate.value = withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) });
  }, [langReady, taglineOpacity, taglineTranslate]);

  useEffect(() => {
    if (!fadingOut) return;
    containerOpacity.value = withTiming(
      0,
      { duration: 320, easing: Easing.out(Easing.quad) },
      (finished) => {
        "worklet";
        if (finished && onFadeOutEnd) {
          runOnJS(onFadeOutEnd)();
        }
      },
    );
  }, [fadingOut, containerOpacity, onFadeOutEnd]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineTranslate.value }],
  }));
  const indicatorStyle = useAnimatedStyle(() => ({ opacity: indicatorOpacity.value }));

  return (
    <Animated.View
      pointerEvents={fadingOut ? "none" : "auto"}
      style={[StyleSheet.absoluteFill, { backgroundColor: c.background }, containerStyle]}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <Animated.View style={logoStyle}>
            {langReady ? (
              <Image
                source={lang === "AR" ? LOGO_AR : LOGO}
                style={styles.logo}
                contentFit="contain"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={styles.logo} />
            )}
          </Animated.View>
          <Animated.Text
            allowFontScaling={false}
            style={[
              styles.tagline,
              { color: c.teal800, fontFamily: "PlayfairDisplay_500Medium" },
              taglineStyle,
            ]}
          >
            {t.splashTagline}
          </Animated.Text>
        </View>
        <Animated.View style={[styles.footer, indicatorStyle]}>
          <LoadingDots color={c.teal600} />
        </Animated.View>
      </SafeAreaView>
    </Animated.View>
  );
}

function LoadingDots({ color }: { color: string }) {
  return (
    <View
      style={styles.dots} accessibilityRole="progressbar" accessibilityLabel="Loading" // i18n-ignore
    >
      <Dot color={color} delay={0} />
      <Dot color={color} delay={160} />
      <Dot color={color} delay={320} />
    </View>
  );
}

function Dot({ color, delay }: { color: string; delay: number }) {
  const opacity = useSharedValue(0.25);
  const scale = useSharedValue(0.85);

  useEffect(() => {
    const animate = () => {
      opacity.value = withDelay(
        delay,
        withTiming(1, { duration: 480, easing: Easing.inOut(Easing.quad) }, () => {
          opacity.value = withTiming(0.25, { duration: 480, easing: Easing.inOut(Easing.quad) });
        }),
      );
      scale.value = withDelay(
        delay,
        withTiming(1, { duration: 480, easing: Easing.inOut(Easing.quad) }, () => {
          scale.value = withTiming(0.85, { duration: 480, easing: Easing.inOut(Easing.quad) });
        }),
      );
    };
    animate();
    const id = setInterval(animate, 1100);
    return () => clearInterval(id);
  }, [opacity, scale, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logo: {
    width: 220,
    height: 220,
  },
  tagline: {
    marginTop: 8,
    fontSize: 18,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  footer: {
    paddingBottom: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
