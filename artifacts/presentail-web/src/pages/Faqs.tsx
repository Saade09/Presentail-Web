import { useLocale, type Language } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { CITY_NAMES, buildFaqsSeo } from "@/lib/seo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQ_COPY } from "@/data/faqsCopy.js";

type Group = { title: string; items: { q: string; a: string }[] };
type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  groups: Group[];
};

const COPY = FAQ_COPY as Record<Language, Copy>;

export default function Faqs() {
  const { language } = useLocale();
  const { cityId } = useLocationSelection();
  const c = COPY[language] ?? COPY.en;
  const cityDisplay = cityId
    ? ((CITY_NAMES[language] ?? CITY_NAMES.en)[cityId] ?? "")
    : "";
  const h1 = buildFaqsSeo({ lang: language, city: cityDisplay }).title.split(" | ")[0];

  return (
    <div className="bg-background" data-testid="faqs-page" lang={language}>
      <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 max-w-content">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {c.eyebrow}
        </p>
        <h1
          className="text-4xl md:text-5xl font-serif leading-tight mb-6"
          data-testid="faqs-title"
        >
          {h1}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{c.intro}</p>
      </section>

      <section className="container mx-auto px-4 pb-20 md:pb-24 max-w-3xl space-y-10">
        {c.groups.map((g) => (
          <div key={g.title}>
            <h2 className="text-2xl font-serif mb-4">{g.title}</h2>
            <Accordion type="single" collapsible className="w-full">
              {g.items.map((it, i) => (
                <AccordionItem key={i} value={`${g.title}-${i}`}>
                  <AccordionTrigger className="text-start">
                    {it.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {it.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </section>
    </div>
  );
}
