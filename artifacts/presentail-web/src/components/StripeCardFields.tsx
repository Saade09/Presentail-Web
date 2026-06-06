import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
} from "@stripe/react-stripe-js";
import type { StripeCardNumberElementOptions } from "@stripe/stripe-js";
import { useLocale } from "@/contexts/LocaleContext";

const ELEMENT_STYLE: StripeCardNumberElementOptions["style"] = {
  base: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: "14px",
    color: "#111827",
    "::placeholder": { color: "#9ca3af" },
    iconColor: "#6b7280",
  },
  invalid: { color: "#ef4444", iconColor: "#ef4444" },
};

const FIELD_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm " +
  "ring-offset-background transition-colors " +
  "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2";

type Props = {
  error?: string | null;
  disabled?: boolean;
};

export function StripeCardFields({ error, disabled }: Props) {
  const { t } = useLocale();
  const stripe = useStripe();

  if (!stripe) {
    return (
      <div className="mt-4 rounded-lg border border-input bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {t("checkout.stripe.notConfigured")}
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      <div>
        <label className="text-sm font-medium mb-1.5 block">{t("checkout.stripe.cardNumber")}</label>
        <div className={FIELD_CLASS} style={{ minHeight: "42px", display: "flex", alignItems: "center" }}>
          <CardNumberElement
            options={{ style: ELEMENT_STYLE, showIcon: true, disabled }}
            className="w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium mb-1.5 block">{t("checkout.stripe.expiryDate")}</label>
          <div className={FIELD_CLASS} style={{ minHeight: "42px", display: "flex", alignItems: "center" }}>
            <CardExpiryElement
              options={{ style: ELEMENT_STYLE, disabled }}
              className="w-full"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">CVC</label>
          <div className={FIELD_CLASS} style={{ minHeight: "42px", display: "flex", alignItems: "center" }}>
            <CardCvcElement
              options={{ style: ELEMENT_STYLE, disabled }}
              className="w-full"
            />
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2.5 cursor-not-allowed opacity-50 select-none">
        <input type="checkbox" disabled className="h-4 w-4 accent-primary" />
        <span className="text-sm">{t("checkout.stripe.saveCard")}</span>
        <span className="text-xs text-muted-foreground">{t("checkout.stripe.saveCardSoon")}</span>
      </label>

      {error && (
        <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5" role="alert" data-testid="stripe-card-error">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <p className="text-xs text-destructive/80 mt-0.5">{t("checkout.stripe.cardDeclineHint")}</p>
        </div>
      )}
    </div>
  );
}
