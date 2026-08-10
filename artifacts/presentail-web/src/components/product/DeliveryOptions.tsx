import type { ReactNode } from "react";
import { Calendar, CircleCheck, Circle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";

export type DeliveryChoice = "express" | "scheduled";

type Props = {
  value: DeliveryChoice;
  onSelectExpress: () => void;
  onSelectScheduled: () => void;
  expressLabel: string;
  /** Second subtitle line on the express card — destination-local ETA, e.g. "Estimated by 1:30 PM Lebanon time". */
  expressEtaLine?: string | null;
  expressAvailable?: boolean;
  expressUnavailableLabel?: string;
  scheduledSubtitle?: string;
  /** Right-side fee label for the express card (e.g. "$24 total"). */
  expressFeeLabel?: string;
  /** Secondary line under the express fee label (e.g. "$9 delivery + $15 express"). */
  expressFeeSubLabel?: string;
  /** When true the express card fee is styled in primary/green. */
  expressIsFree?: boolean;
  /** Right-side fee label for the scheduled card (e.g. "$9"). */
  scheduledFeeLabel?: string;
  /** Secondary line under the scheduled fee label (e.g. "Standard delivery"). */
  scheduledFeeSubLabel?: string;
  /** When true the scheduled card fee is styled in primary/green. */
  scheduledIsFree?: boolean;
};

export function DeliveryOptions({
  value,
  onSelectExpress,
  onSelectScheduled,
  expressLabel,
  expressEtaLine,
  expressAvailable = true,
  expressUnavailableLabel,
  scheduledSubtitle,
  expressFeeLabel,
  expressFeeSubLabel,
  expressIsFree,
  scheduledFeeLabel,
  scheduledFeeSubLabel,
  scheduledIsFree,
}: Props) {
  const { t } = useLocale();
  if (!expressAvailable) return null;
  return (
    <div className="space-y-3 lg:space-y-2" data-testid="delivery-options">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {t("product.delivery.whenShouldItArrive")}
      </p>

      {expressAvailable && (
        <>
          <DeliveryRow
            active={value === "express"}
            onClick={onSelectExpress}
            icon={<Zap className="w-4 h-4" />}
            title={t("checkout.expressDelivery")}
            subtitle={expressLabel}
            subtitleExtra={expressEtaLine ?? undefined}
            feeLabel={expressFeeLabel}
            feeSubLabel={expressFeeSubLabel}
            isFree={expressIsFree}
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
        feeLabel={scheduledFeeLabel}
        feeSubLabel={scheduledFeeSubLabel}
        isFree={scheduledIsFree}
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
  subtitleExtra,
  feeLabel,
  feeSubLabel,
  isFree,
  testId,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  /** Optional second subtitle line (e.g. destination-local ETA for express). */
  subtitleExtra?: string;
  feeLabel?: string;
  feeSubLabel?: string;
  isFree?: boolean;
  testId?: string;
  disabled?: boolean;
}) {
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
        <span className="block text-xs text-muted-foreground mt-0.5 whitespace-normal">
          {subtitle}
        </span>
        {subtitleExtra && (
          <span className="block text-xs text-muted-foreground mt-0.5 whitespace-normal">
            {subtitleExtra}
          </span>
        )}
      </span>
      {feeLabel && (
        <span className="shrink-0 text-right">
          <span
            className={cn(
              "block text-[11px] font-semibold whitespace-nowrap",
              isFree ? "text-primary" : "text-foreground",
            )}
          >
            {feeLabel}
          </span>
          {feeSubLabel && (
            <span className="block max-w-[110px] ml-auto text-[11px] text-muted-foreground leading-tight mt-0.5 whitespace-normal">
              {feeSubLabel}
            </span>
          )}
        </span>
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
