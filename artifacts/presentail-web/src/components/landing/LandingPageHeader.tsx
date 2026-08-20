import { useState } from "react";
import { Link, useRoute } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Search, ShoppingCart, User } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { LazySearchOverlay } from "@/components/search/LazySearchOverlay";
import { AccountDropdown } from "@/components/account/AccountDropdown";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import {
  buildLocalePath,
  cityIdToSlug,
  countryCodeToSlug,
  isSupportedCountrySlug,
  type Lang,
} from "@/lib/locale-route";
import { isTargetCampaignCity } from "@/lib/campaignLanding";
import { prefetchProps } from "@/lib/prefetch";
import {
  loadCart,
  loadCheckout,
  loadSignIn,
  loadSignUp,
  loadAccount,
  loadFavorites,
} from "@/lib/pageLoaders";

/**
 * Stripped navigation header for paid-search landing pages.
 *
 * Keeps: logo (links to city home), search icon, account icon, cart icon.
 * Removes: three mega-menu dropdowns (Occasions, Gifts, Flowers & Plants),
 *          mobile hamburger / slide-out sheet, TopUtilityBar.
 *
 * The global HomepageHeader is untouched — this component is only mounted
 * by ShopShell on the /flower-delivery paid-search landing route.
 */
export function LandingPageHeader() {
  const { t, language } = useLocale();
  const { cityId, countryCode } = useLocationSelection();
  const isCompactCampaignHeader = isTargetCampaignCity(cityId);
  const { user } = useAuth();
  const { itemCount } = useCart();
  const [searchOpen, setSearchOpen] = useState(false);
  const [hasOpenedSearch, setHasOpenedSearch] = useState(false);
  // Matches the in-shell route (city-relative), same as MainNavbar
  const [isSignInRoute] = useRoute("/sign-in/:rest*");

  // Build city-scoped href — mirrors the same helper in MainNavbar
  const _countrySlug = countryCode ? countryCodeToSlug(countryCode) : null;
  const toCityHref = (path: string): string => {
    if (!_countrySlug || !isSupportedCountrySlug(_countrySlug) || !cityId) {
      return path;
    }
    const base = buildLocalePath({
      lang: language as Lang,
      country: _countrySlug,
      city: cityIdToSlug(cityId),
    });
    // City root must be slashless (server 301s the trailing-slash variant).
    return path === "/" ? `~${base}` : `~${base}${path}`;
  };

  const openSearch = () => {
    setSearchOpen(true);
    setHasOpenedSearch(true);
  };

  return (
    <div className="bg-white sticky top-0 z-[60] border-b border-gray-200">
      <div
        className={`container mx-auto grid max-w-content grid-cols-3 items-center gap-4 px-page ${
          isCompactCampaignHeader ? "h-[62px] md:h-[70px]" : "h-[var(--header-h)]"
        }`}
      >

        {/* ── Left: search button on mobile (replaces hamburger slot) ── */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={t("nav.searchAria")}
            data-testid="button-search-mobile"
            onClick={openSearch}
          >
            <Search className="!w-[22px] !h-[22px]" />
          </Button>
        </div>

        {/* ── Center: logo ─────────────────────────────────────────── */}
        <div className="flex justify-center">
          <Link
            href={toCityHref("/")}
            className="flex items-center"
            aria-label={t("nav.logoAria")}
            data-testid="link-logo"
          >
            <Logo height={isCompactCampaignHeader ? 64 : 88} />
          </Link>
        </div>

        {/* ── Right: search (desktop) + account + cart ─────────────── */}
        <div className="flex items-center justify-end gap-1">
          {/* Desktop search */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            aria-label={t("nav.searchAria")}
            data-testid="button-search"
            onClick={openSearch}
          >
            <Search className="!w-[22px] !h-[22px]" />
          </Button>

          {/* Lazy-mounted search overlay — only after first open */}
          {hasOpenedSearch && (
            <LazySearchOverlay
              open={searchOpen}
              onClose={() => setSearchOpen(false)}
            />
          )}

          {/* Account — same three-state logic as MainNavbar */}
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
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("nav.accountAria")}
                data-testid="button-account"
              >
                <User className="!w-[22px] !h-[22px]" />
              </Button>
            </Link>
          ) : (
            // Dim the account icon when already on the sign-in page
            <span className="opacity-30" inert={true}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("nav.accountAria")}
                data-testid="button-account"
              >
                <User className="!w-[22px] !h-[22px]" />
              </Button>
            </span>
          )}

          {/* Cart with animated badge */}
          <Link
            href={toCityHref("/cart")}
            aria-label={t("nav.bagAria")}
            {...prefetchProps(loadCart, loadCheckout)}
          >
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={t("nav.bagAria")}
              data-testid="button-cart"
            >
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
    </div>
  );
}
