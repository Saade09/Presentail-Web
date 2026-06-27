import { Elements, useStripe, useElements } from "@stripe/react-stripe-js";
import type { Stripe, StripeElements } from "@stripe/stripe-js";
import { useEffect } from "react";
import { StripeCardFields } from "@/components/StripeCardFields";

type InnerProps = {
  onStripeReady: (stripe: Stripe | null, elements: StripeElements | null) => void;
  showCardFields: boolean;
  cardError: string | null;
  disabled: boolean;
};

function StripeInner({ onStripeReady, showCardFields, cardError, disabled }: InnerProps) {
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    onStripeReady(stripe, elements);
  }, [stripe, elements, onStripeReady]);

  if (!showCardFields) return null;
  return <StripeCardFields error={cardError} disabled={disabled} />;
}

type Props = InnerProps & {
  stripePromise: Promise<Stripe | null> | null;
};

export function StripeCheckoutSection({ stripePromise, onStripeReady, showCardFields, cardError, disabled }: Props) {
  return (
    <Elements stripe={stripePromise} options={{ locale: "auto" }}>
      <StripeInner
        onStripeReady={onStripeReady}
        showCardFields={showCardFields}
        cardError={cardError}
        disabled={disabled}
      />
    </Elements>
  );
}
