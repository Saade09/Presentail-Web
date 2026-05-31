import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Feather, Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, View, useColorScheme } from "react-native";
import { AppText } from "@/components/AppText";

import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useTypography } from "@/hooks/useTypography";
import { translations } from "@/lib/translations";
import { loadCartScreen, loadCatalogScreen, prefetchOnInteraction } from "@/lib/prefetchScreens";

function TabLayout() {
  const colors = useColors();
  const typo = useTypography();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const { count } = useCart();
  const { lang } = useLanguage();
  const t = translations[lang];
  const { user } = useAuth();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarLabel: ({ children, color }) => (
          <AppText
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 10,
              letterSpacing: 1,
              textTransform: "uppercase",
              color,
            }}
          >
            {children}
          </AppText>
        ),
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.home,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={22} />
            ) : (
              <Feather name="home" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: t.boutique,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="square.grid.2x2" tintColor={color} size={22} />
            ) : (
              <Feather name="grid" size={20} color={color} />
            ),
          tabBarButton: (props) => (
            <Pressable
              {...(props as React.ComponentProps<typeof Pressable>)}
              onPressIn={(e) => {
                prefetchOnInteraction(loadCatalogScreen).onPressIn();
                props.onPressIn?.(e);
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: t.cart,
          tabBarBadge: count > 0 ? count : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.gold,
            color: "#fff",
            fontSize: 10,
            fontFamily: typo.semibold,
            minWidth: 16,
            height: 16,
            lineHeight: 16,
          },
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView
                name={count > 0 ? "bag.fill" : "bag"}
                tintColor={count > 0 ? colors.gold : color}
                size={22}
              />
            ) : (
              <Feather name="shopping-bag" size={20} color={count > 0 ? colors.gold : color} />
            ),
          tabBarButton: (props) => (
            <Pressable
              {...(props as React.ComponentProps<typeof Pressable>)}
              onPressIn={(e) => {
                prefetchOnInteraction(loadCartScreen).onPressIn();
                props.onPressIn?.(e);
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t.favorites,
          href: user ? undefined : null,
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "heart.fill" : "heart"} tintColor={color} size={22} />
            ) : (
              <Ionicons name={focused ? "heart" : "heart-outline"} size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t.account,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person" tintColor={color} size={22} />
            ) : (
              <Feather name="user" size={20} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default TabLayout;
