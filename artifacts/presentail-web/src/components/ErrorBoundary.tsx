import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "wouter";

type State = { hasError: boolean };

type Props = {
  children: ReactNode;
  fallback: ReactNode;
};

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] caught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Hardcoded English strings are intentional: the error boundary is a last-resort
// fallback that must work even when the LocaleProvider itself has crashed.
const CHECKOUT_TITLE = "Something went wrong"; // i18n-ignore
const CHECKOUT_BODY = "We couldn't load the checkout page. Please go back to your cart and try again."; // i18n-ignore
const CHECKOUT_CTA = "Back to cart"; // i18n-ignore
const ROUTE_TITLE = "Something went wrong"; // i18n-ignore
const ROUTE_BODY = "An unexpected error occurred. Please try refreshing the page."; // i18n-ignore
const ROUTE_CTA = "Refresh page"; // i18n-ignore

function CheckoutFallback() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center"
      style={{ backgroundColor: "#f4f4f5" }}
      data-testid="checkout-error-boundary"
    >
      <div className="max-w-sm">
        <h1 className="text-2xl font-serif text-[#00414e] mb-3">
          {CHECKOUT_TITLE}
        </h1>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {CHECKOUT_BODY}
        </p>
        <Link
          href="/cart"
          className="inline-flex items-center justify-center rounded-xl bg-[#00414e] px-8 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          data-testid="link-back-to-cart-error"
        >
          {CHECKOUT_CTA}
        </Link>
      </div>
    </div>
  );
}

function RouteFallback() {
  return (
    <div
      className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-6 text-center"
      data-testid="route-error-boundary"
    >
      <div className="max-w-sm">
        <h1 className="text-2xl font-serif mb-3">
          {ROUTE_TITLE}
        </h1>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {ROUTE_BODY}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center rounded-xl bg-foreground px-8 py-3 text-sm font-semibold text-background hover:opacity-90 transition-opacity"
          data-testid="button-reload-page"
        >
          {ROUTE_CTA}
        </button>
      </div>
    </div>
  );
}

export function CheckoutErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fallback={<CheckoutFallback />}>
      {children}
    </ErrorBoundary>
  );
}

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fallback={<RouteFallback />}>
      {children}
    </ErrorBoundary>
  );
}
