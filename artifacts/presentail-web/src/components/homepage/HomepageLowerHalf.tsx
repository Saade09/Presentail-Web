import { useState } from "react";
import { Clock3, Gift, Heart, ShieldCheck, ChevronDown } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { cityIdToSlug, countryCodeToSlug, buildLocalePath, type CountrySlug } from "@/lib/locale-route";
import { trackEvent } from "@/lib/analytics";
import { TrustpilotCarousel } from "@/components/homepage/TrustpilotCarousel";
import { TRUSTPILOT_PROFILE_URL } from "@/lib/trustpilot";
import { buildHomepageFaqs } from "@/lib/homepageFaqs.mjs";
import hero from "@/assets/hero.png";

type TaxonomyLinks = {
  categories: Array<{ href: string; label: string }>;
  occasions: Array<{ href: string; label: string }>;
};

type LegacyCityDetails = {
  heading?: string;
  points?: string[];
  faqs?: Array<{ question: string; answer: string }>;
};

function trustpilotLocale(language: string): string {
  if (language === "ar") return "ar-AE";
  if (language === "fr") return "fr-FR";
  return "en-US";
}

export function HomepageLowerHalf({
  cityLabel,
  cityCoverageText,
  taxonomy,
  legacyCityDetails,
  faqItems,
}: {
  cityLabel: string;
  cityCoverageText: string;
  taxonomy?: TaxonomyLinks;
  legacyCityDetails?: LegacyCityDetails;
  faqItems?: Array<{ question: string; answer: string }>;
}) {
  const { t, language, dir } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [trustpilotFailed, setTrustpilotFailed] = useState(false);
  const faqs = faqItems ?? buildHomepageFaqs(cityLabel, language);
  const cityHref = (path: string) => {
    const country = countryCode ? countryCodeToSlug(countryCode) : null;
    const city = cityId ? cityIdToSlug(cityId) : null;
    if (!country || !city) return path;
    const base = buildLocalePath({
      lang: language as "en" | "ar" | "fr",
      country: country as CountrySlug,
      city,
    });
    return path === "/" ? base : `${base}${path}`;
  };

  const benefits = [
    { icon: Clock3, title: t("home.lower.benefit.sameDay.title"), body: t("home.lower.benefit.sameDay.body") },
    { icon: Heart, title: t("home.lower.benefit.curated.title"), body: t("home.lower.benefit.curated.body") },
    { icon: Gift, title: t("home.lower.benefit.personal.title"), body: t("home.lower.benefit.personal.body") },
    { icon: ShieldCheck, title: t("home.lower.benefit.support.title"), body: t("home.lower.benefit.support.body") },
  ];

  const onReadReviews = () => {
    trackEvent({
      name: "customer_reviews_view_all_click",
      page_path: window.location.pathname,
      selected_country: countryCode ?? "",
      selected_city: cityId ?? "",
      active_language: language,
      link_type: trustpilotFailed ? "fallback" : "external_link",
    });
  };

  const onFaqToggle = (index: number) => {
    const next = openFaq === index ? null : index;
    setOpenFaq(next);
    if (next !== null) {
      trackEvent({ name: "faq_expand", linkSlug: `homepage-${index + 1}` });
    }
  };

  return (
    <div dir={dir} data-testid="homepage-lower-half" className="border-t border-border/40">
      <section
        className="container mx-auto max-w-content px-4 md:px-8 pt-10 pb-6"
        aria-labelledby="homepage-reviews-heading"
        data-testid="homepage-trustpilot-section"
      >
        <div className="flex items-end justify-between gap-4 mb-4">
          <h2 id="homepage-reviews-heading" className="font-serif text-2xl md:text-3xl text-primary">
            {t("home.lower.reviews.heading")}
          </h2>
          <a
            href={TRUSTPILOT_PROFILE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onReadReviews}
            className="shrink-0 min-h-11 inline-flex items-center text-sm text-primary hover:underline underline-offset-4"
            data-testid="homepage-trustpilot-read-all"
          >
            {t("home.lower.reviews.readAll")}
          </a>
        </div>
        <p className="text-xs text-muted-foreground mb-2">{t("home.lower.reviews.attribution")}</p>
        <div dir="ltr" className="rounded-xl overflow-hidden min-h-[240px]">
          {trustpilotFailed ? (
            <div className="min-h-[240px] flex items-center justify-center border border-border/60 rounded-xl bg-muted/20 px-5 text-center">
              <a
                href={TRUSTPILOT_PROFILE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onReadReviews}
                className="min-h-11 inline-flex items-center text-sm font-medium text-primary hover:underline underline-offset-4"
                data-testid="homepage-trustpilot-fallback"
              >
                {t("home.lower.reviews.fallback")}
              </a>
            </div>
          ) : (
            <TrustpilotCarousel
              locale={trustpilotLocale(language)}
              onVisible={() => trackEvent({ name: "trustpilot_carousel_interaction", link_type: "widget" })}
              onFailed={() => setTrustpilotFailed(true)}
            />
          )}
        </div>
      </section>

      <section
        className="container mx-auto max-w-content px-4 md:px-8 py-8 md:py-10"
        aria-labelledby="homepage-benefits-heading"
        data-testid="homepage-benefits-section"
      >
        <h2 id="homepage-benefits-heading" className="font-serif text-2xl md:text-3xl text-primary mb-5">
          {t("home.lower.benefits.heading")}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
          {benefits.map(({ icon: Icon, title, body }) => (
            <article key={title} className="h-full min-h-[156px] rounded-xl border border-border/60 bg-card p-4 md:p-5">
              <Icon aria-hidden="true" className="w-6 h-6 text-primary mb-3" strokeWidth={1.4} />
              <h3 className="text-sm md:text-base font-medium text-foreground leading-snug">{title}</h3>
              <p className="mt-2 text-xs md:text-sm text-muted-foreground leading-relaxed">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="container mx-auto max-w-content px-4 md:px-8 py-8 md:py-10"
        aria-labelledby="homepage-story-heading"
        data-testid="homepage-story-section"
      >
        <div className="grid md:grid-cols-2 gap-6 md:gap-10 items-center rounded-2xl bg-secondary/35 p-4 md:p-6">
          <div className="aspect-[16/10] overflow-hidden rounded-xl bg-muted">
            <img
              src={hero}
              alt={t("home.lower.story.imageAlt")}
              width={1408}
              height={768}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="text-start">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold mb-3">{t("home.lower.story.eyebrow")}</p>
            <h2 id="homepage-story-heading" className="font-serif text-2xl md:text-3xl text-primary mb-3">
              {t("home.lower.story.heading")}
            </h2>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-5">{t("home.lower.story.body")}</p>
            <a
              href={`/${language}/blog`}
              onClick={() => trackEvent({ name: "homepage_story_cta_click", linkSlug: "blog" })}
              className="min-h-11 inline-flex items-center text-sm font-medium text-primary hover:underline underline-offset-4"
              data-testid="homepage-story-cta"
            >
              {t("home.lower.story.cta")}
            </a>
          </div>
        </div>
      </section>

      <section
        className="container mx-auto max-w-content px-4 md:px-8 py-8 md:py-10"
        aria-labelledby="homepage-faq-heading"
        data-testid="homepage-faq-section"
      >
        <h2 id="homepage-faq-heading" className="font-serif text-2xl md:text-3xl text-primary mb-4">
          {t("home.lower.faq.heading")}
        </h2>
        <div className="divide-y divide-border/70 border-y border-border/70">
          {faqs.map((faq, index) => {
            const isOpen = openFaq === index;
            const buttonId = `homepage-faq-trigger-${index}`;
            const panelId = `homepage-faq-panel-${index}`;
            return (
              <div key={faq.question} data-testid="homepage-faq-item">
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => onFaqToggle(index)}
                  className="min-h-14 w-full flex items-center justify-between gap-4 text-start py-4 font-medium text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span>{faq.question}</span>
                  <ChevronDown aria-hidden="true" className={`w-5 h-5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!isOpen} className="pb-4 text-sm text-muted-foreground leading-relaxed">
                  {faq.answer}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {(cityCoverageText || legacyCityDetails || taxonomy) && (
        <section className="container mx-auto max-w-content px-4 md:px-8 pb-10" aria-labelledby="homepage-city-context-heading" data-testid="homepage-seo-preservation">
          <details>
            <summary
              id="homepage-city-context-heading"
              onClick={() => trackEvent({ name: "homepage_city_content_disclosure_open", selected_city: cityId ?? "", selected_country: countryCode ?? "" })}
              className="min-h-11 cursor-pointer inline-flex items-center text-sm font-medium text-primary hover:underline underline-offset-4"
            >
              {t("home.lower.cityContext")}
            </summary>
            <div className="pt-4 text-sm text-muted-foreground leading-relaxed space-y-4">
              {cityCoverageText && <p data-testid="city-coverage-text">{cityCoverageText}</p>}
              {legacyCityDetails?.heading && (
                <div>
                  <h3 className="font-medium text-foreground mb-2">{legacyCityDetails.heading}</h3>
                  <ul className="list-disc ps-5 space-y-1">
                    {legacyCityDetails.points?.map((point) => <li key={point}>{point}</li>)}
                  </ul>
                </div>
              )}
              {legacyCityDetails?.faqs && legacyCityDetails.faqs.length > faqs.length && (
                <div>
                  <h3 className="font-medium text-foreground mb-2">{t("home.lower.localDetails")}</h3>
                  <div className="space-y-3">
                    {legacyCityDetails.faqs.slice(faqs.length).map((faq) => (
                      <p key={faq.question}><strong className="text-foreground">{faq.question}</strong><br />{faq.answer}</p>
                    ))}
                  </div>
                </div>
              )}
              {taxonomy && (taxonomy.categories.length > 0 || taxonomy.occasions.length > 0) && (
                <nav aria-label={t("home.lower.shopLinks")} className="grid sm:grid-cols-2 gap-4 pt-2">
                  {taxonomy.categories.length > 0 && (
                    <div>
                      <h3 className="font-medium text-foreground mb-2">{t("home.lower.categories")}</h3>
                      <ul className="space-y-1">
                        {taxonomy.categories.map((link) => (
                          <li key={link.href}><a href={cityHref(link.href)} className="text-primary hover:underline">{link.label}</a></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {taxonomy.occasions.length > 0 && (
                    <div>
                      <h3 className="font-medium text-foreground mb-2">{t("home.lower.occasions")}</h3>
                      <ul className="space-y-1">
                        {taxonomy.occasions.map((link) => (
                          <li key={link.href}><a href={cityHref(link.href)} className="text-primary hover:underline">{link.label}</a></li>
                        ))}
                      </ul>
                    </div>
                  )}
                </nav>
              )}
            </div>
          </details>
        </section>
      )}
      {(cityCoverageText || legacyCityDetails || taxonomy) && <div data-testid="seo-content-section-wrapper" aria-hidden="true" />}
    </div>
  );
}