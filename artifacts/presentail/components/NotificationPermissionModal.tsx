import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

type Props = {
  visible: boolean;
  onAllow: () => void;
  onSkip: () => void;
};

export function NotificationPermissionModal({ visible, onAllow, onSkip }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { isRTL } = useLanguage();

  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, mounted, anim]);

  const opacity = anim;
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 0],
  });
  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  const ta = isRTL ? "right" : "left";

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onSkip}
    >
      <View style={StyleSheet.absoluteFill}>
        <TouchableWithoutFeedback onPress={onSkip}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.55)", opacity },
            ]}
          />
        </TouchableWithoutFeedback>

        <View
          pointerEvents="box-none"
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 24,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          <Animated.View
            style={{
              width: "100%",
              maxWidth: 380,
              backgroundColor: colors.background,
              borderRadius: 28,
              paddingTop: 32,
              paddingHorizontal: 26,
              paddingBottom: 22,
              opacity,
              transform: [{ translateY }, { scale }],
              shadowColor: "#000",
              shadowOpacity: 0.25,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 18,
            }}
          >
            <View
              style={{
                alignSelf: "center",
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <View style={{ position: "absolute" }}>
                <Feather name="bell" size={32} color={colors.goldSoft} />
              </View>
              <View
                style={{
                  position: "absolute",
                  bottom: 6,
                  right: 6,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: colors.gold,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor: colors.background,
                }}
              >
                <MaterialCommunityIcons
                  name="gift"
                  size={14}
                  color={colors.primary}
                />
              </View>
            </View>

            <Text
              style={{
                fontFamily: "PlayfairDisplay_500Medium",
                fontSize: 24,
                lineHeight: 30,
                color: colors.primary,
                textAlign: "center",
              }}
            >
              {t.notifPermTitle}
            </Text>

            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 14,
                lineHeight: 21,
                color: colors.mutedForeground,
                textAlign: "center",
                marginTop: 12,
                paddingHorizontal: 4,
              }}
            >
              {t.notifPermSubtitle}
            </Text>

            <View
              style={{
                marginTop: 22,
                gap: 10,
                paddingHorizontal: 4,
              }}
            >
              <BulletRow
                isRTL={isRTL}
                color={colors.gold}
                textColor={colors.primary}
                label={t.notifPermBullet1}
                ta={ta}
              />
              <BulletRow
                isRTL={isRTL}
                color={colors.gold}
                textColor={colors.primary}
                label={t.notifPermBullet2}
                ta={ta}
              />
              <BulletRow
                isRTL={isRTL}
                color={colors.gold}
                textColor={colors.primary}
                label={t.notifPermBullet3}
                ta={ta}
              />
            </View>

            <Pressable
              onPress={onAllow}
              style={({ pressed }) => ({
                marginTop: 26,
                backgroundColor: colors.primary,
                borderRadius: 999,
                paddingVertical: 16,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                  letterSpacing: 1,
                  color: "#ffffff",
                  textTransform: "uppercase",
                }}
              >
                {t.notifPermAllow}
              </Text>
            </Pressable>

            <Pressable
              onPress={onSkip}
              style={({ pressed }) => ({
                marginTop: 6,
                paddingVertical: 14,
                alignItems: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 13,
                  color: colors.mutedForeground,
                  letterSpacing: 0.5,
                }}
              >
                {t.notifPermMaybeLater}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

function BulletRow({
  isRTL,
  color,
  textColor,
  label,
  ta,
}: {
  isRTL: boolean;
  color: string;
  textColor: string;
  label: string;
  ta: "left" | "right";
}) {
  return (
    <View
      style={{
        flexDirection: isRTL ? "row-reverse" : "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
      <Text
        style={{
          flex: 1,
          fontFamily: "Inter_400Regular",
          fontSize: 13,
          lineHeight: 18,
          color: textColor,
          textAlign: ta,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
