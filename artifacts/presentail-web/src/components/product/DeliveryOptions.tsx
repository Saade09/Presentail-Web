import { useState } from "react";
import type { ReactNode } from "react";
import { Calendar, CircleCheck, Circle, Info, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type DeliveryChoice = "express" | "scheduled";

type Props = {
  value: DeliveryChoice;
  onSelectExpress: () => void;
  onSelectScheduled: () => void;
  expressLabel: string;
  expressAvailable?: boolean;
  expressUnavailableLabel?: string;
  scheduledSubtitle?: string;
  infoFee?: ReactNode;
};

export function DeliveryOptions({
  value,
  onSelectExpress,
  onSelectScheduled,
  expressLabel,
  expressAvailable = true,
  expressUnavailableLabel,
  scheduledSubtitle,
  infoFee,
}: Props) {
  const { t } = useLocale();
  if (!expressAvailable) return null;
  return (
    <div className="space-y-3 lg:space-y-2" data-testid="delivery-options">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {t("product.deliveryOptions")}
      </p>

      {expressAvailable && (
        <>
          <DeliveryRow
            active={value === "express"}
            onClick={onSelectExpress}
            icon={<Zap className="w-4 h-4" />}
            title={t("checkout.expressDelivery")}
            subtitle={expressLabel}
            showInfo
            infoTitle={t("checkout.expressInfo.title")}
            infoBody={t("checkout.expressInfo.body")}
            infoFee={infoFee}
            testId="delivery-option-express"
          />

        </>
      )}

      <DeliveryRow
        active={value === "scheduled"}
        onClick={onSelectScheduled}
        icon={<Calendar className="w-4 h-4" />}
        title={t("product.scheduleDelivery")}
        subtitle={scheduledSubtitle ?? t("product.scheduledSubtitle")}
        testId="delivery-option-scheduled"
      />
    </div>
  );
}

function DeliveryRow({
  active,
  onClick,
  icon,
  title,
  subtitle,
  showInfo,
  infoTitle,
  infoBody,
  infoFee,
  testId,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  showInfo?: boolean;
  infoTitle?: string;
  infoBody?: string;
  infoFee?: ReactNode;
  testId?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={cn(
        "w-full flex items-center gap-3 rounded-2xl border bg-card text-left p-4 lg:p-3 transition-colors",
        active ? "border-primary bg-secondary/60" : "border-border hover:border-foreground/20",
        disabled && "opacity-50 cursor-not-allowed hover:border-border",
      )}
      data-testid={testId}
    >
      <span
        className={cn(
          "w-9 h-9 lg:w-8 lg:h-8 rounded-full flex items-center justify-center shrink-0",
          active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
        )}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground mt-0.5 truncate">
          {subtitle}
        </span>
      </span>
      {showInfo && infoTitle && infoBody && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <span
              role="button"
              aria-label={infoTitle}
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setOpen((prev) => !prev);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  setOpen((prev) => !prev);
                }
              }}
              className="shrink-0 rounded-full p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
            >
              <Info className="w-4 h-4" />
            </span>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            className="w-64 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-semibold mb-1">{infoTitle}</p>
            <p className="text-muted-foreground leading-relaxed">{infoBody}</p>
            {infoFee && (
              <p className="font-semibold mt-2 text-foreground">{infoFee}</p>
            )}
          </PopoverContent>
        </Popover>
      )}
      {active ? (
        <CircleCheck className="w-5 h-5 text-gold shrink-0" />
      ) : (
        /* contrast-ok: decorative inactive-state radio indicator icon, not text */
        <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0" />
      )}
    </button>
  );
}
