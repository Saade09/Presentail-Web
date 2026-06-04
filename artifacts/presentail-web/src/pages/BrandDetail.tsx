import { useRoute, Link } from "wouter";
import { ProductCard } from "@/components/ProductCard";
import { useBrands, useBrandProducts } from "@/lib/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin } from "lucide-react";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";

export default function BrandDetail() {
  const [, params] = useRoute("/brand/:slug");
  const slug = params?.slug;
  const { t, dir, language } = useLocale();
  const { countryCode, cityId, country, openPicker } = useLocationSelection();

  const { data: brandsData, isLoading: isBrandsLoading } = useBrands({ lang: language, countryCode: countryCode ?? undefined, cityId: cityId ?? undefined });
  const brand = brandsData?.brands.find(b => b.slug === slug);
  const brandQueryParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) brandQueryParams.countryCode = countryCode;
  if (cityId) brandQueryParams.cityId = cityId;
  const { data, isLoading } = useBrandProducts(slug ?? "", brandQueryParams);

  const brandName = brand?.name || slug || "";

  const breadcrumbCrumbs = [
    { label: t("nav.home"), href: "/" },
    { label: t("nav.brands"), href: "/brands" },
    isBrandsLoading && !brand ? ({ skeleton: true } as const) : { label: brandName },
  ];

  return (
    <div className="min-h-screen pt-12 pb-24 bg-background">
      <div className="container mx-auto max-w-content px-page">
        <PageBreadcrumb crumbs={breadcrumbCrumbs} />
      </div>
      <div className="container mx-auto max-w-content px-page">
        <Link href="/brands" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className={`w-4 h-4 mr-2 ${dir === "rtl" ? "rotate-180" : ""}`} /> {t("brand.backToBrands")}
        </Link>

        <div className="flex flex-col md:flex-row items-center gap-8 mb-16 pb-8 border-b">
          <div className="w-32 h-32 bg-secondary/50 rounded-2xl flex items-center justify-center p-4 shrink-0">
            {brand?.image ? (
              <img src={brand.image} alt={brand.name} className="max-w-full max-h-full object-contain mix-blend-multiply" loading="eager" fetchPriority="high" />
            ) : (
              <span className="font-serif text-4xl text-muted-foreground">{brand?.name?.charAt(0) || slug?.charAt(0)}</span>
            )}
          </div>
          <div>
            <h1 className="text-4xl md:text-5xl font-serif mb-4">{brandName}</h1>
            <p className="text-muted-foreground text-lg">
              {t("brand.descPrefix", { name: brandName })}
            </p>
          </div>
        </div>

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
