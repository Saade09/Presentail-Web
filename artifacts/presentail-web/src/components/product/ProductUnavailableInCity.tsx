import { useEffect, useMemo } from "react";
import { Link } from "wouter";
import { MapPin, MessageCircle, Phone, Mail, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/ProductCard";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useProducts, useCatalogMetadata, type Product } from "@/lib/queries";
import type { ProductAvailabilityStore } from "@/lib/queries";
import { trackEvent } from "@/lib/analytics";
import { buildLocalePath } from "@/lib/locale-route";
import type { Lang, CountrySlug } from "@/lib/locale-route";

const WHATSAPP_URL = "https://wa.me/9613136532";
const PHONE_E164 = "+9613136532";
const SUPPORT_EMAIL = "hello@presentail.com";

interface ProductUnavailableInCityProps {
  productName: string;
  productSlug: string;
  availableStores: ProductAvailabilityStore[];
  category?: string;
  brand?: string;
}

export function ProductUnavailableInCity({
  productName,
  productSlug,
  availableStores,
  category,
  brand,
}: ProductUnavailableInCityProps) {
  const { t, language, cityName } = useLocale();
  const { countryCode, cityId, city, country } = useLocationSelection();

  const locParams: { countryCode?: string; cityId?: string; lang?: string } = {
    lang: language,
  };
  if (countryCode) locParams.countryCode = countryCode;
  if (cityId) locParams.cityId = cityId;

  const { data: allData } = useProducts(locParams);
  const { data: catalogMetadata } = useCatalogMetadata();

  const currentCityLabel = city ? cityName(city.id, city.name) : (country?.name ?? "");
  const firstAvailableStore = availableStores[0] ?? null;

  const switchBackUrl = firstAvailableStore
    ? buildLocalePath({
        lang: language as Lang,
        country: firstAvailableStore.countrySlug as CountrySlug,
        city: firstAvailableStore.citySlug,
        rest: `/product/${productSlug}`,
      })
    : null;

  const categoryEntry = category
    ? catalogMetadata?.categories.find((c) => c.id === category)
    : undefined;
  const categoryLabel = categoryEntry?.name ?? category ?? "";

  // Check whether the category has any products available in the current city.
  // Only used to gate the "Browse [category]" CTA and "View all" link — we
  // never show those if the category has nothing to show here either.
  const categoryHasProducts = useMemo((): boolean => {
    if (!category) return false;
    const all = allData?.products ?? [];
    return all.some((p) => (p.categories ?? [p.category]).includes(category));
  }, [allData?.products, category]);

  // Ranking: same category + same brand → same category + other brand → other → by popularity
  const recommendedProducts = useMemo((): Product[] => {
    const all = allData?.products ?? [];
    if (all.length === 0) return [];

    const inCategory = (p: Product): boolean =>
      !!category && (p.categories ?? [p.category]).includes(category);
    const matchesBrand = (p: Product): boolean =>
      !!brand && !!(p.brandNames?.some((b) => b.toLowerCase() === brand.toLowerCase()));

    const sameCatSameBrand: Product[] = [];
    const sameCatOtherBrand: Product[] = [];
    const other: Product[] = [];

    for (const p of all) {
      if (inCategory(p)) {
        if (matchesBrand(p)) {
          sameCatSameBrand.push(p);
        } else {
          sameCatOtherBrand.push(p);
        }
      } else {
        other.push(p);
      }
    }

    const byPopDesc = (a: Product, b: Product) =>
      (b.popularity ?? 0) - (a.popularity ?? 0);

    return [
      ...sameCatSameBrand.sort(byPopDesc),
      ...sameCatOtherBrand.sort(byPopDesc),
      ...other.sort(byPopDesc),
    ].slice(0, 8);
  }, [allData?.products, category, brand]);

  useEffect(() => {
    trackEvent({
      name: "product_unavailable_city_viewed",
      productId: productSlug,
    });
  }, [productSlug]);

  const subtitle =
    firstAvailableStore
      ? t("productUnavailable.subtitleWithAlts")
          .replace("{altCity}", firstAvailableStore.cityLabel)
          .replace("{city}", currentCityLabel)
      : t("productUnavailable.subtitleNoAlts").replace("{city}", currentCityLabel);

  return (
    <div className="bg-white min-h-screen">
      <SeoMeta
        switchBackUrl={availableStores.length === 1 ? switchBackUrl : null}
      />

      <div className="container mx-auto px-page max-w-content pt-16 pb-8">
        {/* Icon + heading */}
        <div className="flex flex-col items-center text-center gap-4 mb-8">
          <div className="w-20 h-20 rounded-full bg-teal-50 flex items-center justify-center relative">
            <MapPin className="w-9 h-9 text-teal-600" />
            <span className="absolute -bottom-1 -right-1 bg-white rounded-full w-7 h-7 flex items-center justify-center shadow-sm border border-border">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </span>
          </div>

          <div className="space-y-2 max-w-md">
            <h1 className="font-serif text-2xl sm:text-3xl text-foreground">
              {t("productUnavailable.heading").replace("{city}", currentCityLabel)}
            </h1>
            {productName && (
              <p className="text-sm text-muted-foreground font-medium">{productName}</p>
            )}
            <p className="text-muted-foreground text-sm leading-relaxed">{subtitle}</p>
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
          <Button
            asChild
            size="lg"
            className="rounded-xl"
            onClick={() =>
              trackEvent({ name: "shop_selected_city_clicked", productId: productSlug })
            }
          >
            <Link href="/shop">
              {t("productUnavailable.shopCity").replace("{city}", currentCityLabel)}
            </Link>
          </Button>

          {switchBackUrl && firstAvailableStore && (
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-xl"
              onClick={() =>
                trackEvent({ name: "switch_back_city_clicked", productId: productSlug })
              }
            >
              <a href={switchBackUrl}>
                {t("productUnavailable.switchBack").replace(
                  "{city}",
                  firstAvailableStore.cityLabel,
                )}
              </a>
            </Button>
          )}

          {/* Only shown when the category exists AND has products in the current city */}
          {category && categoryLabel && categoryHasProducts && (
            <Button
              asChild
              variant="ghost"
              size="lg"
              className="rounded-xl"
              onClick={() =>
                trackEvent({
                  name: "browse_category_selected_city_clicked",
                  productId: productSlug,
                })
              }
            >
              <Link href={`/category/${category}`}>
                <ArrowRight className="w-4 h-4 mr-1.5" />
                {t("productUnavailable.browseCategory")
                  .replace("{category}", categoryLabel)
                  .replace("{city}", currentCityLabel)}
              </Link>
            </Button>
          )}
        </div>

        {/* Recommended products */}
        {recommendedProducts.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif text-xl">
                {t("productUnavailable.recommendedHeading").replace(
                  "{city}",
                  currentCityLabel,
                )}
              </h2>
              {/* "View all" link only shown when category has products in current city */}
              {category && categoryLabel && categoryHasProducts && (
                <Link
                  href={`/category/${category}`}
                  className="text-sm text-teal-700 hover:underline"
                >
                  {t("productUnavailable.viewAllCategory")
                    .replace("{category}", categoryLabel)
                    .replace("{city}", currentCityLabel)}
                </Link>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {recommendedProducts.map((p, i) => (
                <div
                  key={p.id}
                  onClick={() =>
                    trackEvent({
                      name: "recommended_product_clicked",
                      productId: p.id,
                      recommendationPosition: i + 1,
                    })
                  }
                >
                  <ProductCard product={p} index={i} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Help strip */}
        <section className="rounded-2xl bg-secondary/40 px-6 py-8 text-center mb-8">
          <h3 className="font-serif text-lg mb-1">
            {t("productUnavailable.helpTitle")}
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            {t("productUnavailable.helpDesc")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="outline" size="sm" className="rounded-xl gap-2">
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-4 h-4" />
                {t("productUnavailable.helpWhatsApp")}
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-xl gap-2">
              <a href={`tel:${PHONE_E164}`}>
                <Phone className="w-4 h-4" />
                {t("productUnavailable.helpPhone")}
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-xl gap-2">
              <a href={`mailto:${SUPPORT_EMAIL}`}>
                <Mail className="w-4 h-4" />
                {t("productUnavailable.helpEmail")}
              </a>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Injects `noindex, follow` robot meta tag and a canonical link (when a single
 * available city is known). Cleans up on unmount so normal product pages are
 * not affected if the shopper navigates away.
 */
function SeoMeta({ switchBackUrl }: { switchBackUrl: string | null }) {
  useEffect(() => {
    const SEO_ATTR = "data-seo-unavailable";
    const head = document.head;

    // noindex, follow
    const robotsMeta = document.createElement("meta");
    robotsMeta.setAttribute("name", "robots");
    robotsMeta.setAttribute("content", "noindex, follow");
    robotsMeta.setAttribute(SEO_ATTR, "true");
    head.appendChild(robotsMeta);

    // canonical — only when one unambiguous available city is known
    let canonicalEl: HTMLLinkElement | null = null;
    if (switchBackUrl) {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      canonicalEl = document.createElement("link");
      canonicalEl.setAttribute("rel", "canonical");
      canonicalEl.setAttribute("href", `${origin}${switchBackUrl}`);
      canonicalEl.setAttribute(SEO_ATTR, "true");
      head.appendChild(canonicalEl);
    }

    return () => {
      head.querySelectorAll(`[${SEO_ATTR}]`).forEach((el) =>
        el.parentElement?.removeChild(el),
      );
    };
  }, [switchBackUrl]);

  return null;
}
