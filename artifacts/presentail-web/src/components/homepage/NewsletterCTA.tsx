import { useState } from "react";
import { motion } from "framer-motion";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewsletterCTA() {
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitted(true);
  };

  return (
    <section className="py-14 md:py-20" data-testid="section-newsletter">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl bg-primary text-primary-foreground px-6 py-12 md:px-16 md:py-20 text-center"
        >
          <div
            aria-hidden="true"
            className="absolute -top-20 -end-20 w-72 h-72 rounded-full bg-gold/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-24 -start-24 w-80 h-80 rounded-full bg-accent/15 blur-3xl"
          />

          <div className="relative max-w-2xl mx-auto">
            <p className="text-xs md:text-sm font-medium tracking-[0.25em] uppercase text-gold mb-4">
              {t("newsletter.eyebrow")}
            </p>
            <h2 className="font-serif text-3xl md:text-5xl mb-4">{t("newsletter.title")}</h2>
            <p className="text-primary-foreground/80 text-sm md:text-base mb-8 max-w-xl mx-auto">
              {t("newsletter.subtitle")}
            </p>

            {submitted ? (
              <p
                className="text-gold font-medium text-base md:text-lg"
                data-testid="text-newsletter-thanks"
              >
                {t("newsletter.thanks")}
              </p>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto"
                data-testid="form-newsletter"
              >
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("newsletter.placeholder")}
                  className="h-12 rounded-full bg-white/10 border-white/20 text-primary-foreground placeholder:text-primary-foreground/60 px-5 focus-visible:ring-gold"
                  data-testid="input-newsletter-email"
                />
                <Button
                  type="submit"
                  size="lg"
                  className="h-12 rounded-full bg-gold hover:bg-gold-soft text-primary px-8 whitespace-nowrap"
                  data-testid="button-newsletter-submit"
                >
                  {t("newsletter.button")}
                </Button>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
