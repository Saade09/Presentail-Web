import { ChevronLeft, ChevronRight, LockKeyhole } from "lucide-react";
import { useLocation } from "wouter";
import { Logo } from "@/components/Logo";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection, countryCodeToSlug } from "@/contexts/LocationContext";
import {
  buildLocalePath,
  cityIdToSlug,
  isSupportedCountrySlug,
  parseLocalePath,
  type CountrySlug,
  type Lang,
} from "@/lib/locale-route";

export const CART_RETURN_HISTORY_KEY = "presentail_cart_return_history_v1";

const SHOPPING_REST_RE =
  /^\/(?:shop|product(?:\/|$)|category(?:\/|$)|occasion(?:\/|$)|brand(?:\/|$)|brands(?:\/|$)|occasions(?:\/|$))/;

/**
 * A cart entry is useful when the browser can take the shopper back to a
 * same-site storefront route. The referrer check prevents a direct cart URL
 * opened from an external site from taking the shopper out of Presentail.
 */
export function hasUsefulCartHistory(
  referrer: string,
  currentUrl: string,
  historyLength: number,
): boolean {
  if (historyLength <= 1 || !referrer) return false;

  try {
    const current = new URL(currentUrl);
    const previous = new URL(referrer, current);
    if (previous.origin !== current.origin) return false;

    const parsed = parseLocalePath(previous.pathname);
    if (!parsed.hasLocalePrefix || !parsed.lang || !parsed.country) {
      return SHOPPING_REST_RE.test(previous.pathname);
    }

    // The locale/city landing page is the storefront home and is a valid
    // shopping destination even though it has no rest segment.
    return parsed.rest === "" || SHOPPING_REST_RE.test(parsed.rest);
  } catch {
    return false;
  }
}

export function cartShopFallbackPath({
  language,
  countryCode,
  cityId,
}: {
  language: Lang;
  countryCode: string | null;
  cityId: string | null;
}): string {
  const countrySlug = countryCode ? countryCodeToSlug(countryCode) : null;
  if (
    !countrySlug ||
    !isSupportedCountrySlug(countrySlug) ||
    !cityId
  ) {
    return "/shop";
  }

  return `${buildLocalePath({
    lang: language,
    country: countrySlug as CountrySlug,
    city: cityIdToSlug(cityId),
  })}/shop`;
}

export function CompactMobileCartHeader() {
  const [, setLocation] = useLocation();
  const { t, dir, language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();

  const handleBack = () => {
    let hasSpaShoppingHistory = false;
    try {
      hasSpaShoppingHistory =
        sessionStorage.getItem(CART_RETURN_HISTORY_KEY) === "1";
    } catch {
      // sessionStorage unavailable (e.g. private mode with storage blocked)
    }

    if (
      typeof window !== "undefined" &&
      window.history.length > 1 &&
      (hasSpaShoppingHistory ||
        hasUsefulCartHistory(
          document.referrer,
          window.location.href,
          window.history.length,
        ))
    ) {
      window.history.back();
      return;
    }

    // Prefix with "~" so Wouter treats this as root-absolute rather than
    // relative to the active city-scoped nested router base.
    setLocation("~" + cartShopFallbackPath({ language, countryCode, cityId }));
  };

  const BackIcon = dir === "rtl" ? ChevronRight : ChevronLeft;

  return (
    <header
      aria-label={t("cart.compactHeaderAria")}
      className="border-b border-border/70 bg-white pt-[env(safe-area-inset-top)]"
      data-testid="compact-mobile-cart-header"
      dir={dir}
    >
      <div className="relative flex h-16 items-center justify-between px-2">
        <button
          type="button"
          onClick={handleBack}
          aria-label={t("nav.backAria")}
          className="absolute start-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="compact-mobile-cart-back"
        >
          <BackIcon className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="pointer-events-none absolute inset-x-0 flex justify-center">
          <Logo height={60} className="max-w-[13rem] object-contain" />
        </div>

        <div
          className="absolute end-2 top-1/2 flex min-h-11 -translate-y-1/2 items-center gap-1.5 rounded-full px-1.5 text-foreground/75"
          data-testid="compact-mobile-cart-secure"
        >
          <LockKeyhole className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
          <span className="text-xs font-medium leading-none">{t("cart.secure")}</span>
        </div>
      </div>
    </header>
  );
}