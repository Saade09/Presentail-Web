import { useState, useEffect, useCallback } from "react";
import { Truck, Clock, Gift, Sparkles, Star, Shield, Heart, Package, Flower2, Award, ShoppingBag, Users, Building2 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { STRINGS, STRINGS_FR } from "@/locales/index";

const FLOWER_CATEGORY_SLUGS = new Set([
  "hand-bouquets",
  "flower-boxes",
  "flower-baskets",
]);

const FOOD_CATEGORY_SLUGS = new Set([
  "cakes",
  "chocolate",
]);

const SEO_LD_ATTR = "data-seo-faq-ld";

function isFlowerCategory(slug: string): boolean {
  return FLOWER_CATEGORY_SLUGS.has(slug);
}

type BenefitDef = {
  icon: React.ElementType;
  titleKey: string;
  bodyKey: string;
};

const FLOWER_BENEFITS: BenefitDef[] = [
  { icon: Truck, titleKey: "seo.content.benefit.flower.1.title", bodyKey: "seo.content.benefit.flower.1.body" },
  { icon: Flower2, titleKey: "seo.content.benefit.flower.2.title", bodyKey: "seo.content.benefit.flower.2.body" },
  { icon: Clock, titleKey: "seo.content.benefit.flower.3.title", bodyKey: "seo.content.benefit.flower.3.body" },
  { icon: Gift, titleKey: "seo.content.benefit.flower.4.title", bodyKey: "seo.content.benefit.flower.4.body" },
];

const GIFT_BENEFITS: BenefitDef[] = [
  { icon: Truck, titleKey: "seo.content.benefit.gift.1.title", bodyKey: "seo.content.benefit.gift.1.body" },
  { icon: Star, titleKey: "seo.content.benefit.gift.2.title", bodyKey: "seo.content.benefit.gift.2.body" },
  { icon: Clock, titleKey: "seo.content.benefit.gift.3.title", bodyKey: "seo.content.benefit.gift.3.body" },
  { icon: Package, titleKey: "seo.content.benefit.gift.4.title", bodyKey: "seo.content.benefit.gift.4.body" },
];

const OCCASION_BENEFITS: BenefitDef[] = [
  { icon: Truck, titleKey: "seo.content.benefit.occ.1.title", bodyKey: "seo.content.benefit.occ.1.body" },
  { icon: Sparkles, titleKey: "seo.content.benefit.occ.2.title", bodyKey: "seo.content.benefit.occ.2.body" },
  { icon: Heart, titleKey: "seo.content.benefit.occ.3.title", bodyKey: "seo.content.benefit.occ.3.body" },
  { icon: Shield, titleKey: "seo.content.benefit.occ.4.title", bodyKey: "seo.content.benefit.occ.4.body" },
];

const BRAND_FLOWER_BENEFITS: BenefitDef[] = [
  { icon: Truck, titleKey: "seo.content.benefit.flower.1.title", bodyKey: "seo.content.benefit.flower.1.body" },
  { icon: Flower2, titleKey: "seo.content.benefit.flower.2.title", bodyKey: "seo.content.benefit.flower.2.body" },
  { icon: Clock, titleKey: "seo.content.benefit.flower.3.title", bodyKey: "seo.content.benefit.flower.3.body" },
  { icon: Gift, titleKey: "seo.content.benefit.flower.4.title", bodyKey: "seo.content.benefit.flower.4.body" },
];

const BRAND_LISTING_BENEFITS: BenefitDef[] = [
  { icon: Award, titleKey: "seo.content.benefit.gift.2.title", bodyKey: "seo.content.benefit.gift.2.body" },
  { icon: Truck, titleKey: "seo.content.benefit.gift.1.title", bodyKey: "seo.content.benefit.gift.1.body" },
  { icon: Clock, titleKey: "seo.content.benefit.gift.3.title", bodyKey: "seo.content.benefit.gift.3.body" },
  { icon: ShoppingBag, titleKey: "seo.content.benefit.gift.4.title", bodyKey: "seo.content.benefit.gift.4.body" },
];

const CORPORATE_BENEFITS: BenefitDef[] = [
  { icon: Building2, titleKey: "seo.content.benefit.gift.2.title", bodyKey: "seo.content.benefit.gift.2.body" },
  { icon: Truck, titleKey: "seo.content.benefit.gift.1.title", bodyKey: "seo.content.benefit.gift.1.body" },
  { icon: Clock, titleKey: "seo.content.benefit.gift.3.title", bodyKey: "seo.content.benefit.gift.3.body" },
  { icon: Users, titleKey: "seo.content.benefit.gift.4.title", bodyKey: "seo.content.benefit.gift.4.body" },
];

const WEDDING_BENEFITS: BenefitDef[] = [
  { icon: Flower2, titleKey: "seo.content.benefit.flower.2.title", bodyKey: "seo.content.benefit.flower.2.body" },
  { icon: Truck, titleKey: "seo.content.benefit.flower.1.title", bodyKey: "seo.content.benefit.flower.1.body" },
  { icon: Clock, titleKey: "seo.content.benefit.flower.3.title", bodyKey: "seo.content.benefit.flower.3.body" },
  { icon: Heart, titleKey: "seo.content.benefit.flower.4.title", bodyKey: "seo.content.benefit.flower.4.body" },
];

const CATEGORY_OCCASION_CHIPS = [
  { slug: "birthday", labelKey: "shop.occ.birthday" },
  { slug: "love-romance", labelKey: "shop.occ.loveRomance" },
  { slug: "congratulations", labelKey: "shop.occ.congratulations" },
  { slug: "thank-you", labelKey: "shop.occ.thankYou" },
  { slug: "anniversary", labelKey: "seo.content.occ.anniversary" },
];

const OCCASION_CATEGORY_CHIPS = [
  { slug: "hand-bouquets", labelKey: "shop.cat.handBouquets" },
  { slug: "flower-boxes", labelKey: "shop.cat.flowerBoxes" },
  { slug: "cakes", labelKey: "shop.cat.cakes" },
  { slug: "chocolate", labelKey: "shop.cat.chocolate" },
  { slug: "plants", labelKey: "shop.cat.plants" },
];

const BRAND_OCCASION_CHIPS = [
  { slug: "birthday", labelKey: "shop.occ.birthday" },
  { slug: "love-romance", labelKey: "shop.occ.loveRomance" },
  { slug: "congratulations", labelKey: "shop.occ.congratulations" },
  { slug: "thank-you", labelKey: "shop.occ.thankYou" },
  { slug: "anniversary", labelKey: "seo.content.occ.anniversary" },
];

const TOP_OCCASION_CHIPS = [
  { slug: "birthday", labelKey: "shop.occ.birthday" },
  { slug: "love-romance", labelKey: "shop.occ.loveRomance" },
  { slug: "anniversary", labelKey: "seo.content.occ.anniversary" },
  { slug: "congratulations", labelKey: "shop.occ.congratulations" },
  { slug: "thank-you", labelKey: "shop.occ.thankYou" },
];

export type SEOContentOverrides = {
  heading?: string;
  intro_text?: string;
  benefits?: Array<{ title: string; body: string }>;
  internal_links?: Array<{ label: string; href: string }>;
  faqs?: Array<{ question: string; answer: string }>;
  is_active?: boolean;
};

export type BrandCategory = "flowers" | "food" | "general";

interface SEOContentSectionProps {
  pageType:
    | "category"
    | "occasion"
    | "brand"
    | "brand-listing"
    | "homepage"
    | "shop"
    | "corporate"
    | "weddings"
    | "occasions-listing"
    | "contact";
  entityName?: string;
  entitySlug?: string;
  cityLabel: string;
  lang: string;
  countryCode: string;
  overrides?: SEOContentOverrides;
  availableCategoryIds?: string[];
  availableOccasionIds?: string[];
  brandCategory?: BrandCategory;
  suppressFaqJsonLd?: boolean;
}

function format(template: string, params?: Record<string, string>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in params ? params[k] : `{${k}}`));
}

export function SEOContentSection(props: SEOContentSectionProps) {
  if (props.overrides?.is_active === false) return null;
  return <SEOContentSectionInner {...props} />;
}

function SEOContentSectionInner({
  pageType,
  entityName = "",
  entitySlug = "",
  cityLabel,
  lang,
  overrides,
  availableCategoryIds = [],
  availableOccasionIds = [],
  brandCategory = "general",
  suppressFaqJsonLd = false,
}: SEOContentSectionProps) {
  const { t, language, dir } = useLocale();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const tSeo = useCallback(
    (key: string, params?: Record<string, string>): string => {
      const raw = t(key, params);
      if (raw && raw !== key) return raw;
      const entry = STRINGS[key];
      if (!entry) {
        const fr = STRINGS_FR[key];
        if (fr) return format(fr, params);
        return key;
      }
      return format(entry.en ?? key, params);
    },
    [t, language], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const p = { name: entityName, city: cityLabel };

  const headingKey = (() => {
    switch (pageType) {
      case "category": return "seo.content.cat.heading";
      case "occasion": return "seo.content.occ.heading";
      case "brand": return "seo.content.brand.heading";
      case "brand-listing": return "seo.content.brands.heading";
      case "homepage": return "seo.content.homepage.heading";
      case "shop": return "seo.content.shop.heading";
      case "corporate": return "seo.content.corporate.heading";
      case "weddings": return "seo.content.weddings.heading";
      case "occasions-listing": return "seo.content.occasions.heading";
      case "contact": return "seo.content.contact.heading";
    }
  })();
  const heading = overrides?.heading ?? tSeo(headingKey, p);

  let introKey: string;
  if (pageType === "occasion") {
    introKey = "seo.content.occ.intro";
  } else if (pageType === "brand") {
    if (brandCategory === "flowers") {
      introKey = "seo.content.brand.intro.flowers";
    } else if (brandCategory === "food") {
      introKey = "seo.content.brand.intro.food";
    } else {
      introKey = "seo.content.brand.intro.general";
    }
  } else if (pageType === "brand-listing") {
    introKey = "seo.content.brands.intro";
  } else if (pageType === "homepage") {
    introKey = "seo.content.homepage.intro";
  } else if (pageType === "shop") {
    introKey = "seo.content.shop.intro";
  } else if (pageType === "corporate") {
    introKey = "seo.content.corporate.intro";
  } else if (pageType === "weddings") {
    introKey = "seo.content.weddings.intro";
  } else if (pageType === "occasions-listing") {
    introKey = "seo.content.occasions.intro";
  } else if (pageType === "contact") {
    introKey = "seo.content.contact.intro";
  } else if (isFlowerCategory(entitySlug)) {
    introKey = "seo.content.cat.introFlower";
  } else {
    introKey = "seo.content.cat.introNonFlower";
  }
  const intro = overrides?.intro_text ?? tSeo(introKey, p);

  let benefitDefs: BenefitDef[];
  if (pageType === "occasion" || pageType === "occasions-listing") {
    benefitDefs = OCCASION_BENEFITS;
  } else if (pageType === "brand") {
    benefitDefs = brandCategory === "flowers" ? BRAND_FLOWER_BENEFITS : GIFT_BENEFITS;
  } else if (pageType === "brand-listing") {
    benefitDefs = BRAND_LISTING_BENEFITS;
  } else if (pageType === "corporate") {
    benefitDefs = CORPORATE_BENEFITS;
  } else if (pageType === "weddings") {
    benefitDefs = WEDDING_BENEFITS;
  } else if (isFlowerCategory(entitySlug)) {
    benefitDefs = FLOWER_BENEFITS;
  } else {
    benefitDefs = GIFT_BENEFITS;
  }

  const benefits = overrides?.benefits
    ? overrides.benefits.map((b) => ({ title: b.title, body: b.body }))
    : benefitDefs.map((def) => ({
        icon: def.icon,
        title: tSeo(def.titleKey),
        body: tSeo(def.bodyKey),
      }));

  let internalLinks: { label: string; href: string }[];
  if (overrides?.internal_links) {
    internalLinks = overrides.internal_links;
  } else if (pageType === "category") {
    internalLinks = CATEGORY_OCCASION_CHIPS
      .filter((chip) => availableOccasionIds.includes(chip.slug))
      .map((chip) => ({ label: tSeo(chip.labelKey), href: `/occasion/${chip.slug}` }));
  } else if (pageType === "occasion") {
    internalLinks = OCCASION_CATEGORY_CHIPS
      .filter((chip) => availableCategoryIds.includes(chip.slug))
      .map((chip) => ({ label: tSeo(chip.labelKey), href: `/category/${chip.slug}` }));
  } else if (pageType === "brand") {
    internalLinks = BRAND_OCCASION_CHIPS
      .filter((chip) => availableOccasionIds.includes(chip.slug))
      .map((chip) => ({ label: tSeo(chip.labelKey), href: `/occasion/${chip.slug}` }));
  } else if (pageType === "homepage" || pageType === "shop") {
    internalLinks = TOP_OCCASION_CHIPS.map((chip) => ({
      label: tSeo(chip.labelKey),
      href: `/occasion/${chip.slug}`,
    }));
  } else if (pageType === "occasions-listing") {
    internalLinks = TOP_OCCASION_CHIPS.map((chip) => ({
      label: tSeo(chip.labelKey),
      href: `/occasion/${chip.slug}`,
    }));
  } else if (pageType === "corporate") {
    internalLinks = [
      { label: tSeo("seo.content.contact.chip.orders"), href: "/shop" },
      { label: tSeo("seo.content.contact.chip.faqs"), href: "/faqs" },
      { label: tSeo("seo.content.contact.chip.corporate"), href: "/corporate" },
    ];
  } else if (pageType === "weddings") {
    internalLinks = [
      { label: tSeo("seo.content.contact.chip.orders"), href: "/shop" },
      { label: tSeo("seo.content.contact.chip.faqs"), href: "/faqs" },
      { label: tSeo("seo.content.contact.chip.corporate"), href: "/corporate" },
    ];
  } else if (pageType === "contact") {
    internalLinks = [
      { label: tSeo("seo.content.contact.chip.orders"), href: "/shop" },
      { label: tSeo("seo.content.contact.chip.faqs"), href: "/faqs" },
      { label: tSeo("seo.content.contact.chip.corporate"), href: "/corporate" },
    ];
  } else {
    internalLinks = [];
  }

  let faqKeys: { q: string; a: string }[];
  if (pageType === "category") {
    faqKeys = [
      { q: "seo.content.cat.faq.1.q", a: "seo.content.cat.faq.1.a" },
      { q: "seo.content.cat.faq.2.q", a: "seo.content.cat.faq.2.a" },
      { q: "seo.content.cat.faq.3.q", a: "seo.content.cat.faq.3.a" },
    ];
  } else if (pageType === "occasion") {
    faqKeys = [
      { q: "seo.content.occ.faq.1.q", a: "seo.content.occ.faq.1.a" },
      { q: "seo.content.occ.faq.2.q", a: "seo.content.occ.faq.2.a" },
      { q: "seo.content.occ.faq.3.q", a: "seo.content.occ.faq.3.a" },
    ];
  } else if (pageType === "brand") {
    faqKeys = [
      { q: "seo.content.brand.faq.1.q", a: "seo.content.brand.faq.1.a" },
      { q: "seo.content.brand.faq.2.q", a: "seo.content.brand.faq.2.a" },
      { q: "seo.content.brand.faq.3.q", a: "seo.content.brand.faq.3.a" },
    ];
  } else if (pageType === "brand-listing") {
    faqKeys = [
      { q: "seo.content.brands.faq.1.q", a: "seo.content.brands.faq.1.a" },
      { q: "seo.content.brands.faq.2.q", a: "seo.content.brands.faq.2.a" },
      { q: "seo.content.brands.faq.3.q", a: "seo.content.brands.faq.3.a" },
    ];
  } else if (pageType === "homepage") {
    faqKeys = [
      { q: "seo.content.homepage.faq.1.q", a: "seo.content.homepage.faq.1.a" },
      { q: "seo.content.homepage.faq.2.q", a: "seo.content.homepage.faq.2.a" },
      { q: "seo.content.homepage.faq.3.q", a: "seo.content.homepage.faq.3.a" },
    ];
  } else if (pageType === "shop") {
    faqKeys = [
      { q: "seo.content.shop.faq.1.q", a: "seo.content.shop.faq.1.a" },
      { q: "seo.content.shop.faq.2.q", a: "seo.content.shop.faq.2.a" },
      { q: "seo.content.shop.faq.3.q", a: "seo.content.shop.faq.3.a" },
    ];
  } else if (pageType === "corporate") {
    faqKeys = [
      { q: "seo.content.corporate.faq.1.q", a: "seo.content.corporate.faq.1.a" },
      { q: "seo.content.corporate.faq.2.q", a: "seo.content.corporate.faq.2.a" },
      { q: "seo.content.corporate.faq.3.q", a: "seo.content.corporate.faq.3.a" },
    ];
  } else if (pageType === "weddings") {
    faqKeys = [
      { q: "seo.content.weddings.faq.1.q", a: "seo.content.weddings.faq.1.a" },
      { q: "seo.content.weddings.faq.2.q", a: "seo.content.weddings.faq.2.a" },
      { q: "seo.content.weddings.faq.3.q", a: "seo.content.weddings.faq.3.a" },
    ];
  } else if (pageType === "occasions-listing") {
    faqKeys = [
      { q: "seo.content.occasions.faq.1.q", a: "seo.content.occasions.faq.1.a" },
      { q: "seo.content.occasions.faq.2.q", a: "seo.content.occasions.faq.2.a" },
      { q: "seo.content.occasions.faq.3.q", a: "seo.content.occasions.faq.3.a" },
    ];
  } else {
    faqKeys = [
      { q: "seo.content.contact.faq.1.q", a: "seo.content.contact.faq.1.a" },
      { q: "seo.content.contact.faq.2.q", a: "seo.content.contact.faq.2.a" },
      { q: "seo.content.contact.faq.3.q", a: "seo.content.contact.faq.3.a" },
    ];
  }

  const faqs = overrides?.faqs
    ? overrides.faqs
    : faqKeys.map((k) => ({
        question: tSeo(k.q, p),
        answer: tSeo(k.a, p),
      }));

  useEffect(() => {
    // When the server-side injector (seo-inject.mjs) has already emitted a
    // FAQPage JSON-LD block for this route, skip client-side injection to
    // avoid two competing FAQPage blocks in the DOM. The server block is the
    // authoritative source of truth; the client block is only needed as a
    // fallback on routes the injector does not cover.
    if (suppressFaqJsonLd) return;

    const existing = document.head.querySelector(`[${SEO_LD_ATTR}]`);
    if (existing) existing.parentElement?.removeChild(existing);

    const schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: f.answer,
        },
      })),
    };
    const script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.setAttribute(SEO_LD_ATTR, "true");
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);

    return () => {
      const el = document.head.querySelector(`[${SEO_LD_ATTR}]`);
      if (el) el.parentElement?.removeChild(el);
    };
  }, [suppressFaqJsonLd, faqs.map((f) => f.question + f.answer).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const linksLabelKey = (() => {
    switch (pageType) {
      case "category": return "seo.content.cat.linksLabel";
      case "brand": return "seo.content.brand.linksLabel";
      case "homepage":
      case "shop": return "seo.content.homepage.linksLabel";
      case "occasions-listing": return "seo.content.occasions.linksLabel";
      default: return "seo.content.occ.linksLabel";
    }
  })();

  return (
    <section
      dir={dir}
      className="w-full bg-gray-100 mt-12 md:mt-16 py-10 md:py-16"
      data-testid="seo-content-section"
    >
      <div className="max-w-content mx-auto px-4 sm:px-6 md:px-10">
        <h2 className="font-serif text-2xl md:text-3xl text-foreground mb-4 leading-snug">
          {heading}
        </h2>

        <p className="text-muted-foreground leading-relaxed max-w-3xl mb-10 md:mb-12">
          {intro}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10 md:mb-12">
          {benefits.map((benefit, i) => {
            const IconEl = (benefit as { icon?: React.ElementType }).icon;
            return (
              <div
                key={i}
                className="flex flex-col gap-2 p-4 rounded-xl border border-stone-200 bg-white"
              >
                {IconEl && (
                  <IconEl className="w-5 h-5 text-primary shrink-0" strokeWidth={1.5} />
                )}
                <p className="font-medium text-sm text-foreground leading-snug">
                  {benefit.title}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {benefit.body}
                </p>
              </div>
            );
          })}
        </div>

        {internalLinks.length > 0 && (
          <div className="mb-10 md:mb-12">
            <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
              {tSeo(linksLabelKey, p)}
            </p>
            <div className="flex flex-wrap gap-2">
              {internalLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center px-4 py-1.5 rounded-full border border-stone-200 bg-white text-sm text-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="font-serif text-lg text-foreground mb-4">
            {tSeo("seo.content.faqTitle")}
          </p>
          <dl className="divide-y divide-stone-100">
            {faqs.map((faq, i) => {
              const isOpen = openFaqIndex === i;
              const panelId = `seo-faq-panel-${i}`;
              const btnId = `seo-faq-btn-${i}`;
              return (
                <div key={i} className="py-3">
                  <dt>
                    <button
                      id={btnId}
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpenFaqIndex(isOpen ? null : i)}
                      className="flex w-full items-center justify-between text-start gap-4 py-1 text-sm font-medium text-foreground hover:text-primary transition-colors"
                    >
                      <span>{faq.question}</span>
                      <span className="shrink-0 text-muted-foreground text-base leading-none select-none">
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>
                  </dt>
                  <dd
                    id={panelId}
                    role="region"
                    aria-labelledby={btnId}
                    hidden={!isOpen}
                    className="pt-2 pb-1 text-sm text-muted-foreground leading-relaxed"
                  >
                    {faq.answer}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </section>
  );
}
