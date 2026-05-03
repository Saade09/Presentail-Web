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
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import React, { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CartDrawer } from "@/components/CartDrawer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AnimatedSplash } from "@/components/SplashScreen";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { DeliveryLocationProvider } from "@/contexts/DeliveryLocationProvider";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { WooProductsProvider } from "@/contexts/WooProductsContext";
import { useAppInitialization } from "@/hooks/useAppInitialization";
import { registerPushToken } from "@/services/notifications";

SplashScreen.preventAutoHideAsync();

// Display incoming pushes as banners + sounds even when the app is in the
// foreground. Without this, foreground pushes are silently swallowed by
// expo-notifications.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// Re-register the push token when expo-notifications rotates it (this can
// happen when APNs/FCM expires the underlying device token). Lives at the
// module level because the listener API isn't tied to React lifecycle.
function PushTokenRotationListener() {
  const { token: authToken, user } = useAuth();
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addPushTokenListener(() => {
      registerPushToken({
        authToken,
        userId: user?.id ?? null,
      }).catch(() => {});
    });
    return () => {
      sub.remove();
    };
  }, [authToken, user?.id]);
  return null;
}

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back", headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="product/[slug]" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="category/[slug]" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="occasion/[slug]" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="checkout" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="order-confirmed" options={{ presentation: "card", animation: "fade", gestureEnabled: false }} />
      <Stack.Screen name="faq" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="terms" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="contact" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="brand/[slug]" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="occasions" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="notification-preferences" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen
        name="auth"
        options={{ presentation: "card", animation: "slide_from_right", gestureEnabled: true }}
      />
      <Stack.Screen name="privacy" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="reset-password" options={{ presentation: "card", animation: "slide_from_right" }} />
    </Stack>
  );
}

// Auto-apply OTA updates on cold launch (TestFlight / App Store builds).
function useAutoUpdate() {
  useEffect(() => {
    if (__DEV__) return;
    if (Platform.OS === "web") return;
    let cancelled = false;
    (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (cancelled) return;
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          if (cancelled) return;
          await Updates.reloadAsync();
        }
      } catch {
        // silent — updates are best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}

function AppShell({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { ready } = useAppInitialization({ fontsLoaded });
  const [splashGone, setSplashGone] = useState(false);

  const handleFadeOutEnd = useCallback(() => {
    setSplashGone(true);
  }, []);

  return (
    <>
      <PushTokenRotationListener />
      <RootLayoutNav />
      <CartDrawer />
      {!splashGone && <AnimatedSplash fadingOut={ready} onFadeOutEnd={handleFadeOutEnd} />}
    </>
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

  useAutoUpdate();

  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    if (fontsReady) {
      // Hand off from the native splash to the in-app animated splash. The
      // native splash and in-app splash share the same cream background and
      // dark-teal logo so the transition is seamless.
      SplashScreen.hideAsync().catch(() => {
        // ignore — already hidden
      });
    }
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <LanguageProvider>
                <CurrencyProvider>
                  <DeliveryLocationProvider>
                    <AuthProvider>
                      <WooProductsProvider>
                        <CartProvider>
                          <AppShell fontsLoaded={fontsReady} />
                        </CartProvider>
                      </WooProductsProvider>
                    </AuthProvider>
                  </DeliveryLocationProvider>
                </CurrencyProvider>
              </LanguageProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
