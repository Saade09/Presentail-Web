import { useState } from "react";
import { Flower2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";

type Props = {
  description: string;
  bouquetIncludes: string[];
  careTips: string[];
};

type Tab = "description" | "care";

export function ProductTabs({ description, bouquetIncludes, careTips }: Props) {
  const [tab, setTab] = useState<Tab>("description");
  const { t } = useLocale();

  const tabs = [
    { id: "description" as const, label: t("product.tab.description") },
    { id: "care" as const, label: t("product.tab.careTips") },
  ];

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
          <div className="space-y-5">
            {description && bouquetIncludes.length === 0 && (
              <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
            {bouquetIncludes.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-foreground font-semibold mb-3">
                  {t("product.bouquetIncludes")}
                </p>
                <ul className="space-y-2">
                  {bouquetIncludes.map((line) => (
                    <li key={line} className="flex gap-3 text-sm text-foreground">
                      <span className="text-gold leading-6">•</span>
                      <span className="flex-1 leading-6">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {careTips.map((c) => (
              <li key={c} className="flex gap-3 text-sm text-foreground">
                <Flower2 className="w-4 h-4 text-gold mt-0.5 shrink-0" aria-hidden="true" />
                <span className="flex-1 leading-6">{c}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
