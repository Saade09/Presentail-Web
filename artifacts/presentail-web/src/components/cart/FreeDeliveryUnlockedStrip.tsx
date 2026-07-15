import { CheckCircle } from "lucide-react";
import { FormattedPrice } from "@/components/FormattedPrice";
import { useLocale } from "@/contexts/LocaleContext";

type Props = {
  /**
   * Original city delivery fee in USD that was waived (standard mode).
   * When provided and > 0 and expressSelected is false, shows
   * "You saved {amount} on delivery."
   */
  savedAmountUsd?: number;
  /**
   * When true the shopper selected Express — standard threshold was still met
   * but the express surcharge applies. Shows alternate explanatory copy.
   */
  expressSelected?: boolean;
};

export function FreeDeliveryUnlockedStrip({ savedAmountUsd, expressSelected }: Props) {
  const { t } = useLocale();

  return (
    <div
      className="rounded-xl px-4 py-3 flex items-start gap-3"
      style={{ backgroundColor: "hsl(var(--primary) / 0.08)" }}
      role="status"
      aria-live="polite"
      data-testid="free-delivery-unlocked-strip"
    >
      <CheckCircle
        className="w-5 h-5 shrink-0 mt-0.5"
        style={{ color: "hsl(var(--primary))" }}
        role="img"
        aria-label={t("checkout.freeDelivery.unlocked.iconLabel")}
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug" style={{ color: "hsl(var(--primary))" }}>
          {t("checkout.freeDelivery.unlocked.headline")}
        </p>
        {expressSelected ? (
          <p className="text-xs mt-0.5" style={{ color: "hsl(var(--primary) / 0.75)" }}>
            {t("checkout.freeDelivery.unlocked.expressNote")}
          </p>
        ) : savedAmountUsd != null && savedAmountUsd > 0 ? (
          <p className="text-xs mt-0.5" style={{ color: "hsl(var(--primary) / 0.75)" }}>
            {t("checkout.freeDelivery.unlocked.saved.prefix")}
            <FormattedPrice usdValue={savedAmountUsd} />
            {t("checkout.freeDelivery.unlocked.saved.suffix")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
