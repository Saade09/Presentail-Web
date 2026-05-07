import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
  useLocation,
} from "wouter";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { LocaleProvider, useLocale } from "@/contexts/LocaleContext";
import {
  LocationProvider,
  useLocationSelection,
} from "@/contexts/LocationContext";
import {
  parseLocalePath,
  buildLocalePath,
  cityIdToSlug,
  countryCodeToSlug,
  isSupportedCountrySlug,
  type CountrySlug,
  type Lang,
} from "@/lib/locale-route";

import { HomepageHeader } from "@/components/homepage/HomepageHeader";
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
import Auth from "@/pages/Auth";
import Account from "@/pages/Account";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

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
            <Route path="/auth" component={Auth} />
            <Route path="/account" component={Account} />
            <Route component={NotFound} />
          </Switch>
        </main>
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
  const { countryCode, cityId, countries, isLoadingCountries } =
    useLocationSelection();
  const { language } = useLocale();
  if (!countryCode || !cityId) return <Landing />;
  if (isLoadingCountries && countries.length === 0) {
    return <div className="min-h-[60vh]" data-testid="root-loading" />;
  }
  const slug = countryCodeToSlug(countryCode);
  if (!isSupportedCountrySlug(slug)) return <Landing />;
  // Verify the saved city still exists for this country.
  const country = countries.find((c) => c.code === countryCode);
  if (!country || !country.cities.some((c) => c.id === cityId)) {
    return <Landing />;
  }
  const citySlug = cityIdToSlug(cityId);
  return (
    <Redirect
      to={buildLocalePath({ lang: language, country: slug, city: citySlug })}
      replace
    />
  );
}

function RootRouter() {
  const [path] = useLocation();
  const parsed = parseLocalePath(path);

  if (path === "/" || path === "") {
    return <RootRedirectFromLanding />;
  }

  if (parsed.hasLocalePrefix && parsed.lang && parsed.country) {
    if (!parsed.city) {
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <LocaleProvider>
            <LocationProvider>
              <AuthProvider>
                <CartProvider>
                  <DocumentMeta />
                  <SeoHead />
                  <RootRouter />
                  <Toaster />
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
