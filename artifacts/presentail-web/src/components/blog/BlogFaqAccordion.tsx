import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export type FaqItem = { q: string; a: string };

type Props = {
  items: FaqItem[];
};

/**
 * Accessible FAQ accordion for blog articles. Radix Accordion renders button
 * triggers with correct aria-expanded state and full keyboard support
 * (Tab/Enter/Space/Arrow keys) out of the box.
 */
export function BlogFaqAccordion({ items }: Props) {
  if (items.length === 0) return null;
  return (
    <Accordion type="single" collapsible className="w-full" data-testid="blog-faq-accordion">
      {items.map((faq, i) => (
        <AccordionItem key={i} value={`faq-${i}`}>
          <AccordionTrigger className="text-start text-base font-medium leading-snug py-4 hover:no-underline hover:text-primary">
            {faq.q}
          </AccordionTrigger>
          <AccordionContent className="text-base leading-relaxed text-muted-foreground">
            {faq.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
