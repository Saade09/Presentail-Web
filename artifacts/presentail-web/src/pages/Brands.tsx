import { useBrands } from "@/lib/queries";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";

export default function Brands() {
  const { t, language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const brandParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) brandParams.countryCode = countryCode;
  if (cityId) brandParams.cityId = cityId;
  const { data, isLoading } = useBrands(brandParams);
  
  return (
    <div className="min-h-screen pt-32 pb-24 bg-background">
      <div className="container mx-auto px-4">
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
            {data?.brands.map((brand, i) => (
              <motion.div
                key={brand.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
              >
                <Link href={`/brand/${brand.slug}`} className="block group">
                  <div className="aspect-square bg-secondary/50 rounded-2xl flex items-center justify-center p-8 mb-4 border border-transparent transition-colors group-hover:border-primary/10 group-hover:bg-secondary">
                    {brand.image ? (
                      <img src={brand.image} alt={brand.name} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                    ) : (
                      <span className="font-serif text-2xl text-muted-foreground">{brand.name.charAt(0)}</span>
                    )}
                  </div>
                  <h3 className="font-serif text-center font-medium group-hover:text-primary transition-colors">{brand.name}</h3>
                  <p className="text-center text-xs text-muted-foreground mt-1">{brand.count} {t("brands.products")}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
