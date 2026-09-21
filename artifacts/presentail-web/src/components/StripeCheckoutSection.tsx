import { Elements, useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import type { Stripe, StripeElements, StripeElementsOptions } from "@stripe/stripe-js";
import { useEffect } from "react";
import { StripeCardFields, type SavedPaymentMethod } from "@/components/StripeCardFields";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

export type StripeInitializationStatus = "idle" | "loading" | "ready" | "failed";
export type StripeInitializationFailureReason =
  | "pending_timeout"
  | "rejected_load"
  | "null_result";

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
  /** Called when the <PaymentElement> is ready for interaction (usePaymentElement=true only). */
  onPaymentElementReady?: (ready: boolean) => void;
  initializationStatus: StripeInitializationStatus;
  initializationFailure?: StripeInitializationFailureReason | null;
  onRetryInitialization?: () => void;
  /** Show the status notice for a selected wallet while fields stay hidden. */
  showInitializationStatus?: boolean;
};

function StripeInitializationNotice({
  status,
  onRetry,
}: {
  status: StripeInitializationStatus;
  onRetry?: () => void;
}) {
  const { t } = useLocale();

  if (status === "failed") {
    return (
      <div
        role="alert"
        data-testid="stripe-initialization-failed"
        className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
      >
        <p className="text-destructive">{t("checkout.stripe.initializationFailed")}</p>
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onRetry}
            data-testid="button-retry-stripe"
          >
            {t("checkout.stripe.retryInitialization")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      role="status"
      data-testid="stripe-initialization-loading"
      className="mt-4 flex items-center gap-2 rounded-lg border border-input bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {t("checkout.stripe.initializing")}
    </div>
  );
}

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
  onPaymentElementReady,
  initializationStatus,
  initializationFailure,
  onRetryInitialization,
  showInitializationStatus,
}: InnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useLocale();

  useEffect(() => {
    onStripeReady(stripe, elements);
  }, [stripe, elements, onStripeReady]);

  if (!showCardFields && !showInitializationStatus) return null;

  if (initializationStatus !== "ready" || !stripe) {
    return (
      <div
        role="status"
        data-testid="stripe-initialization-loading"
        className="mt-4 flex items-center gap-2 rounded-lg border border-input bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("checkout.stripe.initializing")}
      </div>
    );
  }

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
        onPaymentElementReady={onPaymentElementReady}
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
  // onPaymentElementReady is inherited from InnerProps
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
  onPaymentElementReady,
  paymentAmount,
  paymentCurrency,
  initializationStatus,
  initializationFailure,
  onRetryInitialization,
  showInitializationStatus = showCardFields,
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
    <>
      {showInitializationStatus && initializationStatus !== "ready" ? (
        <StripeInitializationNotice status={initializationStatus} onRetry={onRetryInitialization} />
      ) : showCardFields || showInitializationStatus ? (
        <Elements stripe={stripePromise} options={options}>
          <StripeInner
            onStripeReady={onStripeReady}
            showCardFields={showCardFields}
            showInitializationStatus={showInitializationStatus}
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
            onPaymentElementReady={onPaymentElementReady}
            initializationStatus={initializationStatus}
            initializationFailure={initializationFailure}
            onRetryInitialization={onRetryInitialization}
          />
        </Elements>
      ) : null}
    </>
  );
}
