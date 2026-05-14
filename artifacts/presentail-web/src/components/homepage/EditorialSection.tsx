import { Link } from "wouter";
import { motion } from "framer-motion";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import hero from "@/assets/hero.png";

export function EditorialSection() {
  const { t } = useLocale();

  return (
    <section className="py-14 md:py-24" data-testid="section-editorial">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-14 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="aspect-[4/5] rounded-3xl overflow-hidden bg-muted shadow-lg">
              <img
                src={hero}
                alt={t("editorial.imageAlt")}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <p className="text-xs md:text-sm font-medium tracking-[0.2em] uppercase text-gold mb-4">
              {t("editorial.eyebrow")}
            </p>
            <h2 className="font-serif text-3xl md:text-5xl text-primary leading-tight mb-5">
              {t("editorial.title")}
            </h2>
            <p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-8">
              {t("editorial.body")}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
              <div className="border-s-2 border-gold ps-4">
                <h3 className="font-serif text-lg text-primary">{t("editorial.feature1.title")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("editorial.feature1.desc")}</p>
              </div>
              <div className="border-s-2 border-gold ps-4">
                <h3 className="font-serif text-lg text-primary">{t("editorial.feature2.title")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("editorial.feature2.desc")}</p>
              </div>
            </div>

            <Link href="/about">
              <Button
                size="lg"
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 px-7"
                data-testid="button-editorial-cta"
              >
                {t("editorial.cta")}
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
