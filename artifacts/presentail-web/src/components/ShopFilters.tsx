import { useState } from "react";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { COLOR_SWATCHES, type ColorKeyword } from "@/lib/colorExtractor";
import { useLocale } from "@/contexts/LocaleContext";
import { cn } from "@/lib/utils";

export type PriceBucket = "under50" | "50to100" | "100to200" | "over200";

export type PriceBucketDef = {
  key: PriceBucket;
  label: React.ReactNode;
  count: number;
};

export type ColorFacet = {
  color: ColorKeyword;
  count: number;
};

type Props = {
  priceBuckets: PriceBucketDef[];
  colorFacets: ColorFacet[];
  selectedPriceBucket: PriceBucket | null;
  selectedColors: string[];
  onPriceBucketChange: (bucket: PriceBucket | null) => void;
  onColorToggle: (color: string) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
};

const MAX_COLORS_SHOWN = 5;

export function ShopFilters({
  priceBuckets,
  colorFacets,
  selectedPriceBucket,
  selectedColors,
  onPriceBucketChange,
  onColorToggle,
  onClear,
  hasActiveFilters,
}: Props) {
  const { t } = useLocale();
  const [showAllColors, setShowAllColors] = useState(false);

  const visibleColors = showAllColors ? colorFacets : colorFacets.slice(0, MAX_COLORS_SHOWN);

  return (
    <div className="space-y-6">
      {priceBuckets.length > 0 && (
        <div>
          <h3 className="font-serif text-lg mb-4">{t("shop.filter.priceTitle")}</h3>
          <ul className="space-y-2">
            {priceBuckets.map((bucket) => {
              const isSelected = selectedPriceBucket === bucket.key;
              return (
                <li key={bucket.key}>
                  <button
                    type="button"
                    onClick={() => onPriceBucketChange(isSelected ? null : bucket.key)}
                    className={cn(
                      "flex items-center justify-between w-full text-sm transition-colors text-left",
                      isSelected
                        ? "font-medium text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    data-testid={`filter-price-${bucket.key}`}
                  >
                    <span>{bucket.label}</span>
                    <span className="text-xs opacity-60 ml-2">({bucket.count})</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {colorFacets.length > 0 && (
        <div>
          <h3 className="font-serif text-lg mb-4">{t("shop.filter.colorTitle")}</h3>
          <ul className="space-y-2.5">
            {visibleColors.map(({ color, count }) => {
              const isSelected = selectedColors.includes(color);
              const swatchColor = COLOR_SWATCHES[color as ColorKeyword];
              return (
                <li key={color}>
                  <button
                    type="button"
                    onClick={() => onColorToggle(color)}
                    className={cn(
                      "flex items-center gap-2.5 w-full text-sm transition-colors",
                      isSelected
                        ? "font-medium text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    data-testid={`filter-color-${color}`}
                  >
                    <span
                      className="w-4 h-4 rounded-full shrink-0 border border-border"
                      style={{ backgroundColor: swatchColor }}
                    />
                    <span className="capitalize">{t(`shop.color.${color}`)}</span>
                    <span className="text-xs opacity-60 ml-auto">({count})</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {colorFacets.length > MAX_COLORS_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAllColors((v) => !v)}
              className="mt-3 text-xs text-primary hover:underline flex items-center gap-1"
              data-testid="button-colors-toggle"
            >
              {showAllColors ? (
                <>
                  {t("shop.filter.showLess")} <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  {t("shop.filter.showMore")} <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          )}
        </div>
      )}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          data-testid="button-clear-price-color-filters"
        >
          <X className="w-3.5 h-3.5" />
          {t("shop.filter.clearFilters")}
        </button>
      )}
    </div>
  );
}
