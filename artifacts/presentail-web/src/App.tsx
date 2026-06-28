import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
  useLocation,
} from "wouter";
import { lazy, Suspense, useEffect, useRef } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
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
  loadHomepageHeader,
  loadFooter,
} from "@/lib/pageLoaders";
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
import { CurrencySwitcher } from "@/components/CurrencySwitcher";
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
const SharedFavorites = lazy(() => import("@/pages/SharedFavorites"));
const NotFound = lazy(() => import("@/pages/not-found"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));

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

const persister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: OS_PRODUCTS_CACHE_KEY,
  throttleTime: 1000,
});

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
      const state = history.state ?? {};
      history.replaceState({ ...state, __scrollY: window.scrollY }, "");
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
      const saved = (history.state?.__scrollY as number | undefined) ?? 0;
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

function ShopShell() {
  const [path] = useLocation();
  const isCheckoutPage = path.endsWith("/checkout") || path.endsWith("/order-confirmed");
  return (
    <LocationPickerGate>
      <ScrollToTop />
      <div className="min-h-screen flex flex-col">
        {!isCheckoutPage && (
          <Suspense fallback={<HeaderSkeleton />}>
            <HomepageHeader />
          </Suspense>
        )}
        {isCheckoutPage && (
          <header className="border-b px-4 py-2 flex items-center justify-end bg-white">
            <CurrencySwitcher />
          </header>
        )}
        <main className="flex-1">
          <RouteErrorBoundary>
          <Switch>
            <Route path="/" component={HomeRoute} />
            <Route path="/shop" component={ShopRoute} />
            <Route path="/occasion/:slug" component={ShopRoute} />
            <Route path="/category/:slug" component={ShopRoute} />
            <Route path="/product/:slug" component={ProductDetailRoute} />
            <Route path="/brands" component={BrandsRoute} />
            <Route path="/brand/:slug" component={BrandDetailRoute} />
            <Route path="/occasions" component={AllOccasionsRoute} />
            <Route path="/cart" component={CartRoute} />
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
            <Footer />
          </Suspense>
        )}
      </div>
    </LocationPickerGate>
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
    setCurrencySnapshot(data);
  }, [data]);
  return null;
}

// Checkout is intentionally excluded from idle prefetch — it must not appear
// in the home-page critical waterfall. It is prefetched on hover of the cart
// icon (see MainNavbar) so it only loads when the user signals intent to check
// out, not unconditionally on every page load.
const IDLE_PREFETCH = [
  loadHomepageHeader,
  loadFooter,
  loadHome,
  loadShop,
  loadProductDetail,
  loadCart,
  loadSignIn,
  loadAccount,
  loadFavorites,
  loadBrands,
  loadBrandDetail,
  loadSignUp,
];

function App() {
  useEffect(() => {
    prefetchOnIdle(IDLE_PREFETCH);
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: OS_PRODUCTS_MAX_AGE,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            if (!Array.isArray(query.queryKey) || query.state.status !== "success") return false;
            const key = query.queryKey[0];
            return key === "os-products" || key === "product-color-hints-v3";
          },
        },
      }}
    >
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
    </PersistQueryClientProvider>
  );
}

export default App;
