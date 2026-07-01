import { useRef, useMemo } from "react";
import { BEAR_SIZE_TABS, type BearSize } from "@/lib/bearSizes";
import { useLocale } from "@/contexts/LocaleContext";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/queries";

type Props = {
  activeKey: string;
  onSelect: (key: string) => void;
  sizeMap: Record<string, BearSize>;
  products: Product[];
};

export function BearSizeTabs({ activeKey, onSelect, sizeMap, products }: Props) {
  const { t } = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);

  const sizeCounts = useMemo(() => {
    const counts = new Map<BearSize, number>();
    for (const p of products) {
      const size = sizeMap[p.id];
      if (size) {
        counts.set(size, (counts.get(size) ?? 0) + 1);
      }
    }
    return counts;
  }, [products, sizeMap]);

  const visibleTabs = BEAR_SIZE_TABS.filter((tab) => {
    if (tab.size === null) return true;
    return (sizeCounts.get(tab.size) ?? 0) > 0;
  });

  if (visibleTabs.length <= 1) return null;

  return (
    <div className="mb-6">
      <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3 font-medium">
        {t("shop.bearSize.label")}
      </p>
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        role="tablist"
        aria-label={t("shop.bearSize.label")}
      >
        {visibleTabs.map((tab) => {
          const isActive = activeKey === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(tab.key)}
              className={cn(
                "shrink-0 px-4 py-1.5 rounded-full border text-sm font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary bg-background",
              )}
              data-testid={`bear-size-tab-${tab.key}`}
            >
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
