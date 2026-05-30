import { Calendar, CircleCheck, Circle, Info, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";

export type DeliveryChoice = "express" | "scheduled";

type Props = {
  value: DeliveryChoice;
  onSelectExpress: () => void;
  onSelectScheduled: () => void;
  expressLabel: string;
  expressAvailable?: boolean;
  expressUnavailableLabel?: string;
  scheduledSubtitle?: string;
};

export function DeliveryOptions({
  value,
  onSelectExpress,
  onSelectScheduled,
  expressLabel,
  expressAvailable = true,
  expressUnavailableLabel,
  scheduledSubtitle,
}: Props) {
  const { t } = useLocale();
  return (
    <div className="space-y-3" data-testid="delivery-options">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {t("product.deliveryOptions")}
      </p>

      <DeliveryRow
        active={value === "express"}
        onClick={onSelectExpress}
        disabled={!expressAvailable}
        icon={<Zap className="w-4 h-4" />}
        title={t("checkout.expressDelivery")}
        subtitle={
          expressAvailable
            ? expressLabel
            : expressUnavailableLabel ?? t("checkout.expressUnavailable")
        }
        showInfo
        testId="delivery-option-express"
      />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] tracking-[0.2em] text-muted-foreground">OR</span>
        <div className="h-px flex-1 bg-border" />
      </div>

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
  testId,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  showInfo?: boolean;
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
        "w-full flex items-center gap-3 rounded-2xl border bg-card text-left p-4 transition-colors",
        active ? "border-primary bg-secondary/60" : "border-border hover:border-foreground/20",
        disabled && "opacity-50 cursor-not-allowed hover:border-border",
      )}
      data-testid={testId}
    >
      <span
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
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
      {showInfo && (
        <Info className="w-4 h-4 text-muted-foreground shrink-0" />
      )}
      {active ? (
        <CircleCheck className="w-5 h-5 text-gold shrink-0" />
      ) : (
        <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0" />
      )}
    </button>
  );
}
