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
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import React, { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { setBaseUrl } from "@workspace/api-client-react";

import { CartDrawer } from "@/components/CartDrawer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OnboardingLocationScreen } from "@/components/location/OnboardingLocationScreen";
import { AnimatedSplash } from "@/components/SplashScreen";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { DeliveryLocationProvider } from "@/contexts/DeliveryLocationProvider";
import { DeliverySelectionProvider } from "@/contexts/DeliverySelectionContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { OnboardingProvider, useOnboarding } from "@/contexts/OnboardingContext";
import { WooProductsProvider } from "@/contexts/WooProductsContext";
import { useAppInitialization } from "@/hooks/useAppInitialization";
import { API_BASE } from "@/lib/stripe";
import { reportClientError } from "@/lib/clientErrorReporter";
import { registerPushToken } from "@/services/notifications";

setBaseUrl(API_BASE);

SplashScreen.preventAutoHideAsync();

// Display incoming pushes as banners + sounds even when the app is in the
// foreground. Without this, foreground pushes are silently swallowed by
// expo-notifications.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // Silent data_refresh pushes from the server's scheduled WooCommerce
      // sync should never display UI — they only signal the app to
      // invalidate its caches. Suppress banner / sound / badge.
      const data = notification?.request?.content?.data ?? {};
      if ((data as { type?: string }).type === "data_refresh") {
        return {
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      };
    },
  });
}

// Re-register the push token when expo-notifications rotates it (this can
// happen when APNs/FCM expires the underlying device token). Lives at the
// module level because the listener API isn't tied to React lifecycle.
// Listen for silent `data_refresh` pushes from the server's scheduled
// WooCommerce sync and invalidate the React Query keys that back the
// homepage so the next render re-fetches the latest content. Foreground
// only — when the app is backgrounded, the existing AppState listener
// already triggers a product re-sync on resume.
function DataRefreshPushListener() {
  const qc = useQueryClient();
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationReceivedListener((notif) => {
      const data = notif?.request?.content?.data ?? {};
      if ((data as { type?: string }).type !== "data_refresh") return;
      qc.invalidateQueries({ queryKey: ["/api/homepage/categories"] });
      qc.invalidateQueries({ queryKey: ["/api/homepage/occasions"] });
      qc.invalidateQueries({ queryKey: ["/api/homepage/banners"] });
    });
    return () => {
      sub.remove();
    };
  }, [qc]);
  return null;
}

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
      <Stack.Screen name="personal-information" options={{ presentation: "card", animation: "slide_from_right" }} />
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
  const { hydrated: onboardingHydrated, needsOnboarding } = useOnboarding();
  const [splashGone, setSplashGone] = useState(false);

  const handleFadeOutEnd = useCallback(() => {
    setSplashGone(true);
  }, []);

  // Hold the splash open until we know whether onboarding is needed, so we
  // never flash the main navigator before the first-run picker (Task #286).
  const initReady = ready && onboardingHydrated;

  return (
    <>
      <PushTokenRotationListener />
      <DataRefreshPushListener />
      {/* Hard gate: until AsyncStorage has told us whether onboarding is
          required, render nothing under the splash. This prevents the home
          tab (and its product / homepage queries) from mounting on a fresh
          install before the first-run picker can be shown. */}
      {!onboardingHydrated ? null : needsOnboarding ? (
        <OnboardingLocationScreen />
      ) : (
        <>
          <RootLayoutNav />
          <CartDrawer />
        </>
      )}
      {!splashGone && <AnimatedSplash fadingOut={initReady} onFadeOutEnd={handleFadeOutEnd} />}
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
      <ErrorBoundary
        onError={(error, stackTrace) => {
          console.error(
            `[RootErrorBoundary] app crashed: ${error.message}`,
            stackTrace,
          );
          reportClientError({
            error,
            componentStack: stackTrace,
            route: "root",
            boundary: "root",
          });
        }}
      >
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <LanguageProvider>
                <OnboardingProvider>
                  <CurrencyProvider>
                    <DeliveryLocationProvider>
                      <AuthProvider>
                        <WooProductsProvider>
                          <CartProvider>
                            <DeliverySelectionProvider>
                              <AppShell fontsLoaded={fontsReady} />
                            </DeliverySelectionProvider>
                          </CartProvider>
                        </WooProductsProvider>
                      </AuthProvider>
                    </DeliveryLocationProvider>
                  </CurrencyProvider>
                </OnboardingProvider>
              </LanguageProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
