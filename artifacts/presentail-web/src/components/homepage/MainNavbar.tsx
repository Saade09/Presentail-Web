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
import {
  buildLocalePath,
  cityIdToSlug,
  countryCodeToSlug,
  isSupportedCountrySlug,
  type Lang,
} from "@/lib/locale-route";
import { LazySearchOverlay } from "@/components/search/LazySearchOverlay";
import { useBrands, useCatalogMetadata, useCatalogOccasions } from "@/lib/queries";
import { CATEGORY_SLUG_REMAP, CATEGORY_NAV_BLOCKLIST } from "@/lib/categoryGroups";
import { OCCASION_OPTIONS } from "@/data/occasions";
import { prefetchProps } from "@/lib/prefetch";
import {
  loadCart,
  loadCheckout,
  loadSignIn,
  loadSignUp,
  loadAccount,
  loadFavorites,
  loadShop,
} from "@/lib/pageLoaders";
import { AccountDropdown } from "@/components/account/AccountDropdown";
import { CATEGORY_GROUPS, CATEGORY_STATIC_IMAGES, OCCASION_STATIC_IMAGES } from "@/lib/categoryGroups";

const LABEL_EXPLORE_PRESENTAIL = "Explore Presentail"; // i18n-ignore

function MegaItemThumbnail({ img, emoji, className }: { img?: string; emoji?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (img && !failed) {
    return (
      <img
        src={img}
        alt="" // image-alt-ok: decorative emoji/icon fallback image, meaning conveyed by emoji sibling
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
      // Warm light-gray card with the product image centered at ~70% of the tile.
      <div className="w-full h-full flex items-center justify-center bg-[#f7f5f2]">
        <img
          src={img}
          alt="" // image-alt-ok: decorative emoji/icon fallback image, meaning conveyed by emoji sibling
          className="w-[70%] h-[70%] object-contain"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </div>
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
    footer: { label: "Shop all Gifts", labelKey: "nav.viewAllGifts", href: "/shop" },
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
      { label: "Hand-Tied Bouquets", href: "/category/hand-bouquets",       img: "/catalog/categories/hand-bouquets.webp" },
      { label: "Luxury Arrangements", href: "/category/lux-arrangements",   img: "/catalog/categories/lux-arrangements.avif" },
      { label: "Artificial Flowers", href: "/category/artificial-flowers",  emoji: "🌺" },
    ],
    footer: { label: "Shop all Flowers & Plants", labelKey: "nav.viewAllFlowers", href: "/category/flowers" },
  },
];

function MegaMenuPanel({
  def,
  onClose,
  onMouseEnter,
  onMouseLeave,
  toHref,
}: {
  def: MegaMenuDef;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** Converts a root-relative path to a wouter-absolute href that bypasses any
   *  nested router base, so links work correctly from non-city shells (e.g. blog). */
  toHref: (path: string) => string;
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
      className="absolute top-full left-0 right-0 z-[70] bg-gray-100 border-t border-border shadow-2xl"
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
                  href={toHref(item.href)}
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
              href={toHref(def.footer.href)}
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

  // Build the city-scoped base path (e.g. "/en-lb/beirut") so that nav links
  // work correctly from any shell, including the /en/blog shell whose wouter
  // base is "/{lang}" rather than "/{lang}-{country}/{city}".
  // Wouter's "~" prefix makes a Link href absolute (bypasses the nested base).
  const _countrySlug = countryCode ? countryCodeToSlug(countryCode) : null;
  const cityBase =
    _countrySlug && isSupportedCountrySlug(_countrySlug) && cityId
      ? buildLocalePath({
          lang: language as Lang,
          country: _countrySlug,
          city: cityIdToSlug(cityId),
        })
      : null;
  const toCityHref = (path: string): string =>
    // Without a city context (e.g. the blog shell, whose nested router base is
    // `/${lang}`), a relative path would resolve under that base — `/fr/` has
    // no route and 404s. Escape to an absolute URL so "/" is the real root.
    // For the city root ("/"), emit the slashless canonical form
    // (`/fr-lb/beirut`, not `/fr-lb/beirut/`) — the server 301s the
    // trailing-slash variant, so a slash-terminated href wastes a redirect
    // on every internal navigation and crawl.
    cityBase ? (path === "/" ? `~${cityBase}` : `~${cityBase}${path}`) : `~${path}`;

  const [searchOpen, setSearchOpen] = useState(false);
  // Gate mounting until first open so the cmdk chunk is never fetched on
  // initial page load — it only loads when the user first clicks search.
  const [hasOpenedSearch, setHasOpenedSearch] = useState(false);
  const [isSignInRoute] = useRoute("/sign-in");
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

  const { data: occasionsData, isPending: occasionsLoading } = useCatalogOccasions(countryCode, cityId, language);
  const osOccasions = occasionsData?.occasions ?? [];
  // Hide occasions with no in-stock products so shoppers never land on an empty page.
  // Only fall back to the static OCCASION_OPTIONS list when the API has not returned
  // any data yet (cache cold / loading). Once the API resolves, render only the
  // occasions with count > 0 — even if that list is empty — so stale or zero-product
  // occasions are never shown.
  // Use API resolution state (not array length) to decide whether to fall back.
  // An empty resolved response ([]) should show nothing, not the static list.
  const hasOccasionApiData = occasionsData !== undefined;
  // Mega menu shows only featured occasions with in-stock products.
  // The All Occasions page shows all active occasions (featured or not).
  const visibleOsOccasions = osOccasions.filter((o) => (o.count ?? 0) > 0 && o.featured === true);
  const occasionItems: MegaItem[] =
    hasOccasionApiData
      ? visibleOsOccasions.map((o) => {
          // Prefer the OS-proxied image, then a local static asset, then the emoji fallback.
          const img = o.image ?? OCCASION_STATIC_IMAGES[o.slug];
          return {
            label: o.name,
            href: `/occasion/${o.slug}`,
            ...(img ? { img } : { emoji: "🎉" }),
          };
        })
      : OCCASION_OPTIONS.map((o) => ({
          label: o.label,
          href: `/occasion/${o.value}`,
          ...("img" in o ? { img: o.img } : { emoji: o.emoji }),
        }));
  const occasionsMenuDef: MegaMenuDef = {
    key: "occasions",
    labelKey: "nav.occasions",
    items: occasionItems,
    footer: { label: t("nav.viewAllOccasions"), labelKey: "nav.viewAllOccasions", href: "/occasions" },
    loading: occasionsLoading,
  };
  // Filter mega-menu category items to only those present in the OS categories
  // list so stale or unavailable categories don't appear in the nav.
  // When useCatalogMetadata hasn't resolved yet (cold cache / loading), fall
  // back to the unfiltered static list so the menu is never blank.
  // New OS categories not covered by STATIC_MENUS are appended automatically
  // to the appropriate group ("flowers" | "gifts") via CATEGORY_GROUPS.
  // Categories with zero in-stock products are excluded so shoppers never
  // land on an empty page.
  const { data: catalogMetadata } = useCatalogMetadata(countryCode, language);
  const osCategorySlugs = catalogMetadata
    ? new Set(catalogMetadata.categories.filter((c) => c.count > 0).map((c) => c.id))
    : null;

  // Slugs already in STATIC_MENUS (pre-filter) — used to detect net-new OS categories.
  const staticMenuSlugs = new Set(
    STATIC_MENUS.flatMap((m) =>
      m.items.map((item) => item.href.split("/category/")[1] ?? ""),
    ),
  );

  // Inverse of CATEGORY_SLUG_REMAP: maps product-level slug → catalog-level slug.
  // Used to check whether a static menu item's remap source has products.
  // e.g. { "gift-baskets": "baskets", "summer": "summer-collection" }
  const remapTargetToSource = Object.fromEntries(
    Object.entries(CATEGORY_SLUG_REMAP).map(([src, tgt]) => [tgt, src]),
  );

  // Localized category names from /catalog/metadata (server-side AI translation
  // for ar/fr/el), keyed by catalog slug. Static menu items carry hardcoded
  // English labels; for non-English languages, swap in the translated OS name.
  const categoryNameBySlug = new Map<string, string>(
    (catalogMetadata?.categories ?? []).map((c) => [c.id, c.name]),
  );
  const localizedStaticLabel = (item: MegaItem): MegaItem => {
    if (language === "en" || item.labelKey) return item;
    const slug = item.href.split("/category/")[1] ?? "";
    if (!slug) return item;
    const name =
      categoryNameBySlug.get(slug) ??
      (remapTargetToSource[slug] ? categoryNameBySlug.get(remapTargetToSource[slug]!) : undefined);
    return name ? { ...item, label: name } : item;
  };

  const filteredStaticMenus: MegaMenuDef[] = STATIC_MENUS.map((menu) => {
    const filteredItems = osCategorySlugs
      ? menu.items.filter((item) => {
          const slug = item.href.split("/category/")[1] ?? "";
          if (!slug) return true;
          // Direct match: slug exists in OS catalog with products.
          if (osCategorySlugs.has(slug)) return true;
          // Remap: static item uses a product-level alias (e.g. gift-baskets).
          // Only allow it when the source catalog slug (e.g. baskets) has products.
          const sourceSlug = remapTargetToSource[slug];
          return sourceSlug !== undefined && osCategorySlugs.has(sourceSlug);
        })
      : menu.items;

    // Append OS-only categories for this group that aren't in STATIC_MENUS at all.
    const newItems: MegaItem[] = catalogMetadata
      ? catalogMetadata.categories
          .filter(
            (c) =>
              c.count > 0 &&
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

    const resolvedItems = [...filteredItems.map(localizedStaticLabel), ...newItems].map((item) =>
      item.labelKey ? { ...item, label: t(item.labelKey) } : item,
    );
    return { ...menu, items: resolvedItems, footer: resolvedFooter };
  });

  // Mobile-only: brands sub-panel definition (desktop uses a plain link in the right nav)
  const brandsMegaMenuDef: MegaMenuDef = {
    key: "brands",
    labelKey: "nav.brands",
    items: [...(catalogMetadata?.brands ?? [])]
      // Only surface brands that actually have products in the current country.
      // Brands with count=0 (e.g. rifai, samsung, superheated-neurons) exist in
      // the OS catalog but have no associated products; linking to /brand/<slug>
      // for those returns 404, which Semrush correctly flags.
      .filter((b) => b.count > 0)
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

  // Desktop mega-menu triggers (excludes brands — desktop uses a plain link in the right nav)
  const megaMenus: MegaMenuDef[] = [occasionsMenuDef, ...filteredStaticMenus];
  // Mobile sub-panel lookup includes brands so the mobile sheet can drill into it
  const mobileMenuDefs: MegaMenuDef[] = [...megaMenus, brandsMegaMenuDef];

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
      <div className="container mx-auto max-w-content px-page h-[var(--header-h)] grid grid-cols-[auto_1fr_auto] md:grid-cols-3 items-center gap-4">

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
                  const subDef = mobileMenuDefs.find((m) => m.key === mobileSubPanel);
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
                          <div className="grid grid-cols-3 gap-3">
                            {Array.from({ length: 12 }).map((_, i) => (
                              <div key={i} className="flex flex-col items-center gap-2">
                                <div className="w-full aspect-square rounded-2xl bg-gray-100 animate-pulse" />
                                <div className="h-3 w-16 rounded bg-gray-100 animate-pulse" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-3">
                            {(subDef?.items ?? []).map((item) => (
                              <SheetClose asChild key={item.label + item.href}>
                                <Link href={toCityHref(item.href)} className="flex flex-col items-center gap-1.5 group min-h-[44px]">
                                  <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
                                    <MobileSubPanelTile img={item.img} emoji={item.emoji} />
                                  </div>
                                  {/* Fixed 2-line label box keeps every row's tiles aligned; wraps up to 2 lines, no ellipsis. */}
                                  <span className="text-[12px] font-medium text-center text-gray-700 leading-4 h-8 px-0.5 break-words">
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
                              href={toCityHref(subDef.footer.href)}
                              className="flex items-center justify-center gap-2 mt-6 w-full py-3.5 rounded-2xl bg-[#f7f5f0] border border-[#d9e8d4] text-primary text-sm font-semibold active:bg-[#eef5ec] transition-colors"
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
            onClick={() => { setSearchOpen(true); setHasOpenedSearch(true); }}
          >
            <Search className="!w-[22px] !h-[22px]" />
          </Button>

          {/* Desktop nav triggers (left of logo) */}
          <nav className="hidden md:flex items-center gap-6" aria-label={t("nav.mainNavAria")}>
            {megaMenus.map((menu) => (
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
          <Link href={toCityHref("/")} className="flex items-center" aria-label={t("nav.logoAria")} data-testid="link-logo">
            <Logo height={88} />
          </Link>
        </div>

        {/* ── Right: search + Brands link (desktop) + account ─ */}
        <div className="flex items-center justify-end gap-1 md:gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            aria-label={t("nav.searchAria")}
            data-testid="button-search"
            onClick={() => { setSearchOpen(true); setHasOpenedSearch(true); }}
          >
            <Search className="!w-[22px] !h-[22px]" />
          </Button>
          {hasOpenedSearch && (
            <LazySearchOverlay
              open={searchOpen}
              onClose={() => setSearchOpen(false)}
              brandSlug={activeBrandSlug ?? undefined}
              brandName={activeBrand?.name ?? undefined}
            />
          )}

          {user ? (
            <span {...prefetchProps(loadAccount, loadFavorites)}>
              <AccountDropdown />
            </span>
          ) : !isSignInRoute ? (
            <Link
              href={toCityHref("/sign-in")}
              aria-label={t("nav.accountAria")}
              {...prefetchProps(loadSignIn, loadSignUp)}
            >
              <Button variant="ghost" size="icon" aria-label={t("nav.accountAria")} data-testid="button-account">
                <User className="!w-[22px] !h-[22px]" />
              </Button>
            </Link>
          ) : (
            <span className="opacity-30" inert={true}>
              <Button variant="ghost" size="icon" aria-label={t("nav.accountAria")} data-testid="button-account">
                <User className="!w-[22px] !h-[22px]" />
              </Button>
            </span>
          )}

          <Link href={toCityHref("/cart")} aria-label={t("nav.bagAria")} {...prefetchProps(loadCart, loadCheckout)}>
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
            toHref={toCityHref}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
