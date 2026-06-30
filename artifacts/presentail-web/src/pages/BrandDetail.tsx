import { useEffect } from "react";
import { useRoute, Link } from "wouter";
import { ProductCard } from "@/components/ProductCard";
import { useBrands, useBrandProducts } from "@/lib/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin } from "lucide-react";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";
import { buildBrandSeo } from "@/lib/seo";
import { useLcpImagePreload } from "@/hooks/useLcpImagePreload";

const SEO_ATTR = "data-seo-managed";

// AI-generated cover images per brand slug.
// Add a new entry here whenever a new brand cover is placed in public/brand-covers/.
const BRAND_COVER_IMAGES: Record<string, string> = {
  "hallab-1881": "/brand-covers/hallab-1881.png",
  "apple": "/brand-covers/apple.png",
  "sables-gourmets": "/brand-covers/sables-gourmets.png",
  "salma": "/brand-covers/salma.png",
};

function setMeta(selector: string, attrs: Record<string, string>, parent: HTMLElement) {
  let el = parent.querySelector<HTMLElement>(`${selector}[${SEO_ATTR}]`);
  if (!el) {
    el = document.createElement(selector.split("[")[0]);
    el.setAttribute(SEO_ATTR, "true");
    parent.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

export default function BrandDetail() {
  const [, params] = useRoute("/brand/:slug");
  const slug = params?.slug;
  const { t, dir, language, cityName, countryName } = useLocale();
  const { countryCode, cityId, country, city, openPicker } = useLocationSelection();

  const { data: brandsData, isLoading: isBrandsLoading } = useBrands({ lang: language, countryCode: countryCode ?? undefined, cityId: cityId ?? undefined });
  const brand = brandsData?.brands.find(b => b.slug === slug);
  const brandQueryParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) brandQueryParams.countryCode = countryCode;
  if (cityId) brandQueryParams.cityId = cityId;
  const { data, isLoading } = useBrandProducts(slug ?? "", brandQueryParams);

  const brandName = brand?.name || slug || "";

  useEffect(() => {
    if (typeof document === "undefined" || !brandName) return;
    if (cityId && !city) return;
    if (countryCode && !country) return;
    const head = document.head;
    const cityLabel = city ? cityName(city.id, city.name) : "";
    const countryLabel = country ? countryName(country.code, country.name) : "";
    const seo = buildBrandSeo({ lang: language, brandName, city: cityLabel, country: countryLabel });
    document.title = seo.title;
    head.querySelectorAll(`[${SEO_ATTR}]`).forEach((el) => el.parentElement?.removeChild(el));
    setMeta('meta[name="description"]', { name: "description", content: seo.description }, head);
    setMeta('meta[property="og:title"]', { property: "og:title", content: seo.ogTitle }, head);
    setMeta('meta[property="og:description"]', { property: "og:description", content: seo.ogDescription }, head);
    setMeta('meta[name="twitter:title"]', { name: "twitter:title", content: seo.twitterTitle }, head);
    setMeta('meta[name="twitter:description"]', { name: "twitter:description", content: seo.twitterDescription }, head);
    return () => {
      head.querySelectorAll(`[${SEO_ATTR}]`).forEach((el) => el.parentElement?.removeChild(el));
    };
  }, [brandName, city, country, language, cityName, countryName]); // eslint-disable-line react-hooks/exhaustive-deps

  useLcpImagePreload(data?.products[0]?.image?.uri ?? null);

  const breadcrumbCrumbs = [
    { label: t("nav.home"), href: "/" },
    { label: t("nav.brands"), href: "/brands" },
    isBrandsLoading && !brand ? ({ skeleton: true } as const) : { label: brandName },
  ];

  const coverImage = slug ? BRAND_COVER_IMAGES[slug] ?? null : null;
  const hasCover = !!coverImage || !!brand?.image;

  return (
    <div className="min-h-screen pb-24 bg-background">
      {/* ── Breadcrumb + back link ── */}
      <div className="container mx-auto max-w-content px-page pt-6">
        <PageBreadcrumb crumbs={breadcrumbCrumbs} />
        <Link
          href="/brands"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mt-3 mb-4"
        >
          <ArrowLeft className={`w-4 h-4 mr-1.5 ${dir === "rtl" ? "rotate-180" : ""}`} />
          {t("brand.backToBrands")}
        </Link>
      </div>

      {/* ── Brand hero ── */}
      <div className="container mx-auto max-w-content px-page">
        {hasCover ? (
          <div className="relative rounded-2xl overflow-hidden h-48 md:h-56 bg-secondary/40">
            {/* AI-generated cover image, or blurred logo as fallback */}
            <img
              src={coverImage ?? brand!.image!}
              alt=""
              aria-hidden="true"
              className={`absolute inset-0 w-full h-full object-cover${coverImage ? "" : " scale-110 blur-sm"}`}
            />
            {/* Gradient overlay for depth */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />

            {/* Logo card overlapping bottom center */}
            <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 w-[72px] h-[72px] md:w-20 md:h-20 bg-white rounded-2xl shadow-lg border border-white/80 flex items-center justify-center p-2.5">
              <img
                src={brand!.image!}
                alt={brand!.name}
                className="max-w-full max-h-full object-contain mix-blend-multiply"
                loading="eager"
                fetchPriority="high"
              />
            </div>
          </div>
        ) : (
          /* No cover: just show logo centred on a soft background */
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-secondary/50 rounded-2xl flex items-center justify-center p-3 shadow-sm">
              {brand?.image ? (
                <img
                  src={brand.image}
                  alt={brand.name}
                  className="max-w-full max-h-full object-contain mix-blend-multiply"
                  loading="eager"
                  fetchPriority="high"
                />
              ) : (
                <span className="font-serif text-4xl text-muted-foreground">
                  {brand?.name?.charAt(0) || slug?.charAt(0)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Brand name + description ── */}
        <div className={`text-center ${hasCover ? "mt-12 md:mt-14" : "mt-6"} mb-6`}>
          <h1 className="text-3xl md:text-4xl font-serif mb-2">{brandName}</h1>
          <p className="text-muted-foreground text-sm md:text-base max-w-xs md:max-w-sm mx-auto leading-relaxed">
            {t("brand.descPrefix", { name: brandName })}
          </p>
        </div>

        {/* ── Products ── */}
        <h2 className="sr-only">{t("shop.productsHeading")}</h2>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {Array(8).fill(0).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[4/5] rounded-2xl" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : data?.products.length === 0 ? (
          <div className="text-center py-24 bg-muted/30 rounded-2xl border border-dashed" data-testid="empty-state-no-brand-products">
            {country ? (
              <>
                <MapPin className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-serif text-2xl mb-3">
                  {t("brand.empty.titleCountry", { country: country.name })}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {t("brand.empty.descCountry", { name: brandName, country: country.name })}
                </p>
                <Button variant="outline" onClick={() => openPicker()} data-testid="button-change-country">
                  {t("brand.empty.changeCountry")}
                </Button>
              </>
            ) : (
              <>
                <h3 className="font-serif text-2xl mb-3">{t("brand.empty.titleNoCountry")}</h3>
                <p className="text-muted-foreground">{t("brand.empty.descNoCountry")}</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10">
            {data?.products.map((product, i) => (
              <ProductCard key={product.id} product={product} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
