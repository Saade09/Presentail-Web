import { Feather } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import React, { ComponentType, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorFallbackProps } from "@/components/ErrorFallback";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { reportClientError } from "@/lib/clientErrorReporter";

type RouteErrorFallbackProps = ErrorFallbackProps & { routeName: string };

function RouteErrorFallback({
  error,
  resetError,
  routeName,
}: RouteErrorFallbackProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useT();
  const [isModalVisible, setIsModalVisible] = useState(false);

  const canGoBack = router.canGoBack();
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
    resetError();
  };

  const monoFont = Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  });

  const formatErrorDetails = (): string => {
    let details = `Route: ${routeName}\nError: ${error.message}\n\n`;
    if (error.stack) details += `Stack Trace:\n${error.stack}`;
    return details;
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + 24 },
      ]}
    >
      {__DEV__ ? (
        <Pressable
          onPress={() => setIsModalVisible(true)}
          accessibilityLabel="View error details" // i18n-ignore
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.topButton,
            {
              top: insets.top + 16,
              backgroundColor: colors.card,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Feather name="alert-circle" size={20} color={colors.foreground} />
        </Pressable>
      ) : null}

      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {t.errorScreenSomethingWrong}
        </Text>
        <Text style={[styles.message, { color: colors.mutedForeground }]}>
          You can go back and try again. The rest of the app is still working.
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={resetError}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <Text
              style={[styles.buttonText, { color: colors.primaryForeground }]}
            >
              {t.errorTryAgain}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[styles.buttonText, { color: colors.foreground }]}
            >
              {canGoBack ? "Go Back" : "Go Home"}
            </Text>
          </Pressable>
        </View>
      </View>

      {__DEV__ ? (
        <Modal
          visible={isModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContainer,
                { backgroundColor: colors.background },
              ]}
            >
              <View
                style={[
                  styles.modalHeader,
                  { borderBottomColor: colors.border },
                ]}
              >
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  Error Details {/* i18n-ignore */}
                </Text>
                <Pressable
                  onPress={() => setIsModalVisible(false)}
                  accessibilityLabel="Close error details" // i18n-ignore
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.closeButton,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Feather name="x" size={24} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView
                style={styles.modalScrollView}
                contentContainerStyle={[
                  styles.modalScrollContent,
                  { paddingBottom: insets.bottom + 16 },
                ]}
                showsVerticalScrollIndicator
              >
                <View
                  style={[
                    styles.errorContainer,
                    { backgroundColor: colors.card },
                  ]}
                >
                  <Text
                    style={[
                      styles.errorText,
                      { color: colors.foreground, fontFamily: monoFont },
                    ]}
                    selectable
                  >
                    {formatErrorDetails()}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

export function withRouteErrorBoundary<P extends object>(
  Component: ComponentType<P>,
  routeName: string,
): ComponentType<P> {
  const Fallback = (props: ErrorFallbackProps) => (
    <RouteErrorFallback {...props} routeName={routeName} />
  );

  // Named function (not an inline arrow in JSX) so the React Compiler does
  // not lift it into a module-level _tempN where `routeName` is out of scope.
  function handleError(error: Error, stackTrace: string) {
    console.error(
      `[RouteErrorBoundary] ${routeName} crashed: ${error.message}`,
      stackTrace,
    );
    reportClientError({
      error,
      componentStack: stackTrace,
      route: routeName,
      boundary: "route",
    });
  }

  // Reads the current focused pathname and forwards it as resetKey so the
  // boundary automatically clears when the user navigates to a different
  // screen — preventing the error fallback from staying stuck after
  // navigation (same pattern as the web RouteErrorBoundary).
  const Wrapped: ComponentType<P> = (props) => {
    const pathname = usePathname();
    return (
      <ErrorBoundary FallbackComponent={Fallback} onError={handleError} resetKey={pathname}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };

  Wrapped.displayName = `withRouteErrorBoundary(${routeName})`;
  return Wrapped;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    width: "100%",
    maxWidth: 600,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 32,
  },
  message: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  actions: {
    width: "100%",
    gap: 12,
    marginTop: 8,
    alignItems: "center",
  },
  topButton: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 8,
    paddingHorizontal: 24,
    minWidth: 220,
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 8,
    paddingHorizontal: 24,
    minWidth: 220,
    borderWidth: 1,
  },
  buttonText: {
    fontWeight: "600",
    textAlign: "center",
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    width: "100%",
    height: "90%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
  },
  errorContainer: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    padding: 16,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    width: "100%",
  },
});
