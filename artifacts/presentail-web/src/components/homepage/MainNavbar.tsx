import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ChevronDown, Menu, Search, ShoppingCart, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/Logo";
import { useLocationSelection } from "@/contexts/LocationContext";
import { SearchOverlay } from "@/components/search/SearchOverlay";
import { useBrands } from "@/lib/queries";
import { prefetchProps } from "@/lib/prefetch";
import {
  loadCart,
  loadSignIn,
  loadShop,
} from "@/lib/pageLoaders";
import { AccountDropdown } from "@/components/account/AccountDropdown";
import { OCCASION_OPTIONS } from "@/data/occasions";

type MegaItem = {
  label: string;
  href: string;
  img?: string;
  emoji?: string;
};

type MegaMenuDef = {
  key: string;
  labelKey: string;
  items: MegaItem[];
  footer?: { label: string; href: string };
};

const MEGA_MENUS: MegaMenuDef[] = [
  {
    key: "occasions",
    labelKey: "nav.occasions",
    items: OCCASION_OPTIONS.map((o) => ({
      label: o.label,
      href: `/shop?occasion=${o.value}`,
      ...("img" in o ? { img: o.img } : {}),
      ...("emoji" in o ? { emoji: o.emoji } : {}),
    })),
    footer: { label: "View All Occasions", href: "/occasions" },
  },
  {
    key: "flowers",
    labelKey: "nav.flowersPlants",
    items: [
      { label: "Flower Boxes",       href: "/shop?category=flower-boxes",        img: "/catalog/categories/flower-boxes.avif" },
      { label: "Preserved Flowers",  href: "/shop?category=preserved-flowers",   img: "/catalog/categories/preserved-flowers.avif" },
      { label: "Flower Baskets",     href: "/shop?category=baskets",             emoji: "🧺" },
      { label: "All Flowers",        href: "/shop?category=hand-bouquets",       img: "/catalog/categories/hand-bouquets.webp" },
      { label: "Flower Vases",       href: "/shop?category=flower-vases",        img: "/catalog/categories/flower-vases.avif" },
      { label: "Dried Flowers",      href: "/shop?category=dried-flowers",       emoji: "🌾" },
      { label: "Plants",             href: "/shop?category=plants",              img: "/catalog/categories/plants.webp" },
      { label: "Hand Bouquets",      href: "/shop?category=hand-bouquets",       img: "/catalog/categories/hand-bouquets.webp" },
      { label: "Lux Arrangements",   href: "/shop?category=lux-arrangements",    img: "/catalog/categories/lux-arrangements.avif" },
      { label: "Artificial Flowers", href: "/shop?category=artificial-flowers",  emoji: "🌺" },
    ],
  },
  {
    key: "gifts",
    labelKey: "nav.gifts",
    items: [
      { label: "Gift Bundles",    href: "/shop?category=bundles",         img: "/catalog/categories/bundles.webp" },
      { label: "Cakes",           href: "/shop?category=cakes",           img: "/catalog/categories/cakes.webp" },
      { label: "Single Balloons", href: "/shop?category=single-balloons", img: "/catalog/categories/balloons.webp" },
      { label: "Stuffed Animals", href: "/shop?category=stuffed-animals", img: "/catalog/categories/stuffed-animals.webp" },
      { label: "Chocolate",       href: "/shop?category=chocolate",       img: "/catalog/categories/chocolate.webp" },
      { label: "Balloon Bundles", href: "/shop?category=balloon-bundles", img: "/catalog/categories/balloons.webp" },
      { label: "Beauty",          href: "/shop?category=beauty",          emoji: "💄" },
      { label: "Gift Baskets",    href: "/shop?category=baskets",         emoji: "🎁" },
      { label: "Arabic Sweets",   href: "/shop?category=arabic-sweets",   img: "/catalog/categories/arabic-sweets.webp" },
      { label: "Balloon Deco",    href: "/shop?category=balloon-deco",    img: "/catalog/categories/balloons.webp" },
    ],
  },
];

function MegaMenuPanel({
  def,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: {
  def: MegaMenuDef;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <motion.div
      key={def.key}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="absolute top-full left-0 right-0 z-[70] bg-[#fafaf9] border-t border-border shadow-2xl"
    >
      <div className="container mx-auto max-w-content px-page pt-5 pb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {def.items.map((item) => (
            <Link
              key={item.label + item.href}
              href={item.href}
              onClick={onClose}
              data-testid={`megamenu-item-${item.label.toLowerCase().replace(/[\s']+/g, "-")}`}
              className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-white shadow-sm hover:shadow-md hover:ring-1 hover:ring-primary/25 transition-all group"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 shadow-sm">
                {item.img ? (
                  <img
                    src={item.img}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="text-xl select-none leading-none">{item.emoji}</span>
                )}
              </div>
              <span className="text-[13px] font-medium leading-snug text-foreground group-hover:text-primary transition-colors">
                {item.label}
              </span>
            </Link>
          ))}
        </div>

        {def.footer && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <Link
              href={def.footer.href}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline underline-offset-2"
            >
              {def.footer.label}
              <span aria-hidden>→</span>
            </Link>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function MainNavbar() {
  const { itemCount } = useCart();
  const { user } = useAuth();
  const { t, language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const [searchOpen, setSearchOpen] = useState(false);
  const [location] = useLocation();

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

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const openMenu = (key: string) => {
    clearTimeout(closeTimerRef.current);
    setActiveMenu(key);
  };

  const scheduleClose = () => {
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setActiveMenu(null), 180);
  };

  const cancelClose = () => clearTimeout(closeTimerRef.current);

  const closeMenu = () => setActiveMenu(null);

  // Close on Escape
  useEffect(() => {
    if (!activeMenu) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeMenu(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeMenu]);

  const activeDef = MEGA_MENUS.find((m) => m.key === activeMenu) ?? null;

  // Close on click outside the navbar+panel wrapper
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeMenu) return;
    const handle = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [activeMenu]);

  return (
    <div ref={wrapperRef} className="bg-white sticky top-0 z-[60] border-b border-gray-200">
      <div className="container mx-auto max-w-content px-page h-20 grid grid-cols-[auto_1fr_auto] md:grid-cols-3 items-center gap-4">

        {/* ── Left: nav ────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          {/* Mobile sheet */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("nav.menuAria")} data-testid="button-mobile-menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[360px] overflow-y-auto">
              <nav className="flex flex-col gap-0.5 mt-8 pb-10">
                {MEGA_MENUS.map((menu) => (
                  <div key={menu.key} className="mb-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground px-2 mb-1.5 font-semibold">
                      {t(menu.labelKey)}
                    </p>
                    {menu.items.map((item) => (
                      <Link
                        key={item.label + item.href}
                        href={item.href}
                        className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-secondary/70 transition-colors text-sm"
                      >
                        <span className="w-7 h-7 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 text-base">
                          {item.img ? (
                            <img src={item.img} alt="" className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <span className="text-base leading-none">{item.emoji}</span>
                          )}
                        </span>
                        {item.label}
                      </Link>
                    ))}
                    {menu.footer && (
                      <Link
                        href={menu.footer.href}
                        className="flex items-center px-2 py-2 text-sm font-semibold text-primary hover:underline mt-1"
                      >
                        {menu.footer.label} →
                      </Link>
                    )}
                  </div>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Desktop nav triggers */}
          <nav className="hidden md:flex items-center gap-6" aria-label={t("nav.mainNavAria")}>
            {MEGA_MENUS.map((menu) => (
              <button
                key={menu.key}
                type="button"
                onMouseEnter={() => { openMenu(menu.key); loadShop().catch(() => {}); }}
                onMouseLeave={scheduleClose}
                onClick={() => setActiveMenu(activeMenu === menu.key ? null : menu.key)}
                aria-haspopup="true"
                aria-expanded={activeMenu === menu.key}
                data-testid={`nav-trigger-${menu.key}`}
                className={`text-sm font-semibold flex items-center gap-0.5 transition-colors py-1 ${
                  activeMenu === menu.key ? "text-primary" : "text-foreground hover:text-primary/80"
                }`}
              >
                {t(menu.labelKey)}
                <ChevronDown
                  className={`w-3.5 h-3.5 opacity-60 transition-transform duration-200 ${
                    activeMenu === menu.key ? "rotate-180" : ""
                  }`}
                />
              </button>
            ))}
          </nav>
        </div>

        {/* ── Center: logo ──────────────────────────────────── */}
        <div className="flex justify-center">
          <Link href="/" className="flex items-center" aria-label={t("nav.logoAria")} data-testid="link-logo">
            <Logo className="h-14 md:h-20 w-auto" />
          </Link>
        </div>

        {/* ── Right: icons ─────────────────────────────────── */}
        <div className="flex items-center justify-end gap-1 md:gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("nav.searchAria")}
            data-testid="button-search"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="!w-[22px] !h-[22px]" />
          </Button>
          <SearchOverlay
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            brandSlug={activeBrandSlug ?? undefined}
            brandName={activeBrand?.name ?? undefined}
          />

          {user ? (
            <AccountDropdown />
          ) : (
            <Link href="/sign-in" aria-label={t("nav.accountAria")} {...prefetchProps(loadSignIn)}>
              <Button variant="ghost" size="icon" aria-label={t("nav.accountAria")} data-testid="button-account">
                <User className="!w-[22px] !h-[22px]" />
              </Button>
            </Link>
          )}

          <Link href="/cart" aria-label={t("nav.bagAria")} {...prefetchProps(loadCart)}>
            <Button variant="ghost" size="icon" className="relative" aria-label={t("nav.bagAria")} data-testid="button-cart">
              <ShoppingCart className="!w-[22px] !h-[22px]" />
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

      {/* ── Mega menu panel ──────────────────────────────────── */}
      <AnimatePresence>
        {activeDef && (
          <MegaMenuPanel
            def={activeDef}
            onClose={closeMenu}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
