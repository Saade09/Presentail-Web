const METHODS = ["Visa", "Mastercard", "Amex", "Apple Pay", "Google Pay", "PayPal"];

export function PaymentMethods() {
  return (
    <div className="space-y-3" data-testid="payment-methods">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Ways to Pay
      </p>
      <div className="flex flex-wrap gap-2">
        {METHODS.map((m) => (
          <span
            key={m}
            className="inline-flex items-center justify-center min-w-[52px] h-8 px-3 rounded-md border border-border bg-card text-[11px] font-semibold tracking-wide text-foreground"
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
