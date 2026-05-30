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
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

import { CartDrawer } from "@/components/CartDrawer";
import { useCart } from "@/contexts/CartContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OnboardingLocationScreen } from "@/components/location/OnboardingLocationScreen";
import { AnimatedSplash } from "@/components/SplashScreen";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { DeliveryLocationProvider } from "@/contexts/DeliveryLocationProvider";
import { DeliverySelectionProvider } from "@/contexts/DeliverySelectionContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { OnboardingProvider, useOnboarding } from "@/contexts/OnboardingContext";
import { WooProductsProvider } from "@/contexts/WooProductsContext";
import { useAppInitialization } from "@/hooks/useAppInitialization";
import { API_BASE } from "@/lib/stripe";
import { trackEvent } from "@/lib/analytics";
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
// Coalesce bursts of silent `data_refresh` pushes from the server's
// scheduled WC sync. Without this throttle a single sync that fans out
// across multiple stores / topics can fire several pushes in quick
// succession, each triggering full homepage re-fetches and re-renders
// that pin the JS thread (and noticeably warm the device).
const DATA_REFRESH_MIN_INTERVAL_MS = 60 * 1000;

function DataRefreshPushListener() {
  const qc = useQueryClient();
  useEffect(() => {
    if (Platform.OS === "web") return;
    let lastInvalidatedAt = 0;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    const runInvalidations = () => {
      lastInvalidatedAt = Date.now();
      qc.invalidateQueries({ queryKey: ["/api/homepage/categories"] });
      qc.invalidateQueries({ queryKey: ["/api/homepage/occasions"] });
      qc.invalidateQueries({ queryKey: ["/api/homepage/banners"] });
    };
    const sub = Notifications.addNotificationReceivedListener((notif) => {
      const data = notif?.request?.content?.data ?? {};
      if ((data as { type?: string }).type !== "data_refresh") return;
      const sinceLast = Date.now() - lastInvalidatedAt;
      if (sinceLast >= DATA_REFRESH_MIN_INTERVAL_MS) {
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          pendingTimer = null;
        }
        runInvalidations();
        return;
      }
      // Within the throttle window — schedule a single trailing
      // invalidation so the latest push still takes effect, but we
      // don't re-fetch on every burst notification.
      if (pendingTimer) return;
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        runInvalidations();
      }, DATA_REFRESH_MIN_INTERVAL_MS - sinceLast);
    });
    return () => {
      if (pendingTimer) clearTimeout(pendingTimer);
      sub.remove();
    };
  }, [qc]);
  return null;
}

function openOrderTrackingUrl(url: string) {
  Linking.openURL(url).catch(() => {});
}

function handleOrderEventResponse(
  response: Notifications.NotificationResponse | null | undefined,
) {
  if (!response) return;
  const data = (response.notification?.request?.content?.data ?? {}) as Record<string, unknown>;
  if (data.type !== "order_event") return;
  const url = typeof data.url === "string" ? data.url : null;
  if (url) {
    const toStr = (v: unknown): string | undefined =>
      typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;
    trackEvent({
      name: "order_push_tapped",
      state: toStr(data.state),
      appOrderId: toStr(data.appOrderId),
      wcOrderId: toStr(data.wcOrderId),
    });
    openOrderTrackingUrl(url);
  }
}

function OrderEventPushHandler() {
  const handledInitialRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web") return;

    // Killed-state: when the app is cold-launched by a notification tap,
    // getLastNotificationResponseAsync returns the triggering response.
    // We handle it once on mount and mark it so the live listener won't
    // double-open if the same response is emitted again.
    let lastResponseIdentifier: string | null = null;
    if (!handledInitialRef.current) {
      handledInitialRef.current = true;
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (!response) return;
          lastResponseIdentifier = response.notification.request.identifier;
          handleOrderEventResponse(response);
        })
        .catch(() => {});
    }

    // Foreground + background: fires whenever the user taps a notification
    // while the app is running or resumes from background.
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        if (
          lastResponseIdentifier &&
          response.notification.request.identifier === lastResponseIdentifier
        ) {
          // Already handled via getLastNotificationResponseAsync — skip.
          lastResponseIdentifier = null;
          return;
        }
        handleOrderEventResponse(response);
      },
    );

    return () => {
      sub.remove();
    };
  }, []);

  return null;
}

function ApiAuthTokenSync() {
  const { token } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(token ? () => token : null);
    return () => {
      setAuthTokenGetter(null);
    };
  }, [token]);
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

/**
 * Handles cart → checkout navigation from within the Stack navigator.
 * CartDrawer is mounted outside RootLayoutNav so router.push from there
 * has no navigator to push onto. Instead, CartDrawer calls
 * requestNavigation() on CartContext, which sets pendingNavigation and
 * closes the modal. This component (inside the Stack) watches for that
 * signal and fires the push once the modal is gone.
 */
function CartNavigationHandler() {
  const router = useRouter();
  const { isCartOpen, pendingNavigation, clearPendingNavigation } = useCart();
  React.useEffect(() => {
    if (!isCartOpen && pendingNavigation) {
      clearPendingNavigation();
      router.push(pendingNavigation as any);
    }
  }, [isCartOpen, pendingNavigation, clearPendingNavigation, router]);
  return null;
}

function RootLayoutNav() {
  return (
    <>
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
      <Stack.Screen name="saved-addresses/index" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="saved-addresses/[id]" options={{ presentation: "card", animation: "slide_from_right" }} />
    </Stack>
    <CartNavigationHandler />
    </>
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
      <ApiAuthTokenSync />
      <PushTokenRotationListener />
      <DataRefreshPushListener />
      <OrderEventPushHandler />
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
                        <FavoritesProvider>
                        <WooProductsProvider>
                          <CartProvider>
                            <DeliverySelectionProvider>
                              <AppShell fontsLoaded={fontsReady} />
                            </DeliverySelectionProvider>
                          </CartProvider>
                        </WooProductsProvider>
                        </FavoritesProvider>
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
