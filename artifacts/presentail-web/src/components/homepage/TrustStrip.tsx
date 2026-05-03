import { Truck, Sparkles, ShieldCheck, Headphones } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

export function TrustStrip() {
  const { t } = useLocale();

  const items = [
    { Icon: Truck, title: "trust.delivery.title", desc: "trust.delivery.desc" },
    { Icon: Sparkles, title: "trust.fresh.title", desc: "trust.fresh.desc" },
    { Icon: ShieldCheck, title: "trust.payment.title", desc: "trust.payment.desc" },
    { Icon: Headphones, title: "trust.care.title", desc: "trust.care.desc" },
  ] as const;

  return (
    <section className="py-10 md:py-14 border-y border-border/60" data-testid="section-trust">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {items.map((it) => (
            <div key={it.title} className="flex items-start gap-3 md:gap-4">
              <span className="shrink-0 w-11 h-11 md:w-12 md:h-12 rounded-full bg-secondary text-primary flex items-center justify-center">
                <it.Icon className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-serif text-base md:text-lg text-primary leading-tight">{t(it.title)}</h3>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">{t(it.desc)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
