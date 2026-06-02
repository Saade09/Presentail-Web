import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
  useLocation,
} from "wouter";
import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { prefetchOnIdle } from "@/lib/prefetch";
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
} from "@/lib/pageLoaders";
import { ClerkProvider } from "@clerk/react";
import { Component, type ErrorInfo } from "react";
import { isUserType, canShop } from "@workspace/clerk-types";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, AuthOverrideContext, ClerkAuthBridge, useAuth } from "@/contexts/AuthContext";
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
import { HomepageHeader } from "@/components/homepage/HomepageHeader";
import { Footer } from "@/components/Footer";
import { LocationPickerGate } from "@/components/LocationPickerGate";
import { SeoHead } from "@/components/SeoHead";
import { PageLoader } from "@/components/PageLoader";
import { HomePageSkeleton } from "@/components/skeletons/HomePageSkeleton";
import { ShopPageSkeleton } from "@/components/skeletons/ShopPageSkeleton";
import { ProductDetailSkeleton } from "@/components/skeletons/ProductDetailSkeleton";
import { CheckoutSkeleton } from "@/components/skeletons/CheckoutSkeleton";
import { AccountSkeleton } from "@/components/skeletons/AccountSkeleton";

/**
 * Wraps a lazy component with its own Suspense boundary so each route
 * can show a layout-matched skeleton instead of the generic spinner.
 */
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

const Landing = lazy(() => import("@/pages/Landing"));
const Home = lazy(loadHome);
const Shop = lazy(loadShop);
const ProductDetail = lazy(loadProductDetail);
const Brands = lazy(loadBrands);
const BrandDetail = lazy(loadBrandDetail);
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
const Partner = lazy(() => import("@/pages/Partner"));
const Weddings = lazy(() => import("@/pages/Weddings"));
const Corporate = lazy(() => import("@/pages/Corporate"));
const Contact = lazy(() => import("@/pages/Contact"));
const Faqs = lazy(() => import("@/pages/Faqs"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Favorites = lazy(loadFavorites);
const SharedFavorites = lazy(() => import("@/pages/SharedFavorites"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Per-route components with layout-matched Suspense skeletons.
// Defined at module scope so React never unmounts them on re-render.
const HomeRoute = withSuspense(Home, HomePageSkeleton);
const ShopRoute = withSuspense(Shop, ShopPageSkeleton);
const ProductDetailRoute = withSuspense(ProductDetail, ProductDetailSkeleton);
const CheckoutRoute = withSuspense(Checkout, CheckoutSkeleton);
const AccountRoute = withSuspense(Account, AccountSkeleton);
const PersonalInformationRoute = withSuspense(PersonalInformation, AccountSkeleton);
const FavoritesRoute = withSuspense(Favorites, AccountSkeleton);
// Minor routes share the generic spinner — they're tiny chunks, rarely cold-loaded.
const BrandsRoute = withSuspense(Brands, PageLoader);
const BrandDetailRoute = withSuspense(BrandDetail, ShopPageSkeleton);
const CartRoute = withSuspense(Cart, PageLoader);
const OrderConfirmedRoute = withSuspense(OrderConfirmed, PageLoader);
const SignInRoute = withSuspense(SignInPage, PageLoader);
const SignUpRoute = withSuspense(SignUpPage, PageLoader);
const UnauthorizedRoute = withSuspense(Unauthorized, PageLoader);
const CareersRoute = withSuspense(Careers, PageLoader);
const BlogRoute = withSuspense(Blog, PageLoader);
const PartnerRoute = withSuspense(Partner, PageLoader);
const WeddingsRoute = withSuspense(Weddings, PageLoader);
const CorporateRoute = withSuspense(Corporate, PageLoader);
const ContactRoute = withSuspense(Contact, PageLoader);
const FaqsRoute = withSuspense(Faqs, PageLoader);
const TermsRoute = withSuspense(Terms, PageLoader);
const PrivacyRoute = withSuspense(Privacy, PageLoader);
const NotFoundRoute = withSuspense(NotFound, PageLoader);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;
if (!CLERK_PUBLISHABLE_KEY) {
  // Warn but do not throw — the app and checkout work without Clerk (guest mode).
  console.warn(
    "[auth] VITE_CLERK_PUBLISHABLE_KEY is not set. Sign-in features will be unavailable.",
  );
}

// Optional same-origin Clerk Frontend API proxy. The API server mounts
// `/api/__clerk` (production-only when CLERK_SECRET_KEY is set). When
// `VITE_CLERK_PROXY_URL` is provided we tell ClerkProvider to use that
// URL instead of Clerk's hosted FAPI, which avoids third-party-cookie
// restrictions on the storefront's custom domains. In dev (and when the
// env var isn't set) we leave it undefined so Clerk talks to its own
// hosted FAPI directly.
const CLERK_PROXY_URL = import.meta.env.VITE_CLERK_PROXY_URL as
  | string
  | undefined;

// Customer-only gate. Signed-out users are bounced to the LOCALE-PREFIXED
// `/sign-in` route via wouter's `<Redirect>` (which prepends the active
// router base, so the URL becomes e.g. `/en-lb/beirut/sign-in`). Clerk's
// own `<RedirectToSignIn>` always sends to a root-level `/sign-in`, which
// isn't a valid route in this storefront's locale-prefixed router and
// would lose the auth intent. We carry the originally-requested path in
// `redirect_url` so Clerk returns the user to it after sign-in.
//
// Signed-in users whose Clerk `publicMetadata.userType` is anything other
// than "customer" land on `/unauthorized` — we never silently downgrade
// a driver/team user to customer privileges on the storefront.
function CustomerOnly({ children }: { children: React.ReactNode }) {
  const { user, userType } = useAuth();
  const [currentPath] = useLocation();
  // user is null while Clerk is loading OR when signed out. We never show
  // a spinner here — isLoading is always false by design (see AuthContext).
  // On first render with no user, redirect to sign-in; if Clerk later
  // resolves a signed-in session, user becomes non-null and children render.
  if (!user) {
    const target = `/sign-in?redirect_url=${encodeURIComponent(currentPath)}`;
    return <Redirect to={target} replace />;
  }
  // Allow customers and team members to shop; drivers and unrecognised roles
  // are redirected — we never silently downgrade them to customer privileges.
  if (isUserType(userType) && !canShop(userType)) {
    return <Redirect to="/unauthorized" replace />;
  }
  return <>{children}</>;
}

function ShopShell() {
  const [path] = useLocation();
  const isCheckoutPage = path.endsWith("/checkout") || path.endsWith("/order-confirmed");
  return (
    <LocationPickerGate>
      <div className="min-h-screen flex flex-col">
        {!isCheckoutPage && <HomepageHeader />}
        <main className="flex-1">
          <Switch>
            <Route path="/" component={HomeRoute} />
            <Route path="/shop" component={ShopRoute} />
            <Route path="/product/:slug" component={ProductDetailRoute} />
            <Route path="/brands" component={BrandsRoute} />
            <Route path="/brand/:slug" component={BrandDetailRoute} />
            <Route path="/cart" component={CartRoute} />
            <Route path="/checkout" component={CheckoutRoute} />
            <Route path="/order-confirmed" component={OrderConfirmedRoute} />
            <Route path="/careers" component={CareersRoute} />
            <Route path="/blog" component={BlogRoute} />
            <Route path="/partner" component={PartnerRoute} />
            <Route path="/weddings" component={WeddingsRoute} />
            <Route path="/corporate" component={CorporateRoute} />
            <Route path="/contact" component={ContactRoute} />
            <Route path="/faqs" component={FaqsRoute} />
            <Route path="/terms" component={TermsRoute} />
            <Route path="/privacy" component={PrivacyRoute} />
            {/* Clerk's hosted forms own a sub-tree of URLs (verify-email,
                factor-one, ...) so their routes need wildcard suffixes. */}
            <Route path="/sign-in/:rest*" component={SignInRoute} />
            <Route path="/sign-in" component={SignInRoute} />
            <Route path="/sign-up/:rest*" component={SignUpRoute} />
            <Route path="/sign-up" component={SignUpRoute} />
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
        </main>
        {!isCheckoutPage && <Footer />}
      </div>
    </LocationPickerGate>
  );
}

/** Resolve a city slug for a country: prefer saved city, else first city. */
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

/** Path doesn't have a locale prefix and isn't `/`. Try to redirect to the
 *  current/saved locale, falling back to landing. */
function UnprefixedRedirect() {
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
      return (
        <Redirect
          to={buildLocalePath({ lang: language, country: slug, city: citySlug })}
          replace
        />
      );
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

  // Public shared-favorites page — accessible without locale prefix or sign-in.
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

/** Keeps `<title>` and document language attributes in sync. */
function DocumentMeta() {
  const { language, dir } = useLocale();
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [language, dir]);
  return null;
}

// Clerk passes absolute paths (incl. the wouter router base) to
// routerPush/routerReplace, but wouter's `setLocation` re-prepends the
// active router base — strip the outer base to avoid the doubled prefix
// that would otherwise produce URLs like `/en-lb/beirut/en-lb/beirut/...`
// after sign-in / verification / OAuth callbacks.
const OUTER_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function stripBase(path: string): string {
  if (OUTER_BASE && path.startsWith(OUTER_BASE)) {
    return path.slice(OUTER_BASE.length) || "/";
  }
  return path;
}

// Wraps ClerkProvider so that a Clerk initialisation failure (e.g. production
// key used on a non-production domain) is caught at the React error-boundary
// level instead of crashing the whole app.
//
// IMPORTANT: ClerkProvider + ClerkAuthBridge are rendered INSIDE this class's
// render() method — not passed as children — so that when `failed === true`
// we can return the app children WITHOUT any Clerk wrapper. If ClerkProvider
// were passed as children, the error boundary would re-render the same
// crashing tree on every recovery attempt.
//
// When failed: children render with the AuthOverrideContext default
// (GUEST_AUTH_VALUE), meaning useAuth() returns guest state immediately
// with no Clerk hooks anywhere in the tree.
class ClerkErrorBoundary extends Component<
  {
    children: React.ReactNode;
    publishableKey: string;
    proxyUrl?: string;
    navigate: (to: string, opts?: { replace?: boolean }) => void;
  },
  { failed: boolean }
> {
  state = { failed: false };
  componentDidCatch(err: Error, _info: ErrorInfo) {
    console.warn("[auth] ClerkProvider failed — running in guest mode:", err.message);
    this.setState({ failed: true });
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    const { children, publishableKey, proxyUrl, navigate } = this.props;
    if (this.state.failed) {
      // Clerk failed: render children directly with no Clerk wrapper.
      // AuthOverrideContext defaults to GUEST_AUTH_VALUE so every
      // useAuth() call returns guest state. No Clerk hooks are in the tree.
      return children;
    }
    return (
      <ClerkProvider
        publishableKey={publishableKey}
        proxyUrl={proxyUrl}
        routerPush={(to) => navigate(stripBase(to))}
        routerReplace={(to) => navigate(stripBase(to), { replace: true })}
      >
        <ClerkAuthBridge>
          {children}
        </ClerkAuthBridge>
      </ClerkProvider>
    );
  }
}

// Plumbs wouter's `setLocation` into Clerk so its built-in navigations
// (after sign-in / verification / OAuth callbacks) use SPA pushState
// transitions instead of full page reloads.
// When the publishable key is absent or Clerk fails, children render in guest
// mode — AuthOverrideContext defaults to GUEST_AUTH_VALUE in AuthContext.tsx.
function ClerkRouterBridge({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  if (!CLERK_PUBLISHABLE_KEY) {
    // No key — skip ClerkProvider entirely; children see the default guest context.
    return <>{children}</>;
  }
  return (
    <ClerkErrorBoundary
      publishableKey={CLERK_PUBLISHABLE_KEY}
      proxyUrl={CLERK_PROXY_URL}
      navigate={navigate}
    >
      {children}
    </ClerkErrorBoundary>
  );
}

function CurrencyDataLoader() {
  const { data } = useCurrenciesData();
  useEffect(() => {
    if (!data) return;
    setCurrencySnapshot(data);
  }, [data]);
  return null;
}

// Routes prefetched on browser idle after the app first mounts, ordered by
// expected traffic volume so the highest-value chunks load first.
const IDLE_PREFETCH = [
  loadHome,
  loadShop,
  loadProductDetail,
  loadCart,
  loadSignIn,
  loadCheckout,
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ClerkRouterBridge>
            <LocaleProvider>
              <LocationProvider>
                <AuthProvider>
                  <CartProvider>
                    <FavoritesProvider>
                    <DeliverySelectionProvider>
                      <CurrencyDataLoader />
                      <DocumentMeta />
                      <SeoHead />
                      <RootRouter />
                      <Toaster />
                    </DeliverySelectionProvider>
                    </FavoritesProvider>
                  </CartProvider>
                </AuthProvider>
              </LocationProvider>
            </LocaleProvider>
          </ClerkRouterBridge>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
