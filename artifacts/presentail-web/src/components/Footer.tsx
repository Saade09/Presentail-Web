import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, Facebook, Instagram, Linkedin, MapPin } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { PaymentMethods } from "@/components/product/PaymentMethods";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";

// TikTok ships its own glyph below since lucide-react doesn't export one.
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M16.5 3a5.5 5.5 0 0 0 4.5 4.5v3a8.4 8.4 0 0 1-4.5-1.4v6.65a5.75 5.75 0 1 1-5.75-5.75c.21 0 .42.01.62.04v3.06a2.7 2.7 0 1 0 2.13 2.65V3h3z" />
    </svg>
  );
}

// All previously-legacy footer destinations now live in-app.

const SOCIAL = {
  facebook: "https://www.facebook.com/Presentail",
  instagram: "https://www.instagram.com/presentail/",
  tiktok: "https://www.tiktok.com/@presentail",
  linkedin: "https://www.linkedin.com/company/presentail",
} as const;


type ColumnHeadingProps = { children: React.ReactNode };
function ColumnHeading({ children }: ColumnHeadingProps) {
  return (
    <h2 className="font-serif text-base text-white mb-3">{children}</h2>
  );
}

type CollapsibleSectionProps = { heading: string; children: React.ReactNode };
function CollapsibleSection({ heading, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {/* Mobile toggle button — hidden on md+ */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex items-center justify-between w-full md:hidden mb-2"
      >
        <span className="font-serif text-base text-white">{heading}</span>
        <ChevronDown
          className={`w-4 h-4 text-white/70 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {/* Desktop heading — always visible, hidden on mobile */}
      <h2 className="hidden md:block font-serif text-base text-white mb-3">{heading}</h2>

      {/* Content — collapsed on mobile by default, always open on md+ */}
      <div
        className={`overflow-hidden transition-[max-height] duration-300 ease-in-out md:overflow-visible md:max-h-none ${
          open ? "max-h-[500px]" : "max-h-0"
        }`}
      >
        <div className="mb-3 md:mb-0">{children}</div>
      </div>
    </div>
  );
}

type ExtLinkProps = {
  href: string;
  children: React.ReactNode;
  testId?: string;
  ariaLabel?: string;
  className?: string;
};
function ExtLink({ href, children, testId, ariaLabel, className }: ExtLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      data-testid={testId}
      className={
        className ??
        "text-sm text-white/75 hover:text-white transition-colors"
      }
    >
      {children}
    </a>
  );
}

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

export function Footer() {
  const { t, language } = useLocale();
  const { city, cityId, countryCode, openPicker } = useLocationSelection();
  const { currencyCode } = useDisplayCurrency();
  const [currentPath] = useLocation();
  const isOnContactPage = currentPath === "/contact" || currentPath.endsWith("/contact");
  const isAE = countryCode?.toUpperCase() === "AE";
  const isCY = countryCode?.toUpperCase() === "CY";
  const year = new Date().getFullYear();
  const cityLabel = city ? city.name : t("footer.selectCity");


  const popularCategories: { label: string; href: string; external?: boolean; testId: string }[] = [
    { label: t("footer.popular.flowers"), href: "/category/hand-bouquets", testId: "footer-link-flowers" },
    { label: t("footer.popular.plants"), href: "/category/plants", testId: "footer-link-plants" },
    { label: t("footer.popular.giftBundles"), href: "/category/bundles", testId: "footer-link-bundles" },
    { label: t("footer.popular.cakesSweets"), href: "/category/cakes", testId: "footer-link-cakes" },
    { label: t("footer.popular.baskets"), href: "/category/gift-baskets", testId: "footer-link-baskets" },
  ];
  if (!isAE) {
    popularCategories.push({
      label: t("footer.popular.brands"),
      href: "/brands",
      testId: "footer-link-brands",
    });
  }
  popularCategories.push({
    label: t("footer.popular.occasions"),
    href: "/occasions",
    testId: "footer-link-occasions",
  });

  // "Get to Know Us" — all in-app routes.
  const knowUs: { label: string; href: string; testId: string; external?: boolean }[] = [
    { label: t("footer.know.partner"), href: "/partner", testId: "footer-link-partner" },
    { label: t("footer.know.weddings"), href: "/weddings", testId: "footer-link-weddings" },
    { label: t("footer.know.corporate"), href: "/corporate", testId: "footer-link-corporate" },
    { label: t("footer.know.careers"), href: "/careers", testId: "footer-link-careers" },
    { label: t("footer.know.blogs"), href: "/blog", testId: "footer-link-blogs" },
  ];

  return (
    <footer
      className="bg-primary text-white"
      data-testid="footer"
      lang={language}
    >
      <div className="container mx-auto max-w-content px-4 py-8 md:py-10">
        <div className="grid gap-6 md:gap-6 md:grid-cols-12">
          {/* Brand + social + contact */}
          <div className="md:col-span-3">
            <div className="mb-4">
              <Logo inverse className="h-16 md:h-20 w-auto max-w-full" />
            </div>

            <ColumnHeading>{t("footer.socialMedia")}</ColumnHeading>
            <div className="flex items-center gap-4 mb-4">
              <ExtLink
                href={SOCIAL.facebook}
                ariaLabel="Facebook"
                testId="footer-social-facebook"
                className="text-white/80 hover:text-white transition-colors"
              >
                <Facebook className="w-5 h-5" />
              </ExtLink>
              <ExtLink
                href={SOCIAL.instagram}
                ariaLabel="Instagram"
                testId="footer-social-instagram"
                className="text-white/80 hover:text-white transition-colors"
              >
                <Instagram className="w-5 h-5" />
              </ExtLink>
              <ExtLink
                href={SOCIAL.tiktok}
                ariaLabel="TikTok"
                testId="footer-social-tiktok"
                className="text-white/80 hover:text-white transition-colors"
              >
                <TikTokIcon className="w-5 h-5" />
              </ExtLink>
              <ExtLink
                href={SOCIAL.linkedin}
                ariaLabel="LinkedIn"
                testId="footer-social-linkedin"
                className="text-white/80 hover:text-white transition-colors"
              >
                <Linkedin className="w-5 h-5" />
              </ExtLink>
            </div>

            <CollapsibleSection heading={t("footer.getInTouch")}>
              <ul className="space-y-2">
                <li>
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
                    <InLink href="/contact" testId="footer-link-contact">
                      {t("footer.contactUs")}
                    </InLink>
                  )}
                </li>
                <li>
                  <InLink href="/faqs" testId="footer-link-faqs">
                    {t("footer.faqs")}
                  </InLink>
                </li>
              </ul>
            </CollapsibleSection>
          </div>

          {/* Popular Categories */}
          <div className="md:col-span-3">
            <CollapsibleSection heading={t("footer.popularCategories")}>
              <ul className="space-y-2">
                {popularCategories.map((item) => (
                  <li key={item.testId}>
                    {item.external ? (
                      <ExtLink href={item.href} testId={item.testId}>
                        {item.label}
                      </ExtLink>
                    ) : (
                      <InLink href={item.href} testId={item.testId}>
                        {item.label}
                      </InLink>
                    )}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          </div>

          {/* Get to Know Us */}
          <div className="md:col-span-3">
            <CollapsibleSection heading={t("footer.getToKnowUs")}>
              <ul className="space-y-2">
                {knowUs.map((item) => (
                  <li key={item.testId}>
                    {item.external ? (
                      <ExtLink href={item.href} testId={item.testId}>
                        {item.label}
                      </ExtLink>
                    ) : (
                      <InLink href={item.href} testId={item.testId}>
                        {item.label}
                      </InLink>
                    )}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          </div>

          {/* Currency / Language / Country */}
          <div className="md:col-span-3 space-y-4">
            <div>
              <ColumnHeading>{t("footer.currencySwitcher")}</ColumnHeading>
              <CurrencySwitcher />
            </div>

            <div className="flex flex-row gap-6 md:flex-col md:gap-0 md:space-y-4">
              <div>
                <ColumnHeading>{t("footer.language")}</ColumnHeading>
                {/* LanguageSwitcher relies on `text-foreground` / dropdown menu styling.
                    Wrap it in an inverted pill so it stays legible on the dark footer. */}
                <div className="inline-flex items-center bg-white text-primary px-3 py-2 rounded-md text-sm">
                  <LanguageSwitcher />
                </div>
              </div>

              <div>
                <ColumnHeading>{t("footer.city")}</ColumnHeading>
                <button
                  type="button"
                  onClick={() => openPicker()}
                  aria-label={t("footer.openCity")}
                  data-testid="footer-city-trigger"
                  className="inline-flex items-center gap-2 bg-white text-primary px-3 py-2 rounded-md text-sm font-medium hover:bg-white/90 transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5 opacity-70" />
                  <span>{cityLabel}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

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

          {/* Legal links — centered column */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-center">
            <InLink href="/terms" testId="footer-link-terms">
              {t("footer.terms")}
            </InLink>
            <span className="text-white/30" aria-hidden>|</span>
            <InLink href="/privacy" testId="footer-link-privacy">
              {t("footer.privacy")}
            </InLink>
          </div>

          {/* Payment logos — flat logos on a single white rounded card */}
          <div className="flex justify-center">
            <PaymentMethods label={null} countryCode={countryCode} currencyCode={currencyCode} compact />
          </div>
        </div>
      </div>
    </footer>
  );
}
