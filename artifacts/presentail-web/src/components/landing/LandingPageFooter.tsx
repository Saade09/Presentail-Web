import { Link, useLocation } from "wouter";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { PaymentMethods } from "@/components/product/PaymentMethods";
import {
  buildLocalePath,
  cityIdToSlug,
  countryCodeToSlug,
  isSupportedCountrySlug,
  type Lang,
} from "@/lib/locale-route";

function InLink({
  href,
  children,
  testId,
}: {
  href: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <Link
      href={href}
      className="text-sm text-white/75 hover:text-white transition-colors"
      data-testid={testId}
    >
      {children}
    </Link>
  );
}

/**
 * Stripped footer for paid-search landing pages.
 *
 * Keeps: contact us, FAQs, terms, privacy, copyright notice, payment methods.
 * Removes: Popular Categories column, Get to Know Us column, social media
 *          icons row, currency switcher, language switcher, city picker.
 *
 * Same colours and typography as the global Footer (bg-primary, text-white).
 * The global Footer is untouched — this component is only mounted by
 * ShopShell when the current route is /flower-delivery.
 */
export function LandingPageFooter() {
  const { t, language } = useLocale();
  const { cityId, countryCode } = useLocationSelection();
  const { currencyCode } = useDisplayCurrency();
  const [currentPath] = useLocation();
  const isOnContactPage =
    currentPath === "/contact" || currentPath.endsWith("/contact");
  const isCY = countryCode?.toUpperCase() === "CY";

  // Build city-scoped href — mirrors the same helper in Footer
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
    return path === "/" ? `~${base}` : `~${base}${path}`;
  };

  const year = new Date().getFullYear();

  return (
    <footer
      className="bg-primary text-white"
      data-testid="footer-landing"
      lang={language}
    >
      <div className="border-t border-white/15">
        <div className="container mx-auto max-w-content px-4 py-6 flex flex-col md:grid md:grid-cols-3 md:items-center gap-4 md:gap-6">

          {/* Copyright + address */}
          <div className="text-xs text-white/70 leading-relaxed">
            <p data-testid="footer-copyright">
              {t(
                isCY
                  ? "footer.allRightsReservedCyprus"
                  : cityId === "ae-abu-dhabi"
                    ? "footer.allRightsReservedAbuDhabi"
                    : cityId?.startsWith("ae-")
                      ? "footer.allRightsReservedDubai"
                      : "footer.allRightsReserved",
                { year },
              )}
            </p>
            {isCY && (
              <p data-testid="footer-owned-operated">
                {t("footer.ownedOperatedCyprus")}
              </p>
            )}
            {isCY || cityId?.startsWith("ae-") ? (
              <p data-testid="footer-address">
                {t(
                  isCY
                    ? "footer.addressCyprus"
                    : cityId === "ae-abu-dhabi"
                      ? "footer.addressAbuDhabi"
                      : "footer.addressDubai",
                )}
              </p>
            ) : (
              <a
                data-testid="footer-address"
                href={t("footer.addressUrl")}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {t("footer.address")}
              </a>
            )}
          </div>

          {/* Legal links + help — centered */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-center">
            {isOnContactPage ? (
              <button
                type="button"
                data-testid="footer-link-contact"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="text-sm text-white/75 hover:text-white transition-colors"
              >
                {t("footer.contactUs")}
              </button>
            ) : (
              <InLink href={toCityHref("/contact")} testId="footer-link-contact">
                {t("footer.contactUs")}
              </InLink>
            )}
            <span className="text-white/30" aria-hidden>|</span>
            <InLink href={toCityHref("/faqs")} testId="footer-link-faqs">
              {t("footer.faqs")}
            </InLink>
            <span className="text-white/30" aria-hidden>|</span>
            <InLink href={toCityHref("/terms")} testId="footer-link-terms">
              {t("footer.terms")}
            </InLink>
            <span className="text-white/30" aria-hidden>|</span>
            <InLink href={toCityHref("/privacy")} testId="footer-link-privacy">
              {t("footer.privacy")}
            </InLink>
          </div>

          {/* Payment methods — trust signal on a checkout-bound page */}
          <div className="flex justify-center">
            <PaymentMethods
              label={null}
              countryCode={countryCode}
              currencyCode={currencyCode}
              compact
            />
          </div>
        </div>
      </div>
    </footer>
  );
}
