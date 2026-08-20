import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
  useLocation,
} from "wouter";
import { lazy, Suspense, useEffect, useRef, startTransition } from "react";
import { captureAttribution } from "@/lib/attribution";
import { trackWebEvent } from "@/lib/analytics";
import {
  LATE_NIGHT_CAMPAIGN_SECTION_KEY,
  markCampaignIdentity,
} from "@/lib/campaign";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { prefetchOnIdle } from "@/lib/prefetch";
import { initPixel, trackFbPageView } from "@/lib/fbPixel";
import {
  loadHome,
  loadShop,
  loadProductDetail,
  loadCart,
  loadCheckout,
  loadSignIn,
  loadSignUp,
  loadAccount,
  loadFavorites,
  loadBrands,
  loadBrandDetail,
  loadAllOccasions,
} from "@/lib/pageLoaders";
import { loadHomepageHeader, loadFooter } from "@/lib/layoutLoaders";
// NOTE: loadCheckout is kept imported here because it is used by the lazy()
// call for the Checkout route. It is intentionally NOT in IDLE_PREFETCH — see
// the comment there for the rationale.
import { isUserType, canShop } from "@workspace/clerk-types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { DeliverySelectionProvider } from "@/contexts/DeliverySelectionContext";
import { LocaleProvider, useLocale } from "@/contexts/LocaleContext";
import { useCurrenciesData } from "@/lib/queries";
import { setCurrencySnapshot } from "@/lib/currency";
import {
  LocationProvider,
  useLocationSelection,
} from "@/contexts/LocationContext";
import {
  parseLocalePath,
  buildLocalePath,
  cityIdToSlug,
  countryCodeToSlug,
  isSupportedCity,
  isSupportedCountrySlug,
  type CountrySlug,
  type Lang,
} from "@/lib/locale-route";
import { LocationPickerGate } from "@/components/LocationPickerGate";
import { SeoHead } from "@/components/SeoHead";
import { CheckoutErrorBoundary, RouteErrorBoundary } from "@/components/ErrorBoundary";
import { PageLoader } from "@/components/PageLoader";
import { HomePageSkeleton } from "@/components/skeletons/HomePageSkeleton";
import { ShopPageSkeleton } from "@/components/skeletons/ShopPageSkeleton";
import { ProductDetailSkeleton } from "@/components/skeletons/ProductDetailSkeleton";
import { CheckoutSkeleton } from "@/components/skeletons/CheckoutSkeleton";
import { AccountSkeleton } from "@/components/skeletons/AccountSkeleton";
import { HeaderSkeleton } from "@/components/skeletons/HeaderSkeleton";

function withSuspense<P extends object>(
  Component: React.ComponentType<P>,
  Fallback: React.ComponentType,
): React.ComponentType<P> {
  function WithSuspense(props: P) {
    return (
      <Suspense fallback={<Fallback />}>
        <Component {...props} />
      </Suspense>
    );
  }
  WithSuspense.displayName = `WithSuspense(${Component.displayName ?? Component.name})`;
  return WithSuspense;
}

const HomepageHeader = lazy(() =>
  loadHomepageHeader().then((m) => ({ default: m.HomepageHeader })),
);
const Footer = lazy(() =>
  loadFooter().then((m) => ({ default: m.Footer })),
);
// Landing-page-specific stripped header/footer. The stripped header is only
// mounted on /flower-delivery; late-night keeps its campaign footer but uses
// the regular storefront header.
const LandingPageHeader = lazy(() =>
  import("@/components/landing/LandingPageHeader").then((m) => ({ default: m.LandingPageHeader })),
);
const LandingPageFooter = lazy(() =>
  import("@/components/landing/LandingPageFooter").then((m) => ({ default: m.LandingPageFooter })),
);
const Toaster = lazy(() =>
  import("@/components/ui/toaster").then((m) => ({ default: m.Toaster })),
);

const Landing = lazy(() => import("@/pages/Landing"));
const Home = lazy(loadHome);
const Shop = lazy(loadShop);
const ProductDetail = lazy(loadProductDetail);
const Brands = lazy(loadBrands);
const BrandDetail = lazy(loadBrandDetail);
const AllOccasions = lazy(loadAllOccasions);
const Cart = lazy(loadCart);
const Checkout = lazy(loadCheckout);
const OrderConfirmed = lazy(() => import("@/pages/OrderConfirmed"));
const Account = lazy(loadAccount);
const PersonalInformation = lazy(() => import("@/pages/PersonalInformation"));
const SignInPage = lazy(loadSignIn);
const SignUpPage = lazy(loadSignUp);
const Unauthorized = lazy(() => import("@/pages/Unauthorized"));
const Careers = lazy(() => import("@/pages/Careers"));
const Blog = lazy(() => import("@/pages/Blog"));
const BlogPost = lazy(() => import("@/pages/BlogPost"));
const Partner = lazy(() => import("@/pages/Partner"));
const Weddings = lazy(() => import("@/pages/Weddings"));
const Corporate = lazy(() => import("@/pages/Corporate"));
const Contact = lazy(() => import("@/pages/Contact"));
const Faqs = lazy(() => import("@/pages/Faqs"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const AccountDeletion = lazy(() => import("@/pages/AccountDeletion"));
const ShippingPolicy = lazy(() => import("@/pages/ShippingPolicy"));
const ReturnPolicy = lazy(() => import("@/pages/ReturnPolicy"));
const SharedFavorites = lazy(() => import("@/pages/SharedFavorites"));
const BestSellers = lazy(() => import("@/pages/BestSellers"));
const CampaignLanding = lazy(() => import("@/pages/CampaignLanding"));
const BeirutLateNightLanding = lazy(() => import("@/pages/BeirutLateNightLanding"));
const NotFound = lazy(() => import("@/pages/not-found"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const CheckoutPaymentResume = lazy(() => import("@/pages/CheckoutPaymentResume"));

const HomeRoute = withSuspense(Home, HomePageSkeleton);
const ShopRoute = withSuspense(Shop, ShopPageSkeleton);
const ProductDetailRoute = withSuspense(ProductDetail, ProductDetailSkeleton);
const CheckoutRoute = withSuspense(Checkout, CheckoutSkeleton);
const AccountRoute = withSuspense(Account, AccountSkeleton);
const PersonalInformationRoute = withSuspense(PersonalInformation, AccountSkeleton);
const BrandsRoute = withSuspense(Brands, PageLoader);
const BrandDetailRoute = withSuspense(BrandDetail, ShopPageSkeleton);
const AllOccasionsRoute = withSuspense(AllOccasions, ShopPageSkeleton);
const CartRoute = withSuspense(Cart, PageLoader);
const OrderConfirmedRoute = withSuspense(OrderConfirmed, PageLoader);
const SignInRoute = withSuspense(SignInPage, PageLoader);
const SignUpRoute = withSuspense(SignUpPage, PageLoader);
const ResetPasswordRoute = withSuspense(ResetPassword, PageLoader);
const UnauthorizedRoute = withSuspense(Unauthorized, PageLoader);
const CareersRoute = withSuspense(Careers, PageLoader);
const BlogRoute = withSuspense(Blog, PageLoader);
const BlogPostRoute = withSuspense(BlogPost, PageLoader);
const PartnerRoute = withSuspense(Partner, PageLoader);
const WeddingsRoute = withSuspense(Weddings, PageLoader);
const CorporateRoute = withSuspense(Corporate, PageLoader);
const ContactRoute = withSuspense(Contact, PageLoader);
const FaqsRoute = withSuspense(Faqs, PageLoader);
const TermsRoute = withSuspense(Terms, PageLoader);
const PrivacyRoute = withSuspense(Privacy, PageLoader);
const AccountDeletionRoute = withSuspense(AccountDeletion, PageLoader);
const ShippingPolicyRoute = withSuspense(ShippingPolicy, PageLoader);
const ReturnPolicyRoute = withSuspense(ReturnPolicy, PageLoader);
const BestSellersRoute = withSuspense(BestSellers, ShopPageSkeleton);
const CampaignLandingRoute = withSuspense(CampaignLanding, ShopPageSkeleton);
const BeirutLateNightLandingRoute = withSuspense(BeirutLateNightLanding, ShopPageSkeleton);
const NotFoundRoute = withSuspense(NotFound, PageLoader);

const OS_PRODUCTS_CACHE_KEY = "presentail-os-products-cache-v1";
const OS_PRODUCTS_MAX_AGE = 5 * 60 * 1000; // 5 minutes — matches os-products staleTime

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

/**
 * Deferred query-persistence bootstrap.
 *
 * Renders nothing. On first mount it dynamically imports the three persistence
 * packages (@tanstack/react-query-persist-client, @tanstack/query-async-storage-persister,
 * idb-keyval) — which are NOT part of the initial JS bundle — then calls
 * persistQueryClient() directly on the shared queryClient instance. This:
 *   1. Restores any previously-cached query data from IndexedDB into the live
 *      queryClient, so stale-while-revalidate works across hard reloads.
 *   2. Subscribes to future queryClient mutations so new data is persisted.
 *
 * Using plain QueryClientProvider + this component instead of
 * PersistQueryClientProvider lets the app render immediately without waiting
 * on the persist packages. Cache is restored ~a render or two after first
 * paint rather than before it — imperceptible in practice.
 */
function QueryPersistenceUpgrade() {
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    Promise.all([
      import("@tanstack/react-query-persist-client"),
      import("@tanstack/query-async-storage-persister"),
      import("idb-keyval"),
    ]).then(
      ([
        { persistQueryClient },
        { createAsyncStoragePersister },
        { get, set, del },
      ]) => {
        const storage = {
          getItem: (key: string) => get<string>(key).then((v) => v ?? null),
          setItem: (key: string, value: string) => set(key, value),
          removeItem: (key: string) => del(key),
        };
        const persister = createAsyncStoragePersister({
          storage,
          key: OS_PRODUCTS_CACHE_KEY,
          throttleTime: 1000,
        });
        const [unsub] = persistQueryClient({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          queryClient: queryClient as any, // pnpm resolves two minor versions of @tanstack/query-core; cast is safe at runtime
          persister,
          maxAge: OS_PRODUCTS_MAX_AGE,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) => {
              if (
                !Array.isArray(query.queryKey) ||
                query.state.status !== "success"
              )
                return false;
              const key = query.queryKey[0];
              return key === "os-products" || key === "product-color-hints-v3";
            },
          },
        });
        unsubscribe = unsub;
      },
    );

    return () => unsubscribe?.();
  }, []);

  return null;
}

function CustomerOnly({ children }: { children: React.ReactNode }) {
  const { user, userType, isLoading } = useAuth();
  const [currentPath] = useLocation();
  if (isLoading) return null;
  if (!user) {
    const target = `/sign-in?redirect_url=${encodeURIComponent(currentPath)}`;
    return <Redirect to={target} replace />;
  }
  if (isUserType(userType) && !canShop(userType)) {
    return <Redirect to="/unauthorized" replace />;
  }
  return <>{children}</>;
}

function ScrollToTop() {
  const isPop = useRef(false);

  useEffect(() => {
    history.scrollRestoration = "manual";

    const onScroll = () => {
      // Store scroll position in sessionStorage rather than via
      // history.replaceState(). replaceState() is intercepted by both
      // wouter and gtag, each of which calls it again — multiplying the
      // call count by 3+ per scroll event and trivially hitting the
      // browser's hard cap of 100 replaceState calls per 10 seconds,
      // which crashes the page with an unhandled error. sessionStorage
      // writes have no listeners and break the feedback loop entirely.
      try {
        sessionStorage.setItem(
          "__scrollY_" + window.location.pathname,
          String(window.scrollY),
        );
      } catch (_) {
        // sessionStorage unavailable (e.g. private mode with storage blocked)
      }
    };

    const onPopState = () => {
      isPop.current = true;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const [pathname] = useLocation();
  useEffect(() => {
    if (isPop.current) {
      isPop.current = false;
      let saved = 0;
      try {
        saved =
          parseFloat(
            sessionStorage.getItem("__scrollY_" + pathname) ?? "0",
          ) || 0;
      } catch (_) {
        // sessionStorage unavailable
      }
      requestAnimationFrame(() => {
        window.scrollTo({ top: saved, behavior: "instant" });
      });
      return;
    }
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  }, [pathname]);

  return null;
}

export function getShopShellChrome(path: string) {
  const isFlowerDeliveryCampaign = path.endsWith("/flower-delivery");
  const isLateNightCampaign = path.endsWith("/late-night-flower-delivery");

  return {
    // The late-night page keeps its dedicated content/footer, but uses the
    // regular storefront header so shoppers can browse the catalog.
    useLandingHeader: isFlowerDeliveryCampaign,
    useLandingFooter: isFlowerDeliveryCampaign || isLateNightCampaign,
  };
}

function ShopShell() {
  const [path] = useLocation();
  const isCheckoutPage =
    path.endsWith("/checkout") ||
    path.endsWith("/order-confirmed") ||
    path.endsWith("/checkout/payment-resume") ||
    path.includes("/checkout/payment-resume?");
  const { useLandingHeader, useLandingFooter } = getShopShellChrome(path);
  return (
    <LocationPickerGate>
      <ScrollToTop />
      <div className="min-h-screen flex flex-col">
        {!isCheckoutPage && (
          <Suspense fallback={<HeaderSkeleton />}>
            {useLandingHeader ? <LandingPageHeader /> : <HomepageHeader />}
          </Suspense>
        )}
        <main className="flex-1">
          <RouteErrorBoundary>
          <Switch>
            <Route path="/" component={HomeRoute} />
            <Route path="/shop" component={ShopRoute} />
            <Route path="/best-sellers" component={BestSellersRoute} />
            <Route path="/flower-delivery" component={CampaignLandingRoute} />
            <Route
              path="/late-night-flower-delivery"
              component={BeirutLateNightLandingRoute}
            />
            <Route path="/occasion/:slug" component={ShopRoute} />
            <Route path="/category/:slug" component={ShopRoute} />
            <Route path="/product/:slug" component={ProductDetailRoute} />
            <Route path="/brands" component={BrandsRoute} />
            <Route path="/brand/:slug" component={BrandDetailRoute} />
            <Route path="/occasions" component={AllOccasionsRoute} />
            <Route path="/cart" component={CartRoute} />
            <Route path="/checkout/payment-resume">
              <CheckoutErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <CheckoutPaymentResume />
                </Suspense>
              </CheckoutErrorBoundary>
            </Route>
            <Route path="/checkout">
              <CheckoutErrorBoundary>
                <CheckoutRoute />
              </CheckoutErrorBoundary>
            </Route>
            <Route path="/order-confirmed" component={OrderConfirmedRoute} />
            <Route path="/careers" component={CareersRoute} />
            <Route path="/blog/:slug" component={BlogPostRoute} />
            <Route path="/blog" component={BlogRoute} />
            <Route path="/partner" component={PartnerRoute} />
            <Route path="/weddings" component={WeddingsRoute} />
            <Route path="/corporate" component={CorporateRoute} />
            <Route path="/contact" component={ContactRoute} />
            <Route path="/faqs" component={FaqsRoute} />
            <Route path="/terms" component={TermsRoute} />
            <Route path="/privacy" component={PrivacyRoute} />
            <Route path="/account-deletion" component={AccountDeletionRoute} />
            <Route path="/shipping-policy" component={ShippingPolicyRoute} />
            <Route path="/return-policy" component={ReturnPolicyRoute} />
            <Route path="/sign-in/:rest*" component={SignInRoute} />
            <Route path="/sign-in" component={SignInRoute} />
            <Route path="/sign-up/:rest*" component={SignUpRoute} />
            <Route path="/sign-up" component={SignUpRoute} />
            <Route path="/reset-password" component={ResetPasswordRoute} />
            <Route path="/unauthorized" component={UnauthorizedRoute} />
            <Route path="/account/personal-information">
              <CustomerOnly>
                <PersonalInformationRoute />
              </CustomerOnly>
            </Route>
            <Route path="/account">
              <CustomerOnly>
                <AccountRoute />
              </CustomerOnly>
            </Route>
            <Route path="/favorites">
              <Redirect to="/account?tab=favorites" replace />
            </Route>
            <Route component={NotFoundRoute} />
          </Switch>
          </RouteErrorBoundary>
        </main>
        {!isCheckoutPage && (
          <Suspense fallback={null}>
            {useLandingFooter ? <LandingPageFooter /> : <Footer />}
          </Suspense>
        )}
      </div>
    </LocationPickerGate>
  );
}

// Standalone blog shell for canonical /{lang}/blog/* routes.
// Blog content does not vary by city — LocationPickerGate and the city-scoped
// WouterRouter are intentionally omitted. Readers get the full layout
// (header + footer) without the delivery location requirement.
function BlogShell() {
  return (
    <>
      <ScrollToTop />
      <div className="min-h-screen flex flex-col">
        <Suspense fallback={<HeaderSkeleton />}>
          <HomepageHeader />
        </Suspense>
        <main className="flex-1">
          <RouteErrorBoundary>
            <Switch>
              <Route path="/blog/:slug" component={BlogPostRoute} />
              <Route path="/blog" component={BlogRoute} />
              <Route component={NotFoundRoute} />
            </Switch>
          </RouteErrorBoundary>
        </main>
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      </div>
    </>
  );
}

function CityFallbackRedirect({
  lang,
  country,
}: {
  lang: Lang;
  country: CountrySlug;
}) {
  const { countries, isLoadingCountries, cityId } = useLocationSelection();
  if (isLoadingCountries && countries.length === 0) {
    return <div className="min-h-[60vh]" data-testid="locale-loading" />;
  }
  const found = countries.find((c) => c.code.toLowerCase() === country);
  let citySlug: string | null = null;
  if (
    cityId &&
    cityId.startsWith(`${country}-`) &&
    found?.cities.some((c) => c.id === cityId)
  ) {
    citySlug = cityIdToSlug(cityId);
  } else if (found && found.cities[0]) {
    citySlug = cityIdToSlug(found.cities[0].id);
  }
  if (!citySlug) {
    return <Redirect to="/" replace />;
  }
  const target = buildLocalePath({ lang, country, city: citySlug });
  return <Redirect to={target} replace />;
}

function UnprefixedRedirect() {
  const [path] = useLocation();
  const { countryCode, cityId, countries, isLoadingCountries } =
    useLocationSelection();
  const { language } = useLocale();
  if (isLoadingCountries && countries.length === 0) {
    return <div className="min-h-[60vh]" data-testid="locale-loading" />;
  }
  if (countryCode && cityId) {
    const slug = countryCodeToSlug(countryCode);
    if (isSupportedCountrySlug(slug)) {
      const citySlug = cityIdToSlug(cityId);
      const base = buildLocalePath({ lang: language, country: slug, city: citySlug });
      // Preserve the original path (e.g. /checkout, /sign-up) and query string
      // so bookmarks and direct links reach the intended page after the locale
      // prefix is prepended.
      const suffix = path && path !== "/" ? path : "";
      const search =
        typeof window !== "undefined" ? window.location.search : "";
      return <Redirect to={`${base}${suffix}${search}`} replace />;
    }
  }
  return <Redirect to="/" replace />;
}

function RootRedirectFromLanding() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Landing />
    </Suspense>
  );
}

function RootRouter() {
  const [path] = useLocation();
  const parsed = parseLocalePath(path);

  if (path === "/" || path === "") {
    return <RootRedirectFromLanding />;
  }

  if (path.startsWith("/favorites/share/")) {
    const token = path.split("/")[3] ?? "";
    return (
      <Suspense fallback={<PageLoader />}>
        <SharedFavorites token={token} />
      </Suspense>
    );
  }

  if (parsed.hasLocalePrefix && parsed.lang && parsed.country) {
    if (!parsed.city || !isSupportedCity(parsed.country, parsed.city)) {
      return (
        <CityFallbackRedirect lang={parsed.lang} country={parsed.country} />
      );
    }
    const base = `/${parsed.lang}-${parsed.country}/${parsed.city}`;
    return (
      <WouterRouter base={base} key={base}>
        <ShopShell />
      </WouterRouter>
    );
  }

  // Canonical lang-only blog routes: /en/blog, /en/blog/:slug, etc.
  // All city-prefixed blog URLs 301-redirect here (serve.mjs § 7c).
  // Mount BlogShell with base /{lang} — no city/country context needed for blog.
  // Greek blog content doesn't exist; /el/blog renders EN-fallback articles.
  const BLOG_LANG_SET = new Set<string>(["en", "ar", "fr", "el"]);
  const blogLangMatch = path.match(/^\/([a-z]{2})\/(blog(?:\/[^?#]*)?)(\?.*)?$/);
  if (blogLangMatch && BLOG_LANG_SET.has(blogLangMatch[1])) {
    const lang = blogLangMatch[1];
    return (
      <WouterRouter base={`/${lang}`} key={`blog-${lang}`}>
        <BlogShell />
      </WouterRouter>
    );
  }

  return <UnprefixedRedirect />;
}

function DocumentMeta() {
  const { language, dir } = useLocale();
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [language, dir]);
  return null;
}

function FbPixelTracker() {
  const [path] = useLocation();
  const { countryCode } = useLocationSelection();

  const countrySlug = countryCode
    ? (countryCode.toLowerCase() as import("@/lib/locale-route").CountrySlug)
    : null;

  useEffect(() => {
    initPixel(countrySlug);
  }, [countrySlug]);

  useEffect(() => {
    trackFbPageView();
  }, [path]);

  return null;
}

function CurrencyDataLoader() {
  const { data } = useCurrenciesData();
  useEffect(() => {
    if (!data) return;
    startTransition(() => {
      setCurrencySnapshot(data);
    });
  }, [data]);
  return null;
}

// Tracking and WooCommerce-currency params that are cleaned from the browser
// URL bar after attribution data has been captured. Must stay in sync with the
// server-side TRACKING_PARAMS / FILTER_PARAMS_CANONICAL sets in seo-inject.mjs
// and serve-tracking.mjs.
const URL_CLEANUP_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "gclid", "gbraid", "wbraid", "fbclid", "msclkid",
  "gad_source", "gad_campaignid",
  "ttclid", "twclid", "li_fat_id",
  "mc_cid", "mc_eid",
  "srsltid",
  "hsa_cam", "hsa_grp", "hsa_ad", "hsa_mt", "hsa_net",
  "hsa_src", "hsa_tgt", "hsa_ver", "hsa_kw",
  "campaignid", "adgroupid", "adid",
  "wmc-currency",
]);

function AttributionTracker() {
  const [path] = useLocation();
  useEffect(() => {
    // 1. Capture attribution synchronously so it is readable before any async
    //    work (e.g. createOrder) runs.
    captureAttribution(window.location.href, document.referrer);

    // 2. After attribution has been captured, silently clean tracking and
    //    WooCommerce-currency params from the visible browser URL so the
    //    address bar matches the clean canonical. No page reload is triggered.
    if (typeof window === "undefined") return;
    const search = window.location.search;
    if (!search) return;
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    let changed = false;
    for (const key of [...params.keys()]) {
      if (URL_CLEANUP_PARAMS.has(key) || key.startsWith("hsa_") || key.startsWith("utm_")) {
        params.delete(key);
        changed = true;
      }
    }
    if (!changed) return;
    const newSearch = params.toString() ? `?${params.toString()}` : "";
    const cleanUrl =
      window.location.pathname + newSearch + window.location.hash;
    window.history.replaceState(window.history.state, "", cleanUrl);
  }, [path]);
  return null;
}

function PageViewTracker() {
  const [path] = useLocation();
  useEffect(() => {
    if (path === "/late-night-flower-delivery") {
      markCampaignIdentity(LATE_NIGHT_CAMPAIGN_SECTION_KEY);
    }
    trackWebEvent({ type: "page_view" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return null;
}

// The following chunks are intentionally excluded from idle prefetch — they
// must not appear in the home-page critical waterfall on throttled connections.
// Each is instead prefetched on the user-interaction that signals intent:
//
//   • loadCheckout        — cart icon hover (MainNavbar, prefetchProps)
//   • loadSignIn          — sign-in/account icon hover (MainNavbar, prefetchProps)
//   • loadSignUp          — sign-in link hover (sign-up is the next likely step)
//   • loadAccount         — account icon hover (MainNavbar, prefetchProps)
//   • loadFavorites       — account icon hover (Favorites lives under Account)
//   • loadBrands          — Brands nav link hover (MainNavbar, prefetchProps)
//   • loadBrandDetail     — Brands nav link hover (first brand page is likely next)
const IDLE_PREFETCH = [
  loadHomepageHeader,
  loadFooter,
  loadHome,
  loadShop,
  loadCart,
];

function App() {
  useEffect(() => {
    return prefetchOnIdle(IDLE_PREFETCH);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <QueryPersistenceUpgrade />
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <LocaleProvider>
            <LocationProvider>
              <AuthProvider>
                <CartProvider>
                  <FavoritesProvider>
                    <DeliverySelectionProvider>
                      <CurrencyDataLoader />
                      <DocumentMeta />
                      <AttributionTracker />
                      <PageViewTracker />
                      <FbPixelTracker />
                      <SeoHead />
                      <RootRouter />
                      <Suspense fallback={null}>
                        <Toaster />
                      </Suspense>
                    </DeliverySelectionProvider>
                  </FavoritesProvider>
                </CartProvider>
              </AuthProvider>
            </LocationProvider>
          </LocaleProvider>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
