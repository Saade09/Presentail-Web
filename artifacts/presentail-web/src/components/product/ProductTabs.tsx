import { useState } from "react";
import { Flower2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  description: string;
  bouquetIncludes: string[];
  careTips: string[];
};

type Tab = "description" | "care";

export function ProductTabs({ description, bouquetIncludes, careTips }: Props) {
  const [tab, setTab] = useState<Tab>("description");

  return (
    <div className="mt-12" data-testid="product-tabs">
      <div className="flex gap-8 border-b border-border">
        {(
          [
            { id: "description", label: "Description" },
            { id: "care", label: "Care Tips" },
          ] as const
        ).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "py-3 text-sm font-semibold uppercase tracking-[0.14em] -mb-px border-b-2",
                active
                  ? "text-foreground border-foreground"
                  : "text-muted-foreground border-transparent hover:text-foreground/80",
              )}
              data-testid={`product-tab-${t.id}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="pt-6">
        {tab === "description" ? (
          <div className="space-y-5">
            <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
              {description}
            </p>
            {bouquetIncludes.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-foreground font-semibold mb-3">
                  Bouquet Includes:
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
                <Flower2 className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                <span className="flex-1 leading-6">{c}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
