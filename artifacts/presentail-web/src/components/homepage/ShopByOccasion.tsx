import { Link } from "wouter";
import { motion } from "framer-motion";
import { Cake, Heart, Sparkles, Trophy, Baby, Smile, Flower2, Gift } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { ArrowRight } from "lucide-react";

export function ShopByOccasion() {
  const { t } = useLocale();

  const items = [
    { key: "occasions.birthday", slug: "birthday", Icon: Cake },
    { key: "occasions.romance", slug: "love-romance", Icon: Heart },
    { key: "occasions.anniversary", slug: "anniversary", Icon: Sparkles },
    { key: "occasions.congrats", slug: "congratulations", Icon: Trophy },
    { key: "occasions.newBaby", slug: "new-born", Icon: Baby },
    { key: "occasions.thankYou", slug: "thank-you", Icon: Smile },
    { key: "occasions.sympathy", slug: "condolences", Icon: Flower2 },
    { key: "occasions.justBecause", slug: "just-because", Icon: Gift },
  ] as const;

  return (
    <section className="py-14 md:py-20" data-testid="section-occasions">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <p className="text-xs md:text-sm font-medium tracking-[0.2em] uppercase text-gold mb-3">
            {t("occasions.eyebrow")}
          </p>
          <h2 className="font-serif text-3xl md:text-5xl text-primary mb-3">{t("occasions.title")}</h2>
          <p className="text-muted-foreground text-sm md:text-base">{t("occasions.subtitle")}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-5">
          {items.map((it, i) => (
            <motion.div
              key={it.slug}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
            >
              <Link
                href={`/occasion/${it.slug}`}
                className="group flex flex-col items-center justify-center text-center gap-3 py-7 md:py-9 px-4 rounded-2xl bg-card border border-border/60 hover:border-gold hover:shadow-md transition-all"
                data-testid={`link-occasion-${it.slug}`}
              >
                <span className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-secondary flex items-center justify-center text-primary group-hover:bg-gold group-hover:text-white transition-colors">
                  <it.Icon className="w-5 h-5 md:w-6 md:h-6" />
                </span>
                <span className="font-serif text-base md:text-lg text-primary">{t(it.key)}</span>
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="flex justify-center mt-8 md:mt-10">
          <Link
            href="/occasions"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline underline-offset-2"
            data-testid="link-view-all-occasions"
          >
            {t("occasions.viewAll")}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
