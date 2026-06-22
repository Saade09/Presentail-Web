import { vi } from "vitest";

// react-native/index.js uses Flow's `import typeof` syntax which neither Vite
// nor Node can parse. Mock the entire module — including for CJS require()
// calls from @testing-library/react-native — so we never load the real source.
vi.mock("react-native", async () => {
  return await import("./__mocks__/react-native");
});

vi.mock("expo-modules-core", () => ({
  EventEmitter: class {
    addListener() { return { remove: () => {} }; }
    emit() {}
    removeAllListeners() {}
    listenerCount() { return 0; }
  },
  NativeModulesProxy: new Proxy({}, { get: (_t, p) => vi.fn(() => Promise.resolve()) }),
  requireNativeModule: (_name: string) => new Proxy({}, { get: (_t, p) => vi.fn(() => Promise.resolve()) }),
  requireOptionalNativeModule: () => null,
  uuid: () => "00000000-0000-0000-0000-000000000000",
}));

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { name: "Presentail", slug: "presentail", extra: {} },
    manifest: null,
    manifest2: null,
    appOwnership: null,
    sessionId: "test-session-id",
    statusBarHeight: 20,
    systemFonts: [],
    platform: { ios: { buildNumber: "1", bundleIdentifier: "com.presentail.lb" } },
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
    getAllKeys: vi.fn(() => Promise.resolve([])),
    multiGet: vi.fn(() => Promise.resolve([])),
    multiSet: vi.fn(() => Promise.resolve()),
    multiRemove: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(() => Promise.resolve(null)),
  setItemAsync: vi.fn(() => Promise.resolve()),
  deleteItemAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock("expo-updates", () => ({
  isEnabled: false,
  reloadAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(() => Promise.resolve({ status: "undetermined" })),
  requestPermissionsAsync: vi.fn(() => Promise.resolve({ status: "denied" })),
  getExpoPushTokenAsync: vi.fn(() => Promise.resolve({ data: "" })),
  addNotificationReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  setNotificationHandler: vi.fn(),
}));

vi.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: vi.fn(() => Promise.resolve({ status: "denied" })),
  getCurrentPositionAsync: vi.fn(() => Promise.reject(new Error("mocked"))),
  Accuracy: { Lowest: 1 },
}));

vi.mock("react-native-svg", () => ({
  default: vi.fn(() => null),
  Svg: vi.fn(() => null),
  Path: vi.fn(() => null),
  SvgXml: vi.fn(() => null),
  G: vi.fn(() => null),
  Rect: vi.fn(() => null),
  Circle: vi.fn(() => null),
}));

vi.mock("@expo/vector-icons", () => {
  const iconComponent = vi.fn(() => null);
  return {
    Feather: iconComponent,
    AntDesign: iconComponent,
    Ionicons: iconComponent,
    MaterialIcons: iconComponent,
    FontAwesome: iconComponent,
  };
});
