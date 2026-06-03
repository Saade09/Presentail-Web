import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
  useLocation,
} from "wouter";
import { lazy, Suspense, useEffect, useRef } from "react";
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
  loadAllOccasions,
} from "@/lib/pageLoaders";
import { isUserType, canShop } from "@workspace/clerk-types";
import { Toaster } from "@/components/ui/toaster";
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
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));

const HomeRoute = withSuspense(Home, HomePageSkeleton);
const ShopRoute = withSuspense(Shop, ShopPageSkeleton);
const ProductDetailRoute = withSuspense(ProductDetail, ProductDetailSkeleton);
const CheckoutRoute = withSuspense(Checkout, CheckoutSkeleton);
const AccountRoute = withSuspense(Account, AccountSkeleton);
const PersonalInformationRoute = withSuspense(PersonalInformation, AccountSkeleton);
const FavoritesRoute = withSuspense(Favorites, AccountSkeleton);
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
    const handler = () => {
      isPop.current = true;
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const [pathname] = useLocation();
  useEffect(() => {
    if (isPop.current) {
      isPop.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
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
        {!isCheckoutPage && <HomepageHeader />}
        <main className="flex-1">
          <Switch>
            <Route path="/" component={HomeRoute} />
            <Route path="/shop" component={ShopRoute} />
            <Route path="/product/:slug" component={ProductDetailRoute} />
            <Route path="/brands" component={BrandsRoute} />
            <Route path="/brand/:slug" component={BrandDetailRoute} />
            <Route path="/occasions" component={AllOccasionsRoute} />
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
        </main>
        {!isCheckoutPage && <Footer />}
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

function CurrencyDataLoader() {
  const { data } = useCurrenciesData();
  useEffect(() => {
    if (!data) return;
    setCurrencySnapshot(data);
  }, [data]);
  return null;
}

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
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
