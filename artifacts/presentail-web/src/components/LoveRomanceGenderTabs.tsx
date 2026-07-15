import { useRef, useEffect, useCallback } from "react";
import { LOVE_ROMANCE_GENDERS } from "@/lib/loveRomanceGender";
import { useLocale } from "@/contexts/LocaleContext";
import { cn } from "@/lib/utils";

type Props = {
  activeKey: string;
  onSelect: (key: string) => void;
};

export function LoveRomanceGenderTabs({ activeKey, onSelect }: Props) {
  const { t, language } = useLocale();
  const dir = language === "ar" ? "rtl" : "ltr";
  const scrollRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const tabs = [{ key: "all", labelKey: "shop.loveRomanceFor.all" }, ...LOVE_ROMANCE_GENDERS];

  useEffect(() => {
    const el = chipRefs.current.get(activeKey);
    if (el && scrollRef.current) {
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }, [activeKey]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const keys = tabs.map((t) => t.key);
      const currentIndex = keys.indexOf(activeKey);
      let nextIndex = currentIndex;

      const isRtl = dir === "rtl";
      if (e.key === "ArrowRight") {
        nextIndex = isRtl
          ? (currentIndex - 1 + keys.length) % keys.length
          : (currentIndex + 1) % keys.length;
      } else if (e.key === "ArrowLeft") {
        nextIndex = isRtl
          ? (currentIndex + 1) % keys.length
          : (currentIndex - 1 + keys.length) % keys.length;
      } else if (e.key === "Home") {
        nextIndex = 0;
      } else if (e.key === "End") {
        nextIndex = keys.length - 1;
      } else {
        return;
      }

      e.preventDefault();
      const nextKey = keys[nextIndex];
      onSelect(nextKey);
      chipRefs.current.get(nextKey)?.focus();
    },
    [activeKey, tabs, onSelect, dir],
  );

  return (
    <div className="mb-6">
      <p className="text-sm font-medium text-foreground mb-3">
        {t("shop.loveRomanceFor.label")}
      </p>
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          role="tablist"
          aria-label={t("shop.loveRomanceFor.label")}
          dir={dir}
          onKeyDown={handleKeyDown}
        >
          {tabs.map((tab) => {
            const isActive = activeKey === tab.key;
            return (
              <button
                key={tab.key}
                ref={(el) => {
                  if (el) chipRefs.current.set(tab.key, el);
                  else chipRefs.current.delete(tab.key);
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onSelect(tab.key)}
                className={cn(
                  "shrink-0 px-4 rounded-full border text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-foreground bg-background hover:border-primary hover:text-primary",
                )}
                data-testid={`love-romance-tab-${tab.key}`}
              >
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>
        {/* Trailing-edge fade mask — flips side in RTL */}
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 w-12 from-background to-transparent",
            dir === "rtl"
              ? "left-0 bg-gradient-to-r"
              : "right-0 bg-gradient-to-l",
          )}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
