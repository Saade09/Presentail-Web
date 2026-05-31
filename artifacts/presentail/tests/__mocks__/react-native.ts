/**
 * Minimal react-native stub for vitest component tests.
 *
 * Vitest (Vite/Rollup) cannot parse react-native's Flow-typed index.js, so we
 * redirect all imports of "react-native" here via a vitest.config.ts alias (for
 * ESM imports processed by Vite) and a vi.mock() call in setup.ts (for CJS
 * require() calls from node_modules).
 *
 * Text / View / Animated.View render as named host components ("Text", "View"
 * etc.) so react-test-renderer's toJSON() output includes them — enabling
 * getByText() lookups in test-utils.tsx.
 *
 * Only extend this file when a new component test needs an export that is
 * currently missing; keep stubs minimal.
 */

import * as React from "react";

type AnyProps = { children?: React.ReactNode; [key: string]: unknown };

const host =
  (tag: string) =>
  (props: AnyProps): React.ReactElement =>
    (React.createElement as (...a: unknown[]) => React.ReactElement)(tag, props);

export const Text = host("Text");
export const View = host("View");
export const ScrollView = host("ScrollView");
export const SafeAreaView = host("SafeAreaView");
export const TouchableOpacity = host("TouchableOpacity");
export const TouchableHighlight = host("TouchableHighlight");
export const Pressable = host("Pressable");
export const KeyboardAvoidingView = host("KeyboardAvoidingView");
export const Modal = host("Modal");
export const TextInput = host("TextInput");
export const Image = host("Image");
export const FlatList = () => null;
export const SectionList = () => null;
export const ActivityIndicator = () => null;

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: (style: unknown) => style,
  hairlineWidth: 1,
  absoluteFill: {} as const,
  absoluteFillObject: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as const,
};

class AnimatedValue {
  constructor(public _value: number) {}
  interpolate() { return this; }
  setValue(_v: number) {}
  addListener() { return { remove: () => {} }; }
  removeListener() {}
}

export const Animated = {
  Value: AnimatedValue,
  View: host("AnimatedView"),
  Text: host("AnimatedText"),
  Image: () => null,
  timing(_: unknown, _c: unknown) { return { start: (cb?: () => void) => cb?.() }; },
  spring(_: unknown, _c: unknown) { return { start: (cb?: () => void) => cb?.() }; },
  sequence(anims: Array<{ start: (cb?: () => void) => void }>) {
    return { start: (cb?: () => void) => { anims.forEach((a) => a.start()); cb?.(); } };
  },
  createAnimatedComponent<T>(Component: T): T { return Component; },
};

export const Platform = {
  OS: "ios" as const,
  select: <T extends Record<string, unknown>>(obj: T): T[keyof T] =>
    ((obj as Record<string, unknown>).ios ?? (obj as Record<string, unknown>).default) as T[keyof T],
  Version: 17,
};

export const Dimensions = {
  get: (_dim: string) => ({ width: 375, height: 812 }),
  addEventListener: () => ({ remove: () => {} }),
};

export const PixelRatio = {
  get: () => 2,
  roundToNearestPixel: (v: number) => v,
  getPixelSizeForLayoutSize: (size: number) => size * 2,
};

export const I18nManager = { isRTL: false, forceRTL: () => {}, allowRTL: () => {} };
export const Alert = { alert: () => {} };
export const Keyboard = { dismiss: () => {}, addListener: () => ({ remove: () => {} }) };
export const AppState = { currentState: "active", addEventListener: () => ({ remove: () => {} }) };
export const AccessibilityInfo = { isScreenReaderEnabled: () => Promise.resolve(false) };
export const Share = { share: () => Promise.resolve({ action: "sharedAction" }) };
export const Linking = {
  openURL: () => Promise.resolve(),
  canOpenURL: () => Promise.resolve(true),
  getInitialURL: () => Promise.resolve(null),
  addEventListener: () => ({ remove: () => {} }),
};
export const Vibration = { vibrate: () => {}, cancel: () => {} };
export const BackHandler = { addEventListener: () => ({ remove: () => {} }), exitApp: () => {} };
export const NativeModules = {};
export const useColorScheme = () => null as string | null;
export const useWindowDimensions = () => ({ width: 375, height: 812, scale: 2, fontScale: 1 });

export default {
  Text,
  View,
  StyleSheet,
  Animated,
  Platform,
  Dimensions,
  Pressable,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
  ScrollView,
  FlatList,
  ActivityIndicator,
};
