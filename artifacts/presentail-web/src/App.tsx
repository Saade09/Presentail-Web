import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
  useLocation,
} from "wouter";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ClerkProvider,
  useAuth as useClerkAuth,
  useUser,
} from "@clerk/react";
import { isUserType } from "@workspace/clerk-types";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
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

import Landing from "@/pages/Landing";
import Home from "@/pages/Home";
import Shop from "@/pages/Shop";
import ProductDetail from "@/pages/ProductDetail";
import Brands from "@/pages/Brands";
import BrandDetail from "@/pages/BrandDetail";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import OrderConfirmed from "@/pages/OrderConfirmed";
import Account from "@/pages/Account";
import PersonalInformation from "@/pages/PersonalInformation";
import SignInPage from "@/pages/SignIn";
import SignUpPage from "@/pages/SignUp";
import Unauthorized from "@/pages/Unauthorized";
import Careers from "@/pages/Careers";
import Blog from "@/pages/Blog";
import Partner from "@/pages/Partner";
import DeliveryRates from "@/pages/DeliveryRates";
import InvestorRelations from "@/pages/InvestorRelations";
import Weddings from "@/pages/Weddings";
import Corporate from "@/pages/Corporate";
import Contact from "@/pages/Contact";
import Faqs from "@/pages/Faqs";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Favorites from "@/pages/Favorites";
import NotFound from "@/pages/not-found";

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
  throw new Error(
    "VITE_CLERK_PUBLISHABLE_KEY is required. Add it to the project's environment variables.",
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
  const { isLoaded: authLoaded, isSignedIn } = useClerkAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const [currentPath] = useLocation();
  if (!authLoaded || (isSignedIn && !userLoaded)) {
    return <div className="min-h-[60vh]" data-testid="account-loading" />;
  }
  if (!isSignedIn) {
    const target = `/sign-in?redirect_url=${encodeURIComponent(currentPath)}`;
    return <Redirect to={target} replace />;
  }
  const userType = user?.publicMetadata?.userType;
  if (isUserType(userType) && userType !== "customer") {
    return <Redirect to="/unauthorized" replace />;
  }
  return <>{children}</>;
}

function ShopShell() {
  return (
    <LocationPickerGate>
      <div className="min-h-screen flex flex-col">
        <HomepageHeader />
        <main className="flex-1">
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/shop" component={Shop} />
            <Route path="/product/:slug" component={ProductDetail} />
            <Route path="/brands" component={Brands} />
            <Route path="/brand/:slug" component={BrandDetail} />
            <Route path="/cart" component={Cart} />
            <Route path="/checkout" component={Checkout} />
            <Route path="/order-confirmed" component={OrderConfirmed} />
            <Route path="/careers" component={Careers} />
            <Route path="/blog" component={Blog} />
            <Route path="/partner" component={Partner} />
            <Route path="/delivery-rates" component={DeliveryRates} />
            <Route path="/investor" component={InvestorRelations} />
            <Route path="/weddings" component={Weddings} />
            <Route path="/corporate" component={Corporate} />
            <Route path="/contact" component={Contact} />
            <Route path="/faqs" component={Faqs} />
            <Route path="/terms" component={Terms} />
            <Route path="/privacy" component={Privacy} />
            {/* Clerk's hosted forms own a sub-tree of URLs (verify-email,
                factor-one, ...) so their routes need wildcard suffixes. */}
            <Route path="/sign-in/:rest*" component={SignInPage} />
            <Route path="/sign-in" component={SignInPage} />
            <Route path="/sign-up/:rest*" component={SignUpPage} />
            <Route path="/sign-up" component={SignUpPage} />
            <Route path="/unauthorized" component={Unauthorized} />
            <Route path="/account/personal-information">
              <CustomerOnly>
                <PersonalInformation />
              </CustomerOnly>
            </Route>
            <Route path="/account">
              <CustomerOnly>
                <Account />
              </CustomerOnly>
            </Route>
            <Route path="/favorites">
              <CustomerOnly>
                <Favorites />
              </CustomerOnly>
            </Route>
            <Route component={NotFound} />
          </Switch>
        </main>
        <Footer />
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
  return <Landing />;
}

function RootRouter() {
  const [path] = useLocation();
  const parsed = parseLocalePath(path);

  if (path === "/" || path === "") {
    return <RootRedirectFromLanding />;
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

// Plumbs wouter's `setLocation` into Clerk so its built-in navigations
// (after sign-in / verification / OAuth callbacks) use SPA pushState
// transitions instead of full page reloads.
function ClerkRouterBridge({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY!}
      proxyUrl={CLERK_PROXY_URL}
      routerPush={(to) => navigate(stripBase(to))}
      routerReplace={(to) => navigate(stripBase(to), { replace: true })}
    >
      {children}
    </ClerkProvider>
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

function App() {
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
