import { Elements, useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import type { Stripe, StripeElements, StripeElementsOptions } from "@stripe/stripe-js";
import { useEffect } from "react";
import { StripeCardFields, type SavedPaymentMethod } from "@/components/StripeCardFields";

type InnerProps = {
  onStripeReady: (stripe: Stripe | null, elements: StripeElements | null) => void;
  showCardFields: boolean;
  cardError: string | null;
  disabled: boolean;
  isAuthenticated?: boolean;
  saveCard?: boolean;
  onSaveCardChange?: (v: boolean) => void;
  savedPaymentMethods?: SavedPaymentMethod[];
  selectedSavedCardId?: string | null;
  onSelectSavedCard?: (id: string | null) => void;
  onRemoveSavedCard?: (id: string) => void;
  /** When true, renders <PaymentElement> (supports cards + Klarna + wallets) instead of split card fields. */
  usePaymentElement?: boolean;
};

function StripeInner({
  onStripeReady,
  showCardFields,
  cardError,
  disabled,
  isAuthenticated,
  saveCard,
  onSaveCardChange,
  savedPaymentMethods,
  selectedSavedCardId,
  onSelectSavedCard,
  onRemoveSavedCard,
  usePaymentElement,
}: InnerProps) {
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    onStripeReady(stripe, elements);
  }, [stripe, elements, onStripeReady]);

  if (!showCardFields) return null;

  if (usePaymentElement) {
    return (
      <StripeCardFields
        error={cardError}
        disabled={disabled}
        isAuthenticated={isAuthenticated}
        saveCard={saveCard}
        onSaveCardChange={onSaveCardChange}
        savedPaymentMethods={savedPaymentMethods}
        selectedSavedCardId={selectedSavedCardId}
        onSelectSavedCard={onSelectSavedCard}
        onRemoveSavedCard={onRemoveSavedCard}
        usePaymentElement
      />
    );
  }

  return (
    <StripeCardFields
      error={cardError}
      disabled={disabled}
      isAuthenticated={isAuthenticated}
      saveCard={saveCard}
      onSaveCardChange={onSaveCardChange}
      savedPaymentMethods={savedPaymentMethods}
      selectedSavedCardId={selectedSavedCardId}
      onSelectSavedCard={onSelectSavedCard}
      onRemoveSavedCard={onRemoveSavedCard}
    />
  );
}

type Props = InnerProps & {
  stripePromise: Promise<Stripe | null> | null;
  /** Estimated payment amount in minor units — passed to Elements for deferred-intent mode. */
  paymentAmount?: number;
  /** ISO 4217 currency code (lowercase) — required when paymentAmount is set. */
  paymentCurrency?: string;
};

export function StripeCheckoutSection({
  stripePromise,
  onStripeReady,
  showCardFields,
  cardError,
  disabled,
  isAuthenticated,
  saveCard,
  onSaveCardChange,
  savedPaymentMethods,
  selectedSavedCardId,
  onSelectSavedCard,
  onRemoveSavedCard,
  usePaymentElement,
  paymentAmount,
  paymentCurrency,
}: Props) {
  // When both paymentAmount and paymentCurrency are provided, use Stripe's
  // deferred-intent mode: Elements is initialized without a clientSecret.
  // The PaymentElement renders the shopper's available payment methods
  // (cards, Klarna, etc.). The PI is created at submit time and the
  // clientSecret is passed to stripe.confirmPayment() then.
  const options: StripeElementsOptions =
    usePaymentElement && paymentAmount && paymentCurrency
      ? {
          mode: "payment" as const,
          amount: Math.max(50, paymentAmount), // 50 minor units minimum per Stripe
          currency: paymentCurrency.toLowerCase(),
          // Restrict to card only — prevents SEPA, Revolut, Google Pay etc.
          // from appearing as sub-options inside the card tile.
          payment_method_types: ["card"],
          locale: "auto",
          appearance: {
            theme: "stripe",
            variables: {
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSizeBase: "14px",
              colorPrimary: "#0d9488",
              borderRadius: "8px",
            },
          },
        }
      : { locale: "auto" };

  return (
    <Elements stripe={stripePromise} options={options}>
      <StripeInner
        onStripeReady={onStripeReady}
        showCardFields={showCardFields}
        cardError={cardError}
        disabled={disabled}
        isAuthenticated={isAuthenticated}
        saveCard={saveCard}
        onSaveCardChange={onSaveCardChange}
        savedPaymentMethods={savedPaymentMethods}
        selectedSavedCardId={selectedSavedCardId}
        onSelectSavedCard={onSelectSavedCard}
        onRemoveSavedCard={onRemoveSavedCard}
        usePaymentElement={usePaymentElement}
      />
    </Elements>
  );
}
