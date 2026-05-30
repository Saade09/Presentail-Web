import { Link, useLocation, useRoute } from "wouter";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { ShoppingBag, User, Search, Menu, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/Logo";
import { SearchOverlay } from "@/components/search/SearchOverlay";
import { useBrands } from "@/lib/queries";

export function Navbar() {
  const { itemCount } = useCart();
  const { user } = useAuth();
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { city, countryCode, cityId, openPicker } = useLocationSelection();
  const { t, language } = useLocale();

  const [isBrandRoute, brandRouteParams] = useRoute("/brand/:slug");
  const activeBrandSlug = isBrandRoute ? (brandRouteParams?.slug ?? null) : null;
  const { data: brandsData } = useBrands({
    lang: language,
    countryCode: countryCode ?? undefined,
    cityId: cityId ?? undefined,
  });
  const activeBrand = activeBrandSlug
    ? brandsData?.brands.find((b) => b.slug === activeBrandSlug)
    : null;

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const cityLabel = city?.name ?? t("navbar.selectCity");

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-[60] transition-all duration-300 ${
        scrolled ? "bg-background border-b shadow-sm" : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        <div className="flex items-center gap-4 md:gap-8">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[400px]">
              <nav className="flex flex-col gap-4 mt-8">
                <Link href="/shop" className="text-lg font-serif">{t("nav.shop")}</Link>
                <Link href="/shop?occasion=birthday" className="text-lg font-serif">{t("nav.occasions")}</Link>
                {countryCode?.toUpperCase() !== "AE" && <Link href="/brands" className="text-lg font-serif">{t("nav.brands")}</Link>}
              </nav>
            </SheetContent>
          </Sheet>

          <Link href="/" className="flex items-center" aria-label={t("nav.logoAria")}>
            <Logo height={32} />
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/shop" className="text-sm font-medium hover:text-primary/80 transition-colors">{t("nav.shop")}</Link>
            <Link href="/shop?occasion=birthday" className="text-sm font-medium hover:text-primary/80 transition-colors">{t("nav.occasions")}</Link>
            {countryCode?.toUpperCase() !== "AE" && <Link href="/brands" className="text-sm font-medium hover:text-primary/80 transition-colors">{t("nav.brands")}</Link>}
          </nav>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button
            type="button"
            onClick={() => openPicker()}
            className="hidden lg:flex items-center gap-1.5 text-sm text-muted-foreground bg-secondary/50 hover:bg-secondary px-3 py-1.5 rounded-full transition-colors"
            data-testid="button-open-location-picker"
          >
            <MapPin className="w-4 h-4" />
            <span>{t("utility.deliverTo")} <strong className="text-foreground font-medium">{cityLabel}</strong></span>
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:flex"
            aria-label={t("nav.searchAria")}
            onClick={() => setSearchOpen(true)}
          >
            <Search className="w-5 h-5" />
          </Button>
          <SearchOverlay
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            brandSlug={activeBrandSlug ?? undefined}
            brandName={activeBrand?.name ?? undefined}
          />

          <Link href={user ? "/account" : "/sign-in"}>
            <Button variant="ghost" size="icon" aria-label={t("nav.accountAria")}>
              <User className="w-5 h-5" />
            </Button>
          </Link>

          <Link href="/cart">
            <Button variant="ghost" size="icon" className="relative" aria-label={t("nav.bagAria")}>
              <ShoppingBag className="w-5 h-5" />
              <AnimatePresence>
                {itemCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute top-1.5 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                  >
                    {itemCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
