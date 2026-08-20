import { useState } from "react";
import {
  Flower2,
  Sparkles,
  Cake,
  Leaf,
  Cookie,
  Heart,
  Package,
  Cpu,
  type LucideProps,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";
import { parseDescriptionParts } from "./productViewModel";

type Props = {
  description: string;
  bouquetIncludes: string[];
  careGroup: string;
  careIconName: string;
};

type Tab = "description" | "care";

const CARE_ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  "flower-tulip": Flower2,
  flower: Flower2,
  "flower-poppy": Flower2,
  balloon: Sparkles,
  "cake-variant": Cake,
  leaf: Leaf,
  candy: Cookie,
  "candy-outline": Cookie,
  "teddy-bear": Heart,
  gift: Package,
  devices: Cpu,
};

/** Renders context as prose and explicitly marked OS items as a list. */
function DescriptionBlock({ text }: { text: string }) {
  const { intro, items } = parseDescriptionParts(text);

  if (items.length > 0) {
    return (
      <div className="space-y-4">
        {intro && (
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
            {intro}
          </p>
        )}
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex gap-3 text-sm text-foreground">
              <span className="text-gold leading-6 shrink-0">•</span>
              <span className="flex-1 leading-6">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
      {text}
    </p>
  );
}

/**
 * Description tab content.
 *
 * Two modes:
 * 1. description has explicitly marked bullet items → it IS the full item list.
 *    Render it as DescriptionBlock only; hide the BOUQUET INCLUDES section to
 *    avoid showing the same items twice.
 * 2. description is plain text (or empty) → show it as an intro paragraph above
 *    the BOUQUET INCLUDES list, separated by a rule.
 */
function DescriptionTab({
  description,
  bouquetIncludes,
  includesLabel,
}: {
  description: string;
  bouquetIncludes: string[];
  includesLabel: string;
}) {
  const descHasBullets = parseDescriptionParts(description).items.length > 0;

  return (
    <div className="space-y-6">
      {description && <DescriptionBlock text={description} />}
      {bouquetIncludes.length > 0 && !descHasBullets && (
        <div className={description ? "pt-1 border-t border-border" : ""}>
          <p className="text-xs uppercase tracking-[0.16em] text-foreground font-semibold mb-4 mt-5">
            {includesLabel}
          </p>
          <ul className="space-y-3">
            {bouquetIncludes.map((line) => (
              <li key={line} className="flex gap-3 text-sm text-foreground">
                <span className="text-gold leading-6 shrink-0">•</span>
                <span className="flex-1 leading-6">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ProductTabs({ description, bouquetIncludes, careGroup, careIconName }: Props) {
  const [tab, setTab] = useState<Tab>("description");
  const { t } = useLocale();

  const tabs = [
    { id: "description" as const, label: t("product.tab.description") },
    { id: "care" as const, label: t("product.tab.careTips") },
  ];

  const CareIcon = CARE_ICON_MAP[careIconName] ?? Flower2;

  return (
    <div className="mt-12" data-testid="product-tabs">
      <div
        role="tablist"
        aria-label={t("product.tabs.aria")}
        className="flex gap-8 border-b border-border"
      >
        {tabs.map((tabItem) => {
          const active = tab === tabItem.id;
          return (
            <button
              key={tabItem.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`product-tab-panel-${tabItem.id}`}
              id={`product-tab-${tabItem.id}`}
              onClick={() => setTab(tabItem.id)}
              className={cn(
                "py-3 text-sm font-semibold uppercase tracking-[0.14em] -mb-px border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                active
                  ? "text-foreground border-foreground"
                  : "text-muted-foreground border-transparent hover:text-foreground/80",
              )}
              data-testid={`product-tab-${tabItem.id}`}
            >
              {tabItem.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`product-tab-panel-${tab}`}
        aria-labelledby={`product-tab-${tab}`}
        tabIndex={0}
        className="pt-6 outline-none"
      >
        {tab === "description" ? (
          <DescriptionTab
            description={description}
            bouquetIncludes={bouquetIncludes}
            includesLabel={t("product.bouquetIncludes")}
          />
        ) : (
          <ul className="space-y-3">
            {([1, 2, 3, 4] as const).map((n) => (
              <li key={n} className="flex gap-3 text-sm text-foreground">
                <CareIcon className="w-4 h-4 text-gold mt-0.5 shrink-0" aria-hidden="true" />
                <span className="flex-1 leading-6">{t(`product.care.${careGroup}.tip${n}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
