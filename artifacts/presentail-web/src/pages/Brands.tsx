import { useCatalogMetadata } from "@/lib/queries";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { useLocale } from "@/contexts/LocaleContext";
import { useState } from "react";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";

interface BrandCardProps {
  brand: { id: number | string; slug: string; name: string; image?: string | null; count?: number };
  index: number;
}

function BrandCard({ brand, index }: BrandCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const showImage = !!brand.image && !imgFailed;

  return (
    <motion.div
      key={brand.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
    >
      <Link href={`/brand/${brand.slug}`} className="block group">
        <div
          className={[
            "relative aspect-square rounded-2xl flex items-center justify-center mb-[5px] border border-transparent",
            "transition-colors group-hover:border-primary/10 overflow-hidden",
            showImage
              ? "bg-white p-4 group-hover:bg-white/90"
              : "bg-secondary/50 p-8 group-hover:bg-secondary",
          ].join(" ")}
        >
          {showImage && !imgLoaded && (
            <div className="absolute inset-0 bg-primary/10 animate-pulse rounded-2xl" />
          )}
          {showImage ? (
            <img
              src={brand.image!}
              alt={brand.name}
              className={[
                "max-w-full max-h-full object-contain transition-opacity duration-300",
                imgLoaded ? "opacity-100" : "opacity-0",
              ].join(" ")}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className="font-serif text-2xl text-muted-foreground">
              {brand.name.charAt(0)}
            </span>
          )}
        </div>
        <h3 className="font-serif text-center font-medium group-hover:text-primary transition-colors">
          {brand.name}
        </h3>
      </Link>
    </motion.div>
  );
}

export default function Brands() {
  const { t } = useLocale();
  const { data: catalogMetadata, isLoading } = useCatalogMetadata();

  const brands = [...(catalogMetadata?.brands ?? [])].sort((a, b) => {
    const aOrder = (a.sort_order ?? null) !== null ? a.sort_order! : Infinity;
    const bOrder = (b.sort_order ?? null) !== null ? b.sort_order! : Infinity;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });

  const breadcrumbCrumbs = [
    { label: t("nav.home"), href: "/" },
    { label: t("brandsPage.title") },
  ];

  return (
    <div className="min-h-screen pt-6 bg-background">
      <div className="container mx-auto max-w-content px-page pt-4">
        <PageBreadcrumb crumbs={breadcrumbCrumbs} />
      </div>
      <div className="container mx-auto max-w-content px-page pt-4">
        <h1 className="text-4xl md:text-5xl font-serif mb-4">{t("brandsPage.title")}</h1>
        <p className="text-muted-foreground text-lg max-w-xl mb-12">
          {t("brands.desc")}
        </p>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {Array(8).fill(0).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {brands.map((brand, i) => (
              <BrandCard
                key={brand.slug}
                brand={{ id: brand.slug, slug: brand.slug, name: brand.name, image: brand.image, count: brand.count }}
                index={i}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
