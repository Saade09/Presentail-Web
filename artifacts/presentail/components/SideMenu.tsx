import { Feather } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Wordmark } from "@/components/Brand";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import type { Lang } from "@/lib/translations";

type SideMenuProps = {
  visible: boolean;
  onClose: () => void;
  onOpenDelivery?: () => void;
};

const { width: SCREEN_W } = Dimensions.get("window");
const DRAWER_W = Math.min(320, Math.round(SCREEN_W * 0.84));

export function SideMenu({ visible, onClose, onOpenDelivery }: SideMenuProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { isRTL, lang, setLang } = useLanguage();
  const { token: authToken } = useAuth();
  const { selectedCountry } = useDeliveryLocation();
  const { currencyCode } = useCurrency();
  const isAE = selectedCountry?.code === "AE" || (!selectedCountry?.code && currencyCode === "AED");

  const anim = useRef(new Animated.Value(0)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      dragX.setValue(0);
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
  }, [visible, mounted, anim, dragX]);

  const offscreen = isRTL ? DRAWER_W : -DRAWER_W;
  const baseTranslateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [offscreen, 0],
  });
  const translateX = Animated.add(baseTranslateX, dragX);
  const backdropOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const closeDir = isRTL ? 1 : -1;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_e, g) => {
        const dx = isRTL ? Math.max(0, g.dx) : Math.min(0, g.dx);
        dragX.setValue(dx);
      },
      onPanResponderRelease: (_e, g) => {
        const dx = isRTL ? Math.max(0, g.dx) : Math.min(0, g.dx);
        const vx = g.vx;
        const shouldClose =
          Math.abs(dx) > DRAWER_W * 0.33 || vx * closeDir > 0.5;
        if (shouldClose) {
          Animated.timing(dragX, {
            toValue: closeDir * DRAWER_W,
            duration: 160,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            dragX.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(dragX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      },
    })
  ).current;

  const navigate = (href: Href) => {
    onClose();
    setTimeout(() => router.push(href), 180);
  };

  const items: {
    key: string;
    icon: keyof typeof Feather.glyphMap;
    label: string;
    onPress: () => void;
  }[] = [
    {
      key: "shop",
      icon: "shopping-bag",
      label: t.menuShop,
      onPress: () => navigate("/(tabs)/catalog"),
    },
    {
      key: "occasions",
      icon: "gift",
      label: t.menuOccasions,
      onPress: () => navigate("/occasions"),
    },
    ...(isAE ? [] : [{
      key: "brands",
      icon: "award" as keyof typeof Feather.glyphMap,
      label: t.menuBrands,
      onPress: () => navigate("/(tabs)/catalog"),
    }]),
    {
      key: "account",
      icon: "user",
      label: t.menuAccount,
      onPress: () => navigate(authToken ? "/(tabs)/account" : "/auth"),
    },
    {
      key: "help",
      icon: "help-circle",
      label: t.menuHelp,
      onPress: () => navigate("/contact"),
    },
    ...(onOpenDelivery
      ? [
          {
            key: "region",
            icon: "map-pin" as keyof typeof Feather.glyphMap,
            label: t.deliveryChooseLocation,
            onPress: () => {
              onClose();
              setTimeout(() => onOpenDelivery(), 180);
            },
          },
        ]
      : []),
  ];

  const langOptions: { code: Lang; label: string }[] = [
    { code: "EN", label: "English" },
    { code: "AR", label: "عربية" },
    { code: "FR", label: "Français" },
  ];

  const rowDir = isRTL ? "row-reverse" : "row";
  const ta: "left" | "right" = isRTL ? "right" : "left";
  const drawerSide = isRTL
    ? { right: 0 as const }
    : { left: 0 as const };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.45)", opacity: backdropOpacity },
            ]}
          />
        </TouchableWithoutFeedback>

        <Animated.View
          {...panResponder.panHandlers}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            ...drawerSide,
            width: DRAWER_W,
            backgroundColor: colors.background,
            transform: [{ translateX }],
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 24,
            shadowOffset: { width: isRTL ? -4 : 4, height: 0 },
            elevation: 24,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          <View
            style={{
              flexDirection: rowDir,
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 18,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Wordmark size={22} />
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel={t.menuClose}
            >
              <Feather name="x" size={22} color={colors.primary} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingVertical: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {items.map((it) => (
              <Pressable
                key={it.key}
                onPress={it.onPress}
                accessibilityRole="button"
                accessibilityLabel={it.label}
                style={({ pressed }) => ({
                  flexDirection: rowDir,
                  alignItems: "center",
                  gap: 16,
                  paddingHorizontal: 22,
                  paddingVertical: 16,
                  backgroundColor: pressed ? colors.secondary : "transparent",
                })}
              >
                <Feather name={it.icon} size={20} color={colors.primary} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "Inter_500Medium",
                    fontSize: 16,
                    color: colors.primary,
                    textAlign: ta,
                  }}
                >
                  {it.label}
                </Text>
                <Feather
                  name={isRTL ? "chevron-left" : "chevron-right"}
                  size={18}
                  color={colors.mutedForeground}
                />
              </Pressable>
            ))}

            <View
              style={{
                marginTop: 12,
                marginHorizontal: 22,
                paddingTop: 18,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 11,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: colors.mutedForeground,
                  marginBottom: 12,
                  textAlign: ta,
                }}
              >
                {t.languageLabel}
              </Text>
              <View style={{ flexDirection: rowDir, gap: 8, flexWrap: "wrap" }}>
                {langOptions.map((opt) => {
                  const active = opt.code === lang;
                  return (
                    <Pressable
                      key={opt.code}
                      onPress={() => setLang(opt.code)}
                      accessibilityLabel={opt.label}
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => ({
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: active
                          ? colors.primary
                          : colors.secondary,
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontFamily: "Inter_500Medium",
                          fontSize: 13,
                          color: active ? "#fff" : colors.primary,
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
