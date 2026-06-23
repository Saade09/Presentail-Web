import { Link } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "@/contexts/LocaleContext";
import { apiFetch } from "@/lib/api";
import bouquets from "@/assets/category-bouquets.png";
import boxes from "@/assets/category-boxes.png";
import plants from "@/assets/category-plants.png";
import cakes from "@/assets/category-cakes.png";
import chocolate from "@/assets/category-chocolate.png";

type CollectionItem = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
};

const STATIC_FALLBACK_IMAGES: Record<string, string> = {
  "hand-bouquets": bouquets,
  "flower-boxes": boxes,
  "plants": plants,
  "cakes": cakes,
  "chocolate": chocolate,
};

export function CategoriesGrid() {
  const { t } = useLocale();

  const { data } = useQuery({
    queryKey: ["homepage", "categories"],
    queryFn: () => apiFetch<{ items: CollectionItem[] }>("/homepage/categories"),
    staleTime: 5 * 60 * 1000,
  });

  const items = (data?.items ?? []).filter((i) => i.isActive);

  if (items.length === 0) return null;

  return (
    <section className="py-14 md:py-20 bg-secondary/40" data-testid="section-categories">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <p className="text-xs md:text-sm font-medium tracking-[0.2em] uppercase text-gold mb-3">
            {t("categories.eyebrow")}
          </p>
          <h2 className="font-serif text-3xl md:text-5xl text-primary mb-3">{t("categories.title")}</h2>
          <p className="text-muted-foreground text-sm md:text-base">{t("categories.subtitle")}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 md:auto-rows-[200px] gap-3 md:gap-5">
          {items.map((item, i) => {
            const staticImg = STATIC_FALLBACK_IMAGES[item.slug];
            const imgSrc = item.imageUrl || staticImg || null;
            const spanClass = i === 0 ? "md:col-span-2 md:row-span-2" : "";
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className={spanClass}
              >
                <Link
                  href={`/category/${encodeURIComponent(item.slug)}`}
                  className="group relative block w-full h-full min-h-[200px] rounded-2xl md:rounded-3xl overflow-hidden bg-muted"
                  data-testid={`link-category-${item.slug}`}
                >
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={item.name}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-secondary to-muted" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                  <div className="absolute inset-0 flex items-end p-4 md:p-6">
                    <div className="text-white">
                      <h3 className="font-serif text-lg md:text-2xl">{item.name}</h3>
                      <span className="text-xs md:text-sm tracking-wide text-white/85 group-hover:text-accent transition-colors">
                        {t("bestSellers.viewAll")} →
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
