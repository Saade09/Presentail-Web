import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import * as WebBrowser from "expo-web-browser";
import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";

import { useCart } from "@/contexts/CartContext";
import { useColors } from "@/hooks/useColors";

const WC_LOGIN_URL = "https://presentail.com/lebanon/login";
const WC_ACCOUNT_URL = "https://presentail.com/lebanon/my-account/";
const ACCOUNT_KEY = "@presentail/has-account";

async function openAccountBrowser() {
  const v = await AsyncStorage.getItem(ACCOUNT_KEY);
  const url = v === "1" ? WC_ACCOUNT_URL : WC_LOGIN_URL;
  await WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  });
  await AsyncStorage.setItem(ACCOUNT_KEY, "1");
}

function TabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const { count, openCart } = useCart();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 10,
          letterSpacing: 1,
          textTransform: "uppercase",
        },
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
          title: "Home",
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
          title: "Boutique",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="square.grid.2x2" tintColor={color} size={22} />
            ) : (
              <Feather name="grid" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="brand"
        options={{
          title: "Brand",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="sparkles" tintColor={color} size={22} />
            ) : (
              <MaterialCommunityIcons name="diamond-stone" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarBadge: count > 0 ? count : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.gold,
            color: "#fff",
            fontSize: 10,
            fontFamily: "Inter_600SemiBold",
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
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            openCart();
          },
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person" tintColor={color} size={22} />
            ) : (
              <Feather name="user" size={20} color={color} />
            ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            openAccountBrowser();
          },
        }}
      />
    </Tabs>
  );
}

export default TabLayout;
