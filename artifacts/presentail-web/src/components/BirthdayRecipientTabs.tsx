import { useRef } from "react";
import { BIRTHDAY_RECIPIENTS } from "@/lib/birthdayRecipients";
import { useLocale } from "@/contexts/LocaleContext";
import { cn } from "@/lib/utils";

type Props = {
  activeKey: string;
  onSelect: (key: string) => void;
};

export function BirthdayRecipientTabs({ activeKey, onSelect }: Props) {
  const { t } = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);

  const tabs = [{ key: "all", labelKey: "shop.birthdayFor.all" }, ...BIRTHDAY_RECIPIENTS];

  return (
    <div className="mb-6">
      <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3 font-medium">
        {t("shop.birthdayFor.label")}
      </p>
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        role="tablist"
        aria-label={t("shop.birthdayFor.label")}
      >
        {tabs.map((tab) => {
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
              data-testid={`birthday-tab-${tab.key}`}
            >
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
