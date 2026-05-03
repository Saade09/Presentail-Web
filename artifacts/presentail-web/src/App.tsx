import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import {
  LocationProvider,
  useLocationSelection,
} from "@/contexts/LocationContext";

import { HomepageHeader } from "@/components/homepage/HomepageHeader";
import { Footer } from "@/components/Footer";
import { LocationPickerGate } from "@/components/LocationPickerGate";

import Landing from "@/pages/Landing";
import CountryHome from "@/pages/CountryHome";
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

function RequireCountry({ children }: { children: React.ReactNode }) {
  const { cityId, isLoadingCountries, country, city } = useLocationSelection();
  const [, navigate] = useLocation();
  const hasValidSelection =
    !!cityId && (isLoadingCountries || (!!country && !!city));

  useEffect(() => {
    if (!cityId) {
      navigate("/", { replace: true });
    }
  }, [cityId, navigate]);

  if (!hasValidSelection) {
    return <div className="min-h-[60vh]" data-testid="require-country-loading" />;
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
            <Route path="/lb" component={CountryHome} />
            <Route path="/ae" component={CountryHome} />
            <Route path="/cy" component={CountryHome} />
            <Route path="/shop">
              <RequireCountry>
                <Shop />
              </RequireCountry>
            </Route>
            <Route path="/product/:slug">
              <RequireCountry>
                <ProductDetail />
              </RequireCountry>
            </Route>
            <Route path="/brands">
              <RequireCountry>
                <Brands />
              </RequireCountry>
            </Route>
            <Route path="/brand/:slug">
              <RequireCountry>
                <BrandDetail />
              </RequireCountry>
            </Route>
            <Route path="/cart">
              <RequireCountry>
                <Cart />
              </RequireCountry>
            </Route>
            <Route path="/checkout">
              <RequireCountry>
                <Checkout />
              </RequireCountry>
            </Route>
            <Route path="/order-confirmed" component={OrderConfirmed} />
            <Route path="/auth" component={Auth} />
            <Route path="/account" component={Account} />
            <Route component={NotFound} />
          </Switch>
        </main>
        <Footer />
      </div>
    </LocationPickerGate>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route component={ShopShell} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LocaleProvider>
          <AuthProvider>
            <CartProvider>
              <LocationProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <Router />
                </WouterRouter>
                <Toaster />
              </LocationProvider>
            </CartProvider>
          </AuthProvider>
        </LocaleProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
