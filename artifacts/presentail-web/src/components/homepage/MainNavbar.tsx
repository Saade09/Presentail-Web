import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ChevronDown, Heart, Menu, Search, ShoppingBag, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/Logo";
import { useLocationSelection } from "@/contexts/LocationContext";
import { SearchOverlay } from "@/components/search/SearchOverlay";

const ALL_NAV_LINKS = [
  { key: "nav.occasions", href: "/shop?occasion=birthday" },
  { key: "nav.flowersPlants", href: "/shop?category=hand-bouquets" },
  { key: "nav.gifts", href: "/shop?category=cakes" },
  { key: "nav.brands", href: "/brands" },
] as const;

export function MainNavbar() {
  const { itemCount } = useCart();
  const { user } = useAuth();
  const { t } = useLocale();
  const { countryCode } = useLocationSelection();
  const [searchOpen, setSearchOpen] = useState(false);
  const MOBILE_NAV_LINKS = countryCode === "AE" ? ALL_NAV_LINKS.filter(l => l.key !== "nav.brands") : ALL_NAV_LINKS;
  const NAV_LINKS = ALL_NAV_LINKS.filter(l => l.key !== "nav.brands");
  const [location] = useLocation();
  const isShopPage = location === "/shop" || location.startsWith("/shop?") || location.startsWith("/shop/");

  return (
    <div className="bg-background">
      <div className="container mx-auto px-4 h-20 grid grid-cols-[auto_1fr_auto] md:grid-cols-3 items-center gap-4">
        {/* Left: nav links */}
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" data-testid="button-mobile-menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[360px]">
              <nav className="flex flex-col gap-2 mt-8">
                {MOBILE_NAV_LINKS.map((l) => (
                  <Link
                    key={l.key}
                    href={l.href}
                    className="text-lg font-serif py-2 border-b border-border/60"
                  >
                    {t(l.key)}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                className="text-sm font-medium hover:text-primary/80 transition-colors flex items-center gap-1"
                data-testid={`link-nav-${l.key}`}
              >
                {t(l.key)}
                <ChevronDown className="w-3 h-3 opacity-60" />
              </Link>
            ))}
          </nav>
        </div>

        {/* Center: logo */}
        <div className="flex justify-center">
          <Link
            href="/"
            className="flex items-center"
            aria-label="Presentail"
            data-testid="link-logo"
          >
            <Logo className="h-14 md:h-20 w-auto" />
          </Link>
        </div>

        {/* Right: icons */}
        <div className="flex items-center justify-end gap-1 md:gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("nav.searchAria")}
            data-testid="button-search"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="w-5 h-5" />
          </Button>
          <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

          {user && (
            <Link href="/favorites" aria-label="Favorites">
              <Button variant="ghost" size="icon" data-testid="button-favorites">
                <Heart className="w-5 h-5" />
              </Button>
            </Link>
          )}
          <Link href={user ? "/account" : "/sign-in"} aria-label={t("nav.accountAria")}>
            <Button variant="ghost" size="icon" data-testid="button-account">
              <User className="w-5 h-5" />
            </Button>
          </Link>

          {!isShopPage && (
            <Link href="/cart" aria-label={t("nav.bagAria")}>
              <Button variant="ghost" size="icon" className="relative" data-testid="button-cart">
                <ShoppingBag className="w-5 h-5" />
                <AnimatePresence>
                  {itemCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                    >
                      {itemCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
