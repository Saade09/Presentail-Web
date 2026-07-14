import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Wordmark } from "@/components/Brand";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useOsCategories } from "@/hooks/useOsCategories";
import { useOsOccasions } from "@/hooks/useOsOccasions";
import { useT } from "@/hooks/useT";
import type { Lang } from "@/lib/translations";

type SideMenuProps = {
  visible: boolean;
  onClose: () => void;
  onOpenDelivery?: () => void;
};

const { width: SCREEN_W } = Dimensions.get("window");

type ActivePanel = "main" | "categories" | "occasions";

// ─── GridPanel ────────────────────────────────────────────────────────────────

type GridItem = { id: string; name: string; image: any };

type GridPanelProps = {
  title: string;
  items: GridItem[];
  onBack: () => void;
  onClose: () => void;
  onSelectItem: (item: GridItem) => void;
  isRTL: boolean;
};

function GridPanel({ title, items, onBack, onClose, onSelectItem, isRTL }: GridPanelProps) {
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const GAP = 8;
  const COLS = 4;
  const HPAD = 20;
  const TILE_W = Math.floor((SCREEN_W - HPAD * 2 - GAP * (COLS - 1)) / COLS);

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Header */}
      <View
        style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={onBack} hitSlop={14} accessibilityRole="button">
          <Feather
            name={isRTL ? "chevron-right" : "chevron-left"}
            size={24}
            color={colors.primary}
          />
        </Pressable>
        <AppText
          style={{
            flex: 1,
            fontFamily: "Inter_600SemiBold",
            fontSize: 16,
            color: colors.primary,
            textAlign: "center",
          }}
        >
          {title}
        </AppText>
        <Pressable onPress={onClose} hitSlop={14} accessibilityLabel={t.menuClose}>
          <Feather name="x" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {/* 4-column image grid */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={COLS}
        contentContainerStyle={{
          paddingHorizontal: HPAD,
          paddingTop: 20,
          paddingBottom: 24,
          rowGap: 16,
        }}
        columnWrapperStyle={{ gap: GAP }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelectItem(item)}
            style={({ pressed }) => ({
              width: TILE_W,
              alignItems: "center",
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <View
              style={{
                width: TILE_W,
                height: TILE_W,
                borderRadius: 10,
                overflow: "hidden",
                backgroundColor: colors.secondary,
              }}
            >
              {item.image ? (
                <Image
                  source={item.image}
                  style={{ width: TILE_W, height: TILE_W }}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="image" size={16} color={colors.mutedForeground} />
                </View>
              )}
            </View>
            <AppText
              numberOfLines={2}
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 10,
                color: colors.primary,
                textAlign: "center",
                marginTop: 5,
                lineHeight: 13,
              }}
            >
              {item.name}
            </AppText>
          </Pressable>
        )}
      />
    </View>
  );
}

// ─── SideMenu ─────────────────────────────────────────────────────────────────

export function SideMenu({ visible, onClose, onOpenDelivery }: SideMenuProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { isRTL, lang, setLang } = useLanguage();
  const { token: authToken } = useAuth();
  const { selectedCountry } = useDeliveryLocation();
  const { currencyCode } = useCurrency();
  const isAE =
    selectedCountry?.code === "AE" || (!selectedCountry?.code && currencyCode === "AED");
  const categories = useOsCategories();
  const occasions = useOsOccasions();

  // Overall menu open/close animation
  const anim = useRef(new Animated.Value(0)).current;
  // Drag offset for swipe-to-close (applied to the whole menu)
  const dragX = useRef(new Animated.Value(0)).current;
  // Sub-panel slide: 0 = main panel, 1 = sub-panel
  const panelAnim = useRef(new Animated.Value(0)).current;

  const [mounted, setMounted] = useState(visible);
  const [activePanel, setActivePanel] = useState<ActivePanel>("main");

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setActivePanel("main");
      panelAnim.setValue(0);
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
        if (finished) {
          setMounted(false);
          setActivePanel("main");
          panelAnim.setValue(0);
        }
      });
    }
  }, [visible, mounted, anim, dragX, panelAnim]);

  const openSubPanel = (panel: "categories" | "occasions") => {
    setActivePanel(panel);
    Animated.timing(panelAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const goBack = () => {
    Animated.timing(panelAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setActivePanel("main"));
  };

  // LTR: main slides left, sub-panel comes from right.
  // RTL:  main slides right, sub-panel comes from left.
  const slideDir = isRTL ? 1 : -1;

  const mainTranslateX = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, slideDir * SCREEN_W],
  });
  const subTranslateX = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-slideDir * SCREEN_W, 0],
  });

  // Overall menu slides in/out from offscreen
  const menuBaseX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [isRTL ? SCREEN_W : -SCREEN_W, 0],
  });
  const menuTranslateX = Animated.add(menuBaseX, dragX);

  // Swipe-to-close (only active when main panel is showing)
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
        const shouldClose = Math.abs(dx) > SCREEN_W * 0.3 || vx * closeDir > 0.5;
        if (shouldClose) {
          Animated.timing(dragX, {
            toValue: closeDir * SCREEN_W,
            duration: 160,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            dragX.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(dragX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    })
  ).current;

  const navigate = (href: Href) => {
    onClose();
    setTimeout(() => router.push(href), 180);
  };

  const rowDir = isRTL ? "row-reverse" : "row";
  const ta: "left" | "right" = isRTL ? "right" : "left";

  const menuItems: {
    key: string;
    icon: keyof typeof Feather.glyphMap;
    label: string;
    onPress: () => void;
  }[] = [
    {
      key: "categories",
      icon: "grid",
      label: t.menuShopByCategory,
      onPress: () => openSubPanel("categories"),
    },
    {
      key: "occasions",
      icon: "gift",
      label: t.menuShopByOccasion,
      onPress: () => openSubPanel("occasions"),
    },
    ...(isAE
      ? []
      : [
          {
            key: "brands",
            icon: "award" as keyof typeof Feather.glyphMap,
            label: t.menuBrands,
            onPress: () => navigate("/(tabs)/catalog"),
          },
        ]),
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

  const categoryGridItems: GridItem[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    image: c.image,
  }));

  const occasionGridItems: GridItem[] = occasions.map((o) => ({
    id: o.id,
    name: o.name,
    image: o.image,
  }));

  const handleCategorySelect = (item: GridItem) => {
    onClose();
    setTimeout(
      () => router.push({ pathname: "/(tabs)/catalog", params: { category: item.id } }),
      180
    );
  };

  const handleOccasionSelect = (item: GridItem) => {
    onClose();
    setTimeout(
      () => router.push({ pathname: "/occasion/[slug]", params: { slug: item.id } }),
      180
    );
  };

  const subPanelTitle =
    activePanel === "categories" ? t.menuShopByCategory : t.menuShopByOccasion;
  const subPanelItems =
    activePanel === "categories" ? categoryGridItems : occasionGridItems;
  const handleSubSelect =
    activePanel === "categories" ? handleCategorySelect : handleOccasionSelect;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        {/* Full-screen menu — slides in as one unit */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.background,
              transform: [{ translateX: menuTranslateX }],
            },
          ]}
        >
          {/* ── Main panel ── */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { transform: [{ translateX: mainTranslateX }] },
            ]}
            // Attach swipe-to-close only when main panel is foreground
            {...(activePanel === "main" ? panResponder.panHandlers : {})}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: rowDir,
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 18,
                paddingTop: insets.top + 12,
                paddingBottom: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Wordmark size={22} />
              <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t.menuClose}>
                <Feather name="x" size={22} color={colors.primary} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 16 }}
              showsVerticalScrollIndicator={false}
            >
              {menuItems.map((it) => (
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
                    paddingVertical: 17,
                    backgroundColor: pressed ? colors.secondary : "transparent",
                  })}
                >
                  <Feather name={it.icon} size={20} color={colors.primary} />
                  <AppText
                    style={{
                      flex: 1,
                      fontFamily: "Inter_500Medium",
                      fontSize: 16,
                      color: colors.primary,
                      textAlign: ta,
                    }}
                  >
                    {it.label}
                  </AppText>
                  <Feather
                    name={isRTL ? "chevron-left" : "chevron-right"}
                    size={18}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              ))}

              {/* Language switcher */}
              <View
                style={{
                  marginTop: 12,
                  marginHorizontal: 22,
                  paddingTop: 18,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <AppText
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
                </AppText>
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
                          backgroundColor: active ? colors.primary : colors.secondary,
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <AppText
                          style={{
                            fontFamily: "Inter_500Medium",
                            fontSize: 13,
                            color: active ? "#fff" : colors.primary,
                          }}
                        >
                          {opt.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </Animated.View>

          {/* ── Sub-panel (categories / occasions grid) ── */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { transform: [{ translateX: subTranslateX }] },
            ]}
            pointerEvents={activePanel !== "main" ? "auto" : "none"}
          >
            <GridPanel
              title={subPanelTitle}
              items={subPanelItems}
              onBack={goBack}
              onClose={onClose}
              onSelectItem={handleSubSelect}
              isRTL={isRTL}
            />
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}
