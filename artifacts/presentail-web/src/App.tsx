import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { LocationProvider } from "@/contexts/LocationContext";

import { HomepageHeader } from "@/components/homepage/HomepageHeader";
import { Footer } from "@/components/Footer";
import { LocationPickerGate } from "@/components/LocationPickerGate";

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

function Router() {
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
        <Footer />
      </div>
    </LocationPickerGate>
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
