import { Link } from "wouter";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ChevronDown, Menu, Search, ShoppingBag, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const NAV_LINKS = [
  { key: "nav.occasions", href: "/shop?occasion=birthday" },
  { key: "nav.flowersPlants", href: "/shop?category=hand-bouquets" },
  { key: "nav.gifts", href: "/shop?category=cakes" },
  { key: "nav.brands", href: "/brands" },
] as const;

export function MainNavbar() {
  const { itemCount } = useCart();
  const { user } = useAuth();
  const { t } = useLocale();

  return (
    <div className="bg-background border-b border-border/60">
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
                {NAV_LINKS.map((l) => (
                  <Link
                    key={l.key}
                    href={l.href}
                    className="text-lg font-serif py-2 border-b border-border/60"
                  >
                    {t(l.key)}
                  </Link>
                ))}
                <Link href="/about" className="text-lg font-serif py-2">
                  {t("nav.about")}
                </Link>
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
            className="text-2xl md:text-3xl font-serif tracking-[0.18em] text-primary"
            data-testid="link-logo"
          >
            PRESENTAIL
          </Link>
        </div>

        {/* Right: icons */}
        <div className="flex items-center justify-end gap-1 md:gap-3">
          <Link
            href="/about"
            className="hidden lg:inline text-sm font-medium hover:text-primary/80 transition-colors"
          >
            {t("nav.about")}
          </Link>

          <Button variant="ghost" size="icon" aria-label={t("nav.searchAria")} data-testid="button-search">
            <Search className="w-5 h-5" />
          </Button>

          <Link href={user ? "/account" : "/auth"} aria-label={t("nav.accountAria")}>
            <Button variant="ghost" size="icon" data-testid="button-account">
              <User className="w-5 h-5" />
            </Button>
          </Link>

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
        </div>
      </div>
    </div>
  );
}
