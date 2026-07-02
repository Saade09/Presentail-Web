import { useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ChevronDown, ChevronRight, Menu, Search, ShoppingCart, User, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/Logo";
import { useLocationSelection } from "@/contexts/LocationContext";
import { SearchOverlay } from "@/components/search/SearchOverlay";
import { useBrands, useCatalogMetadata } from "@/lib/queries";
import { CATEGORY_SLUG_REMAP, CATEGORY_NAV_BLOCKLIST } from "@/lib/categoryGroups";
import {
  useGetCatalogOccasions,
  getGetCatalogOccasionsQueryKey,
} from "@workspace/api-client-react";
import { OCCASION_OPTIONS } from "@/data/occasions";
import { prefetchProps } from "@/lib/prefetch";
import {
  loadCart,
  loadCheckout,
  loadSignIn,
  loadSignUp,
  loadAccount,
  loadFavorites,
  loadBrands,
  loadBrandDetail,
  loadShop,
} from "@/lib/pageLoaders";
import { AccountDropdown } from "@/components/account/AccountDropdown";
import { CATEGORY_GROUPS, CATEGORY_STATIC_IMAGES } from "@/lib/categoryGroups";

const LABEL_EXPLORE_PRESENTAIL = "Explore Presentail"; // i18n-ignore

function MegaItemThumbnail({ img, emoji, className }: { img?: string; emoji?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (img && !failed) {
    return (
      <img
        src={img}
        alt=""
        className={className ?? "w-full h-full object-cover"}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="text-xl select-none leading-none">{emoji ?? "🎉"}</span>;
}

const EMOJI_GRADIENTS: Record<string, string> = {
  "🧺": "from-amber-50 to-orange-100",
  "🌾": "from-yellow-50 to-amber-100",
  "🌺": "from-pink-50 to-rose-100",
  "💄": "from-rose-50 to-pink-100",
  "🎁": "from-purple-50 to-violet-100",
  "🎉": "from-sky-50 to-blue-100",
  "🌸": "from-pink-50 to-fuchsia-100",
  "⚡": "from-yellow-50 to-amber-100",
  "💐": "from-green-50 to-emerald-100",
};

function MobileSubPanelTile({ img, emoji }: { img?: string; emoji?: string }) {
  const [failed, setFailed] = useState(false);
  if (img && !failed) {
    return (
      <img
        src={img}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  const gradient = EMOJI_GRADIENTS[emoji ?? "🎉"] ?? "from-gray-50 to-gray-100";
  return (
    <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${gradient}`}>
      <span className="text-4xl select-none leading-none">{emoji ?? "🎉"}</span>
    </div>
  );
}

type MegaItem = {
  label: string;
  labelKey?: string;
  href: string;
  img?: string;
  emoji?: string;
};

type MegaMenuDef = {
  key: string;
  labelKey: string;
  items: MegaItem[];
  footer?: { label: string; labelKey?: string; href: string };
  loading?: boolean;
};

const STATIC_MENUS: MegaMenuDef[] = [
  {
    key: "gifts",
    labelKey: "nav.gifts",
    items: [
      { label: "Gift Bundles",    href: "/category/bundles",         img: "/catalog/categories/bundles.webp" },
      { label: "Cakes",           href: "/category/cakes",           img: "/catalog/categories/cakes.webp" },
      { label: "Single Balloons", href: "/category/single-balloons", img: "/catalog/categories/balloons.webp" },
      { label: "Stuffed Animals", href: "/category/stuffed-animals", img: "/catalog/categories/stuffed-animals.webp" },
      { label: "Chocolate",       href: "/category/chocolate",       img: "/catalog/categories/chocolate.webp" },
      { label: "Balloon Bundles", href: "/category/balloon-bundles", img: "/catalog/categories/balloons.webp" },
      { label: "Beauty",          href: "/category/beauty",          emoji: "💄" },
      { label: "Gift Baskets",    href: "/category/gift-baskets",    img: "/catalog/categories/gift-baskets.webp" },
      { label: "Arabic Sweets",   href: "/category/arabic-sweets",   img: "/catalog/categories/arabic-sweets.webp" },
      { label: "Balloon Deco",    href: "/category/balloon-deco",    img: "/catalog/categories/balloons.webp" },
      { label: "Electronics",     labelKey: "nav.electronics", href: "/category/electronics",     img: "/catalog/categories/electronics.webp" },
    ],
    footer: { label: "View all Gifts", labelKey: "nav.viewAllGifts", href: "/shop" },
  },
  {
    key: "flowers",
    labelKey: "nav.flowersPlants",
    items: [
      { label: "Flower Boxes",       href: "/category/flower-boxes",        img: "/catalog/categories/flower-boxes.avif" },
      { label: "Preserved Flowers",  href: "/category/preserved-flowers",   img: "/catalog/categories/preserved-flowers.avif" },
      { label: "Flower Baskets",     href: "/category/flower-baskets",      img: "/catalog/categories/flower-baskets.webp" },
      { label: "Flower Vases",       href: "/category/flower-vases",        img: "/catalog/categories/flower-vases.avif" },
      { label: "Dried Flowers",      href: "/category/dried-flowers",       emoji: "🌾" },
      { label: "Plants",             href: "/category/plants",              img: "/catalog/categories/plants.webp" },
      { label: "Hand Bouquets",      href: "/category/hand-bouquets",       img: "/catalog/categories/hand-bouquets.webp" },
      { label: "Lux Arrangements",   href: "/category/lux-arrangements",    img: "/catalog/categories/lux-arrangements.avif" },
      { label: "Artificial Flowers", href: "/category/artificial-flowers",  emoji: "🌺" },
    ],
    footer: { label: "All Flowers & Plants", labelKey: "nav.viewAllFlowers", href: "/category/flowers" },
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
          {def.loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-white shadow-sm animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-muted shrink-0" />
                  <div className="h-3 bg-muted rounded flex-1" />
                </div>
              ))
            : def.items.map((item) => (
                <Link
                  key={item.label + item.href}
                  href={item.href}
                  onClick={onClose}
                  data-testid={`megamenu-item-${item.label.toLowerCase().replace(/[\s']+/g, "-")}`}
                  className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-white shadow-sm hover:shadow-md hover:ring-1 hover:ring-primary/25 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 shadow-sm">
                    <MegaItemThumbnail img={item.img} emoji={item.emoji} />
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
  const [isSignInRoute] = useRoute("/sign-in");
  const [isBrandRoute, brandRouteParams] = useRoute("/brand/:slug");
  const activeBrandSlug = isBrandRoute ? (brandRouteParams?.slug ?? null) : null;
  const { data: brandsData, isPending: brandsLoading } = useBrands({
    lang: language,
    countryCode: countryCode ?? undefined,
    cityId: cityId ?? undefined,
  });
  const activeBrand = activeBrandSlug
    ? brandsData?.brands.find((b) => b.slug === activeBrandSlug)
    : null;

  const { data: occasionsData, isPending: occasionsLoading } = useGetCatalogOccasions({
    query: {
      queryKey: getGetCatalogOccasionsQueryKey(),
      staleTime: 15 * 60 * 1000,
    },
  });
  const osOccasions = occasionsData?.occasions ?? [];
  const occasionItems: MegaItem[] =
    osOccasions.length > 0
      ? osOccasions.map((o) => ({
          label: o.name,
          href: `/occasion/${o.slug}`,
          ...(o.image ? { img: o.image } : { emoji: "🎉" }),
        }))
      : OCCASION_OPTIONS.map((o) => ({
          label: o.label,
          href: `/occasion/${o.value}`,
          ...("img" in o ? { img: o.img } : { emoji: o.emoji }),
        }));
  const occasionsMenuDef: MegaMenuDef = {
    key: "occasions",
    labelKey: "nav.occasions",
    items: occasionItems,
    footer: { label: "View All Occasions", labelKey: "nav.viewAllOccasions", href: "/occasions" },
    loading: occasionsLoading,
  };
  // Filter mega-menu category items to only those present in the OS categories
  // list so stale or unavailable categories don't appear in the nav.
  // When useCatalogMetadata hasn't resolved yet (cold cache / loading), fall
  // back to the unfiltered static list so the menu is never blank.
  // New OS categories not covered by STATIC_MENUS are appended automatically
  // to the appropriate group ("flowers" | "gifts") via CATEGORY_GROUPS.
  const { data: catalogMetadata } = useCatalogMetadata();
  const osCategorySlugs = catalogMetadata
    ? new Set(catalogMetadata.categories.map((c) => c.id))
    : null;

  // Slugs already in STATIC_MENUS (pre-filter) — used to detect net-new OS categories.
  const staticMenuSlugs = new Set(
    STATIC_MENUS.flatMap((m) =>
      m.items.map((item) => item.href.split("/category/")[1] ?? ""),
    ),
  );

  const filteredStaticMenus: MegaMenuDef[] = STATIC_MENUS.map((menu) => {
    const filteredItems = osCategorySlugs
      ? menu.items.filter((item) => {
          const slug = item.href.split("/category/")[1] ?? "";
          // Allow if no slug, if the slug is in OS catalog, or if it's a known
          // product-level alias (e.g. gift-baskets) that maps from a catalog slug.
          const remapValues = new Set(Object.values(CATEGORY_SLUG_REMAP));
          return !slug || osCategorySlugs.has(slug) || remapValues.has(slug);
        })
      : menu.items;

    // Append OS-only categories for this group that aren't in STATIC_MENUS at all.
    const newItems: MegaItem[] = catalogMetadata
      ? catalogMetadata.categories
          .filter(
            (c) =>
              !staticMenuSlugs.has(c.id) &&
              !CATEGORY_NAV_BLOCKLIST.has(c.id) &&
              // Also exclude catalog slugs whose remap target is already covered
              // by a static menu item (e.g. "baskets" → "gift-baskets" is in static).
              !(CATEGORY_SLUG_REMAP[c.id] && staticMenuSlugs.has(CATEGORY_SLUG_REMAP[c.id]!)) &&
              (CATEGORY_GROUPS[c.id] ?? "gifts") === menu.key,
          )
          .map((c) => {
            const productSlug = CATEGORY_SLUG_REMAP[c.id] ?? c.id;
            const img = CATEGORY_STATIC_IMAGES[productSlug] ?? CATEGORY_STATIC_IMAGES[c.id];
            return {
              label: c.name,
              href: `/category/${productSlug}`,
              ...(img ? { img } : { emoji: "🎁" }),
            };
          })
      : [];

    const resolvedFooter = menu.footer
      ? {
          ...menu.footer,
          label: menu.footer.labelKey ? t(menu.footer.labelKey) : menu.footer.label,
        }
      : undefined;

    const resolvedItems = [...filteredItems, ...newItems].map((item) =>
      item.labelKey ? { ...item, label: t(item.labelKey) } : item,
    );
    return { ...menu, items: resolvedItems, footer: resolvedFooter };
  });

  const brandsMegaMenuDef: MegaMenuDef = {
    key: "brands",
    labelKey: "nav.brands",
    items: [...(catalogMetadata?.brands ?? [])]
      .sort((a, b) => {
        const aOrder = (a.sort_order ?? null) !== null ? a.sort_order! : Infinity;
        const bOrder = (b.sort_order ?? null) !== null ? b.sort_order! : Infinity;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      })
      .map((b) => ({
        label: b.name,
        href: `/brand/${b.slug}`,
        img: b.image ?? undefined,
        emoji: "🏷️",
      })),
    footer: { label: t("nav.viewAllBrands"), href: "/brands" },
    loading: !catalogMetadata,
  };

  const megaMenus: MegaMenuDef[] = [occasionsMenuDef, ...filteredStaticMenus, brandsMegaMenuDef];

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSubPanel, setMobileSubPanel] = useState<string | null>(null);

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

  const activeDef = megaMenus.find((m) => m.key === activeMenu) ?? null;

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
      <div className="container mx-auto max-w-content px-page h-[90px] md:h-28 grid grid-cols-[auto_1fr_auto] md:grid-cols-3 items-center gap-4">

        {/* ── Left: nav ────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          {/* Mobile sheet */}
          <Sheet
            open={mobileMenuOpen}
            onOpenChange={(open) => {
              setMobileMenuOpen(open);
              if (!open) setMobileSubPanel(null);
            }}
          >
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("nav.menuAria")} data-testid="button-mobile-menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-full max-w-full sm:!max-w-full border-r-0 p-0 overflow-hidden [&>button:first-child]:hidden">

              {/* ── Main menu view ───────────────────────────── */}
              <div
                className={`absolute inset-0 flex flex-col bg-white transition-transform duration-300 ease-in-out ${
                  mobileSubPanel ? "-translate-x-full" : "translate-x-0"
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 h-16 border-b border-gray-100 shrink-0">
                  <span className="text-[17px] font-semibold text-gray-800">{LABEL_EXPLORE_PRESENTAIL}</span>
                  <SheetClose asChild>
                    <button
                      type="button"
                      className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 transition-colors"
                      aria-label={t("nav.closeMenuAria")}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </SheetClose>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto">
                  {/* Category rows */}
                  <div className="px-5 pt-3">
                    {[
                      {
                        key: "occasions",
                        label: t("nav.occasions"),
                        img: "/catalog/categories/preserved-flowers.avif",
                        emoji: "🎉",
                      },
                      {
                        key: "flowers",
                        label: t("nav.flowersPlants"),
                        img: "/catalog/categories/flower-boxes.avif",
                        emoji: "🌸",
                      },
                      {
                        key: "gifts",
                        label: t("nav.gifts"),
                        img: "/catalog/categories/bundles.webp",
                        emoji: "🎁",
                      },
                      {
                        key: "brands",
                        label: t("nav.brands"),
                        img: catalogMetadata?.brands[0]?.image ?? undefined,
                        emoji: "🏷️",
                      },
                    ].map((cat) => (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setMobileSubPanel(cat.key)}
                        className="w-full flex items-center gap-4 py-3.5 border-b border-gray-100 last:border-0"
                      >
                        <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center shrink-0 shadow-sm">
                          <MegaItemThumbnail img={cat.img} emoji={cat.emoji} className="w-full h-full object-cover" />
                        </div>
                        <span className="flex-1 text-[15px] font-medium text-gray-800 text-left">{cat.label}</span>
                        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                      </button>
                    ))}
                  </div>

                </div>
              </div>

              {/* ── Sub-panel view ────────────────────────────── */}
              <div
                className={`absolute inset-0 flex flex-col bg-white transition-transform duration-300 ease-in-out ${
                  mobileSubPanel ? "translate-x-0" : "translate-x-full"
                }`}
              >
                {(() => {
                  const subDef = megaMenus.find((m) => m.key === mobileSubPanel);
                  return (
                    <>
                      {/* Sub-panel header */}
                      <div className="flex items-center gap-3 px-5 h-16 border-b border-gray-100 shrink-0">
                        <button
                          type="button"
                          onClick={() => setMobileSubPanel(null)}
                          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 transition-colors shrink-0"
                          aria-label={t("nav.backAria")}
                        >
                          <ChevronRight className="w-5 h-5 rotate-180" />
                        </button>
                        <span className="flex-1 text-[17px] font-semibold text-gray-900">
                          {subDef ? t(subDef.labelKey) : ""}
                        </span>
                        <SheetClose asChild>
                          <button
                            type="button"
                            className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 transition-colors shrink-0"
                            aria-label={t("nav.closeMenuAria")}
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </SheetClose>
                      </div>

                      {/* Sub-panel grid */}
                      <div className="flex-1 overflow-y-auto px-4 py-5">
                        {subDef?.loading ? (
                          <div className="grid grid-cols-4 gap-2">
                            {Array.from({ length: 12 }).map((_, i) => (
                              <div key={i} className="flex flex-col items-center gap-2">
                                <div className="w-full aspect-square rounded-2xl bg-gray-100 animate-pulse" />
                                <div className="h-3 w-14 rounded bg-gray-100 animate-pulse" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 gap-2">
                            {(subDef?.items ?? []).map((item) => (
                              <SheetClose asChild key={item.label + item.href}>
                                <Link href={item.href} className="flex flex-col items-center gap-1.5 group">
                                  <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
                                    <MobileSubPanelTile img={item.img} emoji={item.emoji} />
                                  </div>
                                  <span className="text-[10px] font-medium text-center text-gray-700 leading-tight px-0.5">
                                    {item.label}
                                  </span>
                                </Link>
                              </SheetClose>
                            ))}
                          </div>
                        )}
                        {subDef?.footer && (
                          <SheetClose asChild>
                            <Link
                              href={subDef.footer.href}
                              className="flex items-center justify-center gap-2 mt-5 w-full py-3.5 rounded-2xl bg-[#f7f5f0] border border-[#d9e8d4] text-primary text-sm font-semibold active:bg-[#eef5ec] transition-colors"
                            >
                              {subDef.footer.labelKey ? t(subDef.footer.labelKey) : subDef.footer.label}
                              <span aria-hidden>→</span>
                            </Link>
                          </SheetClose>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>

            </SheetContent>
          </Sheet>

          {/* Mobile search — right of hamburger, hidden on desktop */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={t("nav.searchAria")}
            data-testid="button-search-mobile"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="!w-[22px] !h-[22px]" />
          </Button>

          {/* Desktop nav triggers (left of logo — excludes Brands) */}
          <nav className="hidden md:flex items-center gap-6" aria-label={t("nav.mainNavAria")}>
            {megaMenus.filter((m) => m.key !== "brands").map((menu) => (
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
            <Logo height={88} />
          </Link>
        </div>

        {/* ── Right: Brands trigger (desktop) + icons ──────── */}
        <div className="flex items-center justify-end gap-1 md:gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
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

          {/* Brands link (desktop only) — prefetches Brands + BrandDetail on hover/focus */}
          <Link
            href="/brands"
            className="hidden md:inline-flex items-center text-sm font-semibold text-foreground hover:text-primary/80 transition-colors px-2 py-1"
            data-testid="nav-link-brands"
            {...prefetchProps(loadBrands, loadBrandDetail)}
          >
            {t("nav.brands")}
          </Link>

          {user ? (
            <span {...prefetchProps(loadAccount, loadFavorites)}>
              <AccountDropdown />
            </span>
          ) : (
            <Link
              href="/sign-in"
              aria-label={t("nav.accountAria")}
              className={isSignInRoute ? "pointer-events-none opacity-30" : undefined}
              aria-hidden={isSignInRoute ? "true" : undefined}
              tabIndex={isSignInRoute ? -1 : undefined}
              {...prefetchProps(loadSignIn, loadSignUp)}
            >
              <Button variant="ghost" size="icon" aria-label={t("nav.accountAria")} data-testid="button-account">
                <User className="!w-[22px] !h-[22px]" />
              </Button>
            </Link>
          )}

          <Link href="/cart" aria-label={t("nav.bagAria")} {...prefetchProps(loadCart, loadCheckout)}>
            <Button variant="ghost" size="icon" className="relative" aria-label={t("nav.bagAria")} data-testid="button-cart">
              <ShoppingCart className="!w-[22px] !h-[22px]" />
              <AnimatePresence>
                {itemCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
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
