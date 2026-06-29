// @vitest-environment jsdom

/**
 * App-level integration test: attribution captured on direct /checkout landing
 *
 * This test mounts the real `App` component (with mocked heavy dependencies)
 * to verify that `AttributionTracker` — rendered as a non-lazy sibling of
 * `RootRouter` in App.tsx — writes attribution to localStorage during the
 * initial commit, before the lazy `Checkout` chunk can resolve and before a
 * `createOrder` mutation could ever fire.
 *
 * Regression target: a future change that moves `AttributionTracker` inside a
 * `<Suspense>` boundary, places it below `RootRouter`, or makes `Checkout`
 * non-lazy would silently break attribution for direct /checkout ad landings.
 * This test catches all three cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";

// Silence jsdom "Not implemented: window.scrollTo()" warnings emitted by
// the ScrollToTop component in App.tsx — it calls window.scrollTo() in a
// requestAnimationFrame callback triggered by route changes.
Object.defineProperty(window, "scrollTo", { value: vi.fn(), writable: true });

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — declared BEFORE importing App so Vitest hoists them correctly.
// `@/lib/attribution` is intentionally NOT mocked — we test the real function.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve()),
  del: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tanstack/query-async-storage-persister", () => ({
  createAsyncStoragePersister: vi.fn(() => ({})),
}));

// Replace PersistQueryClientProvider with a regular QueryClientProvider so
// the IDB-backed persister never actually runs during tests.
vi.mock("@tanstack/react-query-persist-client", async () => {
  const rq = await import("@tanstack/react-query");
  return {
    PersistQueryClientProvider: ({
      children,
      client,
    }: {
      children: React.ReactNode;
      client: InstanceType<typeof rq.QueryClient>;
    }) => React.createElement(rq.QueryClientProvider, { client }, children),
  };
});

// wouter — return the locale-prefixed checkout path so RootRouter routes into
// ShopShell → checkout route.
vi.mock("wouter", () => {
  const CHECKOUT_PATH = "/en-lb/beirut/checkout";
  return {
    Router: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Switch: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Route: ({
      path,
      component: Comp,
      children,
    }: {
      path?: string;
      component?: React.ComponentType;
      children?: React.ReactNode;
    }) => {
      if (path === "/checkout") {
        return Comp
          ? React.createElement(Comp)
          : (children as React.ReactElement) ?? null;
      }
      return null;
    },
    Redirect: () => null,
    useLocation: vi.fn(() => [CHECKOUT_PATH, vi.fn()]),
    useRouter: vi.fn(() => ({ base: "" })),
  };
});

// locale-route — parseLocalePath always matches the checkout URL so RootRouter
// renders ShopShell with the locale prefix present.
vi.mock("@/lib/locale-route", () => ({
  parseLocalePath: vi.fn(() => ({
    hasLocalePrefix: true,
    lang: "en",
    country: "lb",
    city: "beirut",
  })),
  buildLocalePath: vi.fn(
    ({ lang, country, city }: { lang: string; country: string; city: string }) =>
      `/${lang}-${country}/${city}`,
  ),
  cityIdToSlug: vi.fn((id: string) =>
    id.includes("-") ? id.split("-").slice(1).join("-") : id,
  ),
  countryCodeToSlug: vi.fn((code: string) => code.toLowerCase()),
  isSupportedCity: vi.fn(() => true),
  isSupportedCountrySlug: vi.fn(() => true),
  SUPPORTED_LANGS: ["en", "ar", "fr"],
  SUPPORTED_COUNTRY_SLUGS: ["lb", "ae", "cy"],
  CITY_SLUGS_BY_COUNTRY: { lb: ["beirut"], ae: ["dubai"], cy: ["nicosia"] },
}));

// Context providers — pass-through wrappers; none should make real network calls.
vi.mock("@/contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  AuthOverrideContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
  useAuth: vi.fn(() => ({
    user: null,
    userType: null,
    isLoading: false,
    token: null,
    logout: vi.fn(),
    deleteAccount: vi.fn(),
    getToken: vi.fn(),
    provider: null,
    login: vi.fn(),
    updateUser: vi.fn(),
  })),
}));

vi.mock("@/contexts/CartContext", () => ({
  CartProvider: ({ children }: { children: React.ReactNode }) => children,
  CartContext: React.createContext({}),
  useCart: vi.fn(() => ({ items: [], itemCount: 0 })),
}));

vi.mock("@/contexts/FavoritesContext", () => ({
  FavoritesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/contexts/DeliverySelectionContext", () => ({
  DeliverySelectionProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("@/contexts/LocaleContext", () => ({
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
  LocaleContext: React.createContext({
    language: "en",
    dir: "ltr",
    t: (k: string) => k,
    setLanguage: () => {},
    countryName: (_: string, fb: string) => fb,
    cityName: (_: string, fb: string) => fb,
  }),
  useLocale: vi.fn(() => ({
    language: "en",
    dir: "ltr",
    t: (k: string) => k,
    setLanguage: vi.fn(),
    countryName: (_: string, fb: string) => fb,
    cityName: (_: string, fb: string) => fb,
  })),
}));

vi.mock("@/contexts/LocationContext", () => ({
  LocationProvider: ({ children }: { children: React.ReactNode }) => children,
  useLocationSelection: vi.fn(() => ({
    countryCode: "LB",
    cityId: "lb-beirut",
    countries: [{ code: "LB", cities: [{ id: "lb-beirut" }] }],
    isLoadingCountries: false,
  })),
}));

vi.mock("@/lib/queries", () => ({
  useCurrenciesData: vi.fn(() => ({ data: null })),
}));

vi.mock("@/lib/currency", () => ({
  setCurrencySnapshot: vi.fn(),
}));

vi.mock("@/lib/prefetch", () => ({
  prefetchOnIdle: vi.fn(() => () => {}),
}));

vi.mock("@/lib/fbPixel", () => ({
  initPixel: vi.fn(),
  trackFbPageView: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@workspace/clerk-types", () => ({
  isUserType: vi.fn(() => false),
  canShop: vi.fn(() => true),
}));

// UI primitives
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/SeoHead", () => ({ SeoHead: () => null }));

vi.mock("@/components/ErrorBoundary", () => ({
  CheckoutErrorBoundary: ({ children }: { children: React.ReactNode }) =>
    children,
  RouteErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/LocationPickerGate", () => ({
  LocationPickerGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/PageLoader", () => ({ PageLoader: () => null }));
vi.mock("@/components/skeletons/HomePageSkeleton", () => ({
  HomePageSkeleton: () => null,
}));
vi.mock("@/components/skeletons/ShopPageSkeleton", () => ({
  ShopPageSkeleton: () => null,
}));
vi.mock("@/components/skeletons/ProductDetailSkeleton", () => ({
  ProductDetailSkeleton: () => null,
}));
vi.mock("@/components/skeletons/CheckoutSkeleton", () => ({
  CheckoutSkeleton: () => null,
}));
vi.mock("@/components/skeletons/AccountSkeleton", () => ({
  AccountSkeleton: () => null,
}));
vi.mock("@/components/skeletons/HeaderSkeleton", () => ({
  HeaderSkeleton: () => null,
}));
vi.mock("@/components/ui/toaster", () => ({ Toaster: () => null }));

// Page loaders — each lazy() call in App.tsx resolves through these.
// loadCheckout is the critical one: the test verifies attribution fires
// before this chunk's contents can call createOrder.
// NOTE: factories must use inline literals (not top-level vars) because
// vi.mock is hoisted above variable declarations by Vitest.
// loadCheckout is a vi.fn() so individual tests can override its return value
// (e.g. to a never-resolving promise) to simulate the true "chunk pending" state.
vi.mock("@/lib/pageLoaders", () => ({
  loadHome: () => Promise.resolve({ default: () => null }),
  loadShop: () => Promise.resolve({ default: () => null }),
  loadProductDetail: () => Promise.resolve({ default: () => null }),
  loadCart: () => Promise.resolve({ default: () => null }),
  loadCheckout: vi.fn(() => Promise.resolve({ default: () => null })),
  loadSignIn: () => Promise.resolve({ default: () => null }),
  loadSignUp: () => Promise.resolve({ default: () => null }),
  loadAccount: () => Promise.resolve({ default: () => null }),
  loadFavorites: () => Promise.resolve({ default: () => null }),
  loadBrands: () => Promise.resolve({ default: () => null }),
  loadBrandDetail: () => Promise.resolve({ default: () => null }),
  loadAllOccasions: () => Promise.resolve({ default: () => null }),
  loadHomepageHeader: () => Promise.resolve({ default: () => null }),
  loadFooter: () => Promise.resolve({ default: () => null }),
}));

// Remaining lazy pages referenced directly in App.tsx
vi.mock("@/pages/Landing", () => ({ default: () => null }));
vi.mock("@/pages/OrderConfirmed", () => ({ default: () => null }));
vi.mock("@/pages/PersonalInformation", () => ({ default: () => null }));
vi.mock("@/pages/Unauthorized", () => ({ default: () => null }));
vi.mock("@/pages/Careers", () => ({ default: () => null }));
vi.mock("@/pages/Blog", () => ({ default: () => null }));
vi.mock("@/pages/BlogPost", () => ({ default: () => null }));
vi.mock("@/pages/Partner", () => ({ default: () => null }));
vi.mock("@/pages/Weddings", () => ({ default: () => null }));
vi.mock("@/pages/Corporate", () => ({ default: () => null }));
vi.mock("@/pages/Contact", () => ({ default: () => null }));
vi.mock("@/pages/Faqs", () => ({ default: () => null }));
vi.mock("@/pages/Terms", () => ({ default: () => null }));
vi.mock("@/pages/Privacy", () => ({ default: () => null }));
vi.mock("@/pages/SharedFavorites", () => ({ default: () => null }));
vi.mock("@/pages/not-found", () => ({ default: () => null }));
vi.mock("@/pages/ResetPassword", () => ({ default: () => null }));

// ─────────────────────────────────────────────────────────────────────────────
// Import the REAL App — attribution.ts is not mocked, so captureAttribution
// runs with its actual localStorage.setItem logic.
// ─────────────────────────────────────────────────────────────────────────────

import App from "@/App";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

const ATTRIBUTION_KEY = "@presentail/attribution_v1";
const AD_CHECKOUT_URL =
  "https://presentail.com/en-lb/beirut/checkout?gclid=test123";

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("App — attribution captured when landing directly on /checkout via ad link", () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    // Simulate the browser URL an ad network would deliver: /checkout + gclid.
    Object.defineProperty(window, "location", {
      value: new URL(AD_CHECKOUT_URL),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    setItemSpy.mockRestore();
    localStorage.clear();
  });

  it("AttributionTracker writes the gclid to localStorage when App mounts", async () => {
    await act(async () => {
      render(React.createElement(App));
    });

    // localStorage.setItem must have been called with the attribution key and
    // the gclid value.  This proves AttributionTracker ran during the initial
    // React commit — before any lazy chunk could have resolved.
    expect(setItemSpy).toHaveBeenCalledWith(
      ATTRIBUTION_KEY,
      expect.stringContaining("test123"),
    );
  });

  it("readAttribution returns the stored gclid immediately after App mounts", async () => {
    // This is the value createOrder would read when it eventually fires.
    // The test verifies it is available before any user interaction is possible.
    const { readAttribution } = await import("@/lib/attribution");

    await act(async () => {
      render(React.createElement(App));
    });

    const attr = readAttribution();
    expect(attr).not.toBeNull();
    expect(attr!.first_touch.gclid).toBe("test123");
    expect(attr!.last_touch.gclid).toBe("test123");
  });

  it("localStorage is populated even while the lazy Checkout chunk is still pending", async () => {
    // Structural proof of the rendering-order guarantee:
    //
    // `AttributionTracker` is a non-lazy sibling of `RootRouter` in App.tsx —
    // it is NOT inside any <Suspense> boundary. React commits it in the same
    // pass as the App root, and its useEffect fires before the lazy Checkout
    // chunk can resolve and mount.
    //
    // We prove this by making `loadCheckout` return a promise that never
    // resolves (simulating the true "chunk pending / still downloading" state).
    // Even with Checkout suspended forever, attribution must still be written.
    const { loadCheckout } = await import("@/lib/pageLoaders");
    vi.mocked(loadCheckout).mockReturnValue(
      // A promise that never resolves keeps Checkout permanently suspended.
      new Promise<{ default: React.ComponentType }>(() => {}),
    );

    await act(async () => {
      render(React.createElement(App));
    });

    // Attribution must be written even though Checkout never resolved.
    // This proves AttributionTracker does not depend on the lazy Checkout chunk.
    expect(setItemSpy).toHaveBeenCalledWith(
      ATTRIBUTION_KEY,
      expect.stringContaining("test123"),
    );

    const raw = localStorage.getItem(ATTRIBUTION_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { first_touch: { gclid?: string } };
    expect(parsed.first_touch.gclid).toBe("test123");
  });
});
