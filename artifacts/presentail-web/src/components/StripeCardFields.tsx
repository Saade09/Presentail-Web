import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  PaymentElement,
  useStripe,
} from "@stripe/react-stripe-js";
import type { StripeCardNumberElementOptions } from "@stripe/stripe-js";
import { useEffect, useRef } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { X, CreditCard } from "lucide-react";

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

export type SavedPaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

type Props = {
  error?: string | null;
  disabled?: boolean;
  isAuthenticated?: boolean;
  saveCard?: boolean;
  onSaveCardChange?: (v: boolean) => void;
  savedPaymentMethods?: SavedPaymentMethod[];
  selectedSavedCardId?: string | null;
  onSelectSavedCard?: (id: string | null) => void;
  onRemoveSavedCard?: (id: string) => void;
  /**
   * When true, renders Stripe's unified <PaymentElement> instead of the
   * individual split card fields. PaymentElement supports cards, Klarna, and
   * any other payment methods enabled for the account and payer country.
   * Requires the parent <Elements> to be initialized with deferred-intent mode
   * (mode: "payment", amount, currency) — no clientSecret at mount time.
   */
  usePaymentElement?: boolean;
  /**
   * Called when the <PaymentElement> finishes mounting and is ready for input.
   * Only relevant when usePaymentElement is true. Used by the submit handler to
   * guard elements.submit() against calling it before the element is mounted.
   */
  onPaymentElementReady?: (ready: boolean) => void;
};

function cardBrandIcon(brand: string): string {
  const b = brand.toLowerCase();
  if (b === "visa") return "Visa";
  if (b === "mastercard") return "Mastercard";
  if (b === "amex") return "Amex";
  if (b === "discover") return "Discover";
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

export function StripeCardFields({
  error,
  disabled,
  isAuthenticated,
  saveCard,
  onSaveCardChange,
  savedPaymentMethods,
  selectedSavedCardId,
  onSelectSavedCard,
  onRemoveSavedCard,
  usePaymentElement,
  onPaymentElementReady,
}: Props) {
  const { t } = useLocale();
  const stripe = useStripe();
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [error]);

  if (!stripe) {
    return (
      <div className="mt-4 rounded-lg border border-input bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {t("checkout.stripe.notConfigured")}
      </div>
    );
  }

  const hasSavedCards = (savedPaymentMethods?.length ?? 0) > 0;

  return (
    <div className="space-y-3 mt-4">
      {/* Saved card picker — only shown for authenticated shoppers with at least one saved card */}
      {isAuthenticated && hasSavedCards && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("checkout.stripe.savedCards")}</p>
          {savedPaymentMethods!.map((pm) => {
            const isSelected = selectedSavedCardId === pm.id;
            return (
              <div
                key={pm.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-input bg-background hover:bg-muted/30"
                }`}
                onClick={() => onSelectSavedCard?.(isSelected ? null : pm.id)}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? "border-primary" : "border-muted-foreground/40"}`}>
                    {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">
                    <span className="font-medium">{cardBrandIcon(pm.brand)}</span>
                    {" ····"} {pm.last4}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {pm.expMonth.toString().padStart(2, "0")}/{pm.expYear.toString().slice(-2)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSavedCard?.(pm.id);
                  }}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                  aria-label={t("checkout.stripe.removeSavedCard")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}

          {/* Divider before card fields when no saved card is selected */}
          {!selectedSavedCardId && (
            <p className="text-xs text-muted-foreground pt-1">{t("checkout.stripe.orEnterNewCard")}</p>
          )}
        </div>
      )}

      {/* Payment fields — hidden when a saved card is selected */}
      {!selectedSavedCardId && (
        <>
          {usePaymentElement ? (
            /* Unified PaymentElement: renders cards, Klarna, and any other
               payment methods enabled for the account + payer country.
               Billing details (name, email, address) are collected inline. */
            <PaymentElement
              options={{
                layout: "accordion",
                defaultValues: { billingDetails: { address: { country: undefined } } },
              }}
              onReady={() => onPaymentElementReady?.(true)}
            />
          ) : (
            /* Legacy split card fields — kept as fallback when PaymentElement
               is not available (e.g. Elements initialized without deferred-intent options). */
            <>
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

              {/* Save card checkbox — only for authenticated shoppers, split-field mode only */}
              {isAuthenticated && (
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveCard ?? false}
                    onChange={(e) => onSaveCardChange?.(e.target.checked)}
                    disabled={disabled}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-sm">{t("checkout.stripe.saveCard")}</span>
                </label>
              )}
            </>
          )}
        </>
      )}

      {error && (
        <div ref={errorRef} className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5" role="alert" data-testid="stripe-card-error">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <p className="text-xs text-destructive/80 mt-0.5">{t("checkout.stripe.cardDeclineHint")}</p>
        </div>
      )}
    </div>
  );
}
