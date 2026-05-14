import { Link } from "wouter";
import { Facebook, Instagram, Linkedin, ChevronDown, MapPin } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { currencyForStoreCountry } from "@/lib/currency";
import paypalLogo from "@/assets/payment-logos/paypal.svg";
import amexLogo from "@/assets/payment-logos/amex.svg";
import gpayLogo from "@/assets/payment-logos/googlepay.svg";
import applepayLogo from "@/assets/payment-logos/applepay.svg";
import visaLogo from "@/assets/payment-logos/visa.svg";
import mastercardLogo from "@/assets/payment-logos/mastercard.svg";

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

const PAYMENT_LOGOS: { src: string; alt: string }[] = [
  { src: paypalLogo, alt: "PayPal" },
  { src: amexLogo, alt: "American Express" },
  { src: gpayLogo, alt: "Google Pay" },
  { src: applepayLogo, alt: "Apple Pay" },
  { src: visaLogo, alt: "Visa" },
  { src: mastercardLogo, alt: "Mastercard" },
];

type ColumnHeadingProps = { children: React.ReactNode };
function ColumnHeading({ children }: ColumnHeadingProps) {
  return (
    <h3 className="font-serif text-base text-white mb-4">{children}</h3>
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
  const { t, language, countryName } = useLocale();
  const { country, countryCode, openPicker } = useLocationSelection();
  const isAE = countryCode?.toUpperCase() === "AE";
  const currencyCode = currencyForStoreCountry(countryCode);
  const year = new Date().getFullYear();
  const countryLabel = country
    ? countryName(country.code, country.name)
    : t("footer.selectCountry");
  const flag = country?.flag ?? "🌍";

  const popularCategories: { label: string; href: string; external?: boolean; testId: string }[] = [
    { label: t("footer.popular.flowers"), href: "/shop?category=hand-bouquets", testId: "footer-link-flowers" },
    { label: t("footer.popular.plants"), href: "/shop?category=plants", testId: "footer-link-plants" },
    { label: t("footer.popular.giftBundles"), href: "/shop?category=bundles", testId: "footer-link-bundles" },
    { label: t("footer.popular.cakesSweets"), href: "/shop?category=cakes", testId: "footer-link-cakes" },
    { label: t("footer.popular.baskets"), href: "/shop?category=baskets", testId: "footer-link-baskets" },
    { label: t("footer.popular.bearsBalloons"), href: "/shop?category=bears-balloons", testId: "footer-link-bears" },
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
    href: "/shop?occasion=birthday",
    testId: "footer-link-occasions",
  });

  // "Get to Know Us" — all in-app routes.
  const knowUs: { label: string; href: string; testId: string; external?: boolean }[] = [
    { label: t("footer.know.about"), href: "/about", testId: "footer-link-about" },
    { label: t("footer.know.partner"), href: "/partner", testId: "footer-link-partner" },
    { label: t("footer.know.deliveryRates"), href: "/delivery-rates", testId: "footer-link-delivery" },
    { label: t("footer.know.investor"), href: "/investor", testId: "footer-link-investor" },
    { label: t("footer.know.weddings"), href: "/weddings", testId: "footer-link-weddings" },
    { label: t("footer.know.corporate"), href: "/corporate", testId: "footer-link-corporate" },
    { label: t("footer.know.careers"), href: "/careers", testId: "footer-link-careers" },
    { label: t("footer.know.blogs"), href: "/blog", testId: "footer-link-blogs" },
  ];

  return (
    <footer
      className="bg-primary text-white mt-16"
      data-testid="footer"
      lang={language}
    >
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="grid gap-10 md:gap-8 md:grid-cols-12">
          {/* Brand + social + contact */}
          <div className="md:col-span-3">
            <div className="mb-6">
              <Logo inverse className="h-20 md:h-24 w-auto max-w-full" />
            </div>

            <ColumnHeading>{t("footer.socialMedia")}</ColumnHeading>
            <div className="flex items-center gap-4 mb-6">
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

            <ColumnHeading>{t("footer.getInTouch")}</ColumnHeading>
            <ul className="space-y-2">
              <li>
                <InLink href="/contact" testId="footer-link-contact">
                  {t("footer.contactUs")}
                </InLink>
              </li>
              <li>
                <InLink href="/faqs" testId="footer-link-faqs">
                  {t("footer.faqs")}
                </InLink>
              </li>
            </ul>
          </div>

          {/* Popular Categories */}
          <div className="md:col-span-3">
            <ColumnHeading>{t("footer.popularCategories")}</ColumnHeading>
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
          </div>

          {/* Get to Know Us */}
          <div className="md:col-span-3">
            <ColumnHeading>{t("footer.getToKnowUs")}</ColumnHeading>
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
          </div>

          {/* Currency / Language / Country */}
          <div className="md:col-span-3 space-y-6">
            <div>
              <ColumnHeading>{t("footer.currencySwitcher")}</ColumnHeading>
              <button
                type="button"
                onClick={openPicker}
                aria-label={t("footer.openCurrency")}
                data-testid="footer-currency-trigger"
                className="inline-flex items-center gap-2 bg-white text-primary px-3 py-2 rounded-md text-sm font-medium hover:bg-white/90 transition-colors"
              >
                <span className="text-base leading-none">{flag}</span>
                <span>{currencyCode}</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>
            </div>

            <div>
              <ColumnHeading>{t("footer.language")}</ColumnHeading>
              {/* LanguageSwitcher relies on `text-foreground` / dropdown menu styling.
                  Wrap it in an inverted pill so it stays legible on the dark footer. */}
              <div className="inline-flex items-center bg-white text-primary px-3 py-2 rounded-md text-sm">
                <LanguageSwitcher />
              </div>
            </div>

            <div>
              <ColumnHeading>{t("footer.country")}</ColumnHeading>
              <button
                type="button"
                onClick={openPicker}
                aria-label={t("footer.openCountry")}
                data-testid="footer-country-trigger"
                className="inline-flex items-center gap-2 bg-white text-primary px-3 py-2 rounded-md text-sm font-medium hover:bg-white/90 transition-colors"
              >
                <span className="text-base leading-none">{flag}</span>
                <span>{countryLabel}</span>
                <MapPin className="w-3.5 h-3.5 opacity-70" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/15">
        <div className="container mx-auto px-4 py-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
          {/* Copyright + address */}
          <div className="text-xs text-white/70 leading-relaxed md:flex-1">
            <p data-testid="footer-copyright">
              {t("footer.allRightsReserved", { year })}
            </p>
            <p data-testid="footer-address">{t("footer.address")}</p>
          </div>

          {/* Legal links */}
          <div className="flex items-center gap-4 text-xs">
            <InLink href="/terms" testId="footer-link-terms">
              {t("footer.terms")}
            </InLink>
            <span className="text-white/30" aria-hidden>|</span>
            <InLink href="/privacy" testId="footer-link-privacy">
              {t("footer.privacy")}
            </InLink>
          </div>

          {/* Payment logos — single white pill, matches product page strip */}
          <div className="flex h-9 items-center justify-center gap-3 rounded-xl bg-white px-3 md:ms-auto">
            {PAYMENT_LOGOS.map((logo) => (
              <img
                key={logo.alt}
                src={logo.src}
                alt={logo.alt}
                title={logo.alt}
                className="block h-4 w-auto max-w-[40px] object-contain"
                loading="lazy"
                draggable={false}
              />
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
