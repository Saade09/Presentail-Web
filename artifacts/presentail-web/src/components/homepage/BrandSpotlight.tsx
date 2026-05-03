import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useBrands } from "@/lib/queries";
import { useLocale } from "@/contexts/LocaleContext";

export function BrandSpotlight() {
  const { t } = useLocale();
  const { data, isLoading } = useBrands();
  const brands = (data?.brands ?? []).slice(0, 6);

  return (
    <section className="py-14 md:py-20 bg-secondary/40" data-testid="section-brands">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10 md:mb-14">
          <div className="max-w-xl">
            <p className="text-xs md:text-sm font-medium tracking-[0.2em] uppercase text-gold mb-3">
              {t("brands.eyebrow")}
            </p>
            <h2 className="font-serif text-3xl md:text-5xl text-primary mb-3">{t("brands.title")}</h2>
            <p className="text-muted-foreground text-sm md:text-base">{t("brands.subtitle")}</p>
          </div>
          <Link
            href="/brands"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-gold transition-colors self-start md:self-auto"
            data-testid="link-brands-view-all"
          >
            {t("brands.viewAll")} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 md:gap-5">
          {isLoading || brands.length === 0
            ? Array(6)
                .fill(0)
                .map((_, i) => (
                  <div key={i} className="aspect-square bg-muted rounded-2xl animate-pulse" />
                ))
            : brands.map((b, i) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.4, delay: i * 0.04 }}
                >
                  <Link
                    href={`/brand/${b.slug}`}
                    className="group block aspect-square rounded-2xl bg-card border border-border/60 hover:border-gold hover:shadow-md transition-all p-4 flex items-center justify-center text-center"
                    data-testid={`link-brand-${b.slug}`}
                  >
                    {b.image ? (
                      <img
                        src={b.image}
                        alt={b.name}
                        className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <span className="font-serif text-base md:text-lg text-primary group-hover:text-gold transition-colors">
                        {b.name}
                      </span>
                    )}
                  </Link>
                </motion.div>
              ))}
        </div>
      </div>
    </section>
  );
}
