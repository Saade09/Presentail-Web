import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_500Medium,
  PlayfairDisplay_600SemiBold,
} from "@expo-google-fonts/playfair-display";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CartDrawer } from "@/components/CartDrawer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CartProvider } from "@/contexts/CartContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { WooProductsProvider } from "@/contexts/WooProductsContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back", headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="product/[slug]" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="category/[slug]" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="cart" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="occasion/[slug]" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="checkout" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="order-confirmed" options={{ presentation: "card", animation: "fade", gestureEnabled: false }} />
      <Stack.Screen name="faq" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="contact" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="brand/[slug]" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="occasions" options={{ presentation: "card", animation: "slide_from_right" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <LanguageProvider>
              <CurrencyProvider>
                <WooProductsProvider>
                  <CartProvider>
                    <RootLayoutNav />
                    <CartDrawer />
                  </CartProvider>
                </WooProductsProvider>
              </CurrencyProvider>
            </LanguageProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
