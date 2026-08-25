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

export type MockMeasurement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const DEFAULT_MEASUREMENT: MockMeasurement = { x: 0, y: 0, width: 0, height: 0 };
let mockWindowDimensions = { width: 375, height: 812, scale: 2, fontScale: 1 };
const mockMeasurements: Record<string, MockMeasurement> = {};

/**
 * Configure geometry for component tests that rely on native layout APIs.
 * These controls are intentionally kept in the test-only native stub rather
 * than in production components.
 */
export function __setMockWindowDimensions(
  dimensions: Partial<typeof mockWindowDimensions>,
): void {
  mockWindowDimensions = { ...mockWindowDimensions, ...dimensions };
}

export function __setMockMeasurement(tag: string, measurement: MockMeasurement): void {
  mockMeasurements[tag] = measurement;
}

export function __resetMockGeometry(): void {
  mockWindowDimensions = { width: 375, height: 812, scale: 2, fontScale: 1 };
  for (const tag of Object.keys(mockMeasurements)) delete mockMeasurements[tag];
}

const host =
  (tag: string) =>
  (props: AnyProps): React.ReactElement =>
    (React.createElement as (...a: unknown[]) => React.ReactElement)(tag, props);

export const Text = host("Text");
const measuredHost = (tag: string) =>
  React.forwardRef<{ measureInWindow: (callback: (...values: number[]) => void) => void }, AnyProps>(
    (props, ref) => {
      React.useImperativeHandle(ref, () => ({
        measureInWindow(callback) {
          const { x, y, width, height } = mockMeasurements[tag] ?? DEFAULT_MEASUREMENT;
          callback(x, y, width, height);
        },
      }));
      return (React.createElement as (...a: unknown[]) => React.ReactElement)(tag, props);
    },
  );

export const View = measuredHost("View");
export const ScrollView = host("ScrollView");
export const SafeAreaView = host("SafeAreaView");
export const TouchableOpacity = host("TouchableOpacity");
export const TouchableHighlight = host("TouchableHighlight");
export const Pressable = measuredHost("Pressable");
export const KeyboardAvoidingView = host("KeyboardAvoidingView");
export const Modal = ({ visible, children, ...rest }: AnyProps): React.ReactElement | null => {
  if (visible === false) return null;
  return (React.createElement as (...a: unknown[]) => React.ReactElement)("Modal", rest, children);
};
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
  timing(_: unknown, _c: unknown) { return { start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }) }; },
  spring(_: unknown, _c: unknown) { return { start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }) }; },
  sequence(anims: Array<{ start: (cb?: () => void) => void }>) {
    return { start: (cb?: () => void) => { anims.forEach((a) => a.start()); cb?.(); } };
  },
  createAnimatedComponent<T>(Component: T): T { return Component; },
  add(_a: unknown, _b: unknown) { return new AnimatedValue(0); },
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
export const useWindowDimensions = () => mockWindowDimensions;

export const TouchableWithoutFeedback = host("TouchableWithoutFeedback");

export const PanResponder = {
  create: (_config: Record<string, unknown>) => ({
    panHandlers: {},
  }),
};

export const Easing = {
  out: (fn: (t: number) => number) => fn,
  in: (fn: (t: number) => number) => fn,
  inOut: (fn: (t: number) => number) => fn,
  cubic: (t: number) => t,
  linear: (t: number) => t,
  ease: (t: number) => t,
  quad: (t: number) => t,
  circle: (t: number) => t,
  bounce: (t: number) => t,
  back: (_s?: number) => (t: number) => t,
  elastic: (_bounciness?: number) => (t: number) => t,
  bezier: (_x1: number, _y1: number, _x2: number, _y2: number) => (t: number) => t,
  sin: (t: number) => t,
  exp: (t: number) => t,
  poly: (_n: number) => (t: number) => t,
  step0: (n: number) => n,
  step1: (n: number) => n,
};

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
