import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { isChunkLoadError, reloadForStaleChunk } from "@/lib/chunkReload";
import { trackEvent } from "@/lib/analytics";

type State = { hasError: boolean; resetKey: string | undefined };

type Props = {
  children: ReactNode;
  fallback: ReactNode;
  resetKey?: string;
  /**
   * When true, caught errors are reported to `checkout_render_error` analytics.
   * Only pass this for CheckoutErrorBoundary so non-checkout route errors are
   * never mislabelled as checkout errors.
   */
  reportErrors?: boolean;
};

// sessionStorage key used to guard against infinite reload loops on hook errors.
const HOOK_ERROR_RELOAD_KEY = "_presentail_hook_err_reload";

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, resetKey: props.resetKey };
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    // When resetKey changes (e.g. the user navigated to a new route), clear
    // the error so the incoming page can render fresh.
    if (props.resetKey !== state.resetKey) {
      return { hasError: false, resetKey: props.resetKey };
    }
    return null;
  }

  static getDerivedStateFromError(_error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const msg = error?.message ?? "";

    // Emit analytics BEFORE any early-return so every caught error is recorded
    // in production.  Scoped to reportErrors=true (CheckoutErrorBoundary only)
    // so non-checkout route errors are never labelled as checkout crashes.
    if (this.props.reportErrors) {
      try {
        trackEvent({
          name: "checkout_render_error",
          surface: "checkout",
          // errorCode carries a compact "ErrorName: truncated message" summary.
          // The full component stack is written to console.error below.
          errorCode: `${(error?.name ?? "Error").slice(0, 32)}: ${msg.slice(0, 120)}`,
        });
      } catch {
        // best-effort — trackEvent must never throw inside componentDidCatch
      }
    }

    // A render-time failure caused by a lazy chunk that could not be fetched
    // (stale index.html after a redeploy, or a flaky-network drop) is
    // recoverable: reload once to pull a fresh index.html + chunk set instead
    // of stranding the user on the error fallback.
    if (isChunkLoadError(error)) {
      reloadForStaleChunk();
      return;
    }

    // Hook-rule violations ("Invalid hook call") and context-not-found errors
    // ("must be used within <Provider>") are a strong signal that the browser
    // loaded a stale cached chunk that references a different module instance
    // than the current provider tree.  A full page reload fetches fresh chunks
    // and resolves the mismatch.  The reload is guarded by sessionStorage so it
    // fires at most once per session, preventing an infinite loop if the error
    // persists after fresh chunks load.
    if (msg.includes("Invalid hook call") || msg.includes("must be used within")) {
      try {
        if (!sessionStorage.getItem(HOOK_ERROR_RELOAD_KEY)) {
          sessionStorage.setItem(HOOK_ERROR_RELOAD_KEY, "1");
          window.location.reload();
          return;
        }
      } catch {
        // sessionStorage unavailable — fall through and show the error boundary
        // rather than risking an unguarded infinite loop.
      }
    }

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
        <h1 className="text-2xl font-serif text-primary mb-3">
          {CHECKOUT_TITLE}
        </h1>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {CHECKOUT_BODY}
        </p>
        <Link
          href="/cart"
          className="inline-flex items-center justify-center rounded-xl bg-primary px-8 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
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

/**
 * Error boundary for the checkout page.  Emits a `checkout_render_error`
 * analytics event on every caught error (before any early-return or reload) so
 * crashes are visible in production even when console.error is not accessible.
 *
 * Hook-rule / context-mismatch errors trigger a one-shot page reload (guarded
 * by sessionStorage) to recover from stale-chunk scenarios where a cached chunk
 * references a different module instance than the live provider tree.
 */
export function CheckoutErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fallback={<CheckoutFallback />} reportErrors>
      {children}
    </ErrorBoundary>
  );
}

/**
 * Wraps route content in an ErrorBoundary that automatically resets whenever
 * the user navigates to a different path. This prevents a "Something went
 * wrong" fallback from persisting after the user clicks away to another page.
 *
 * CheckoutErrorBoundary intentionally does NOT use this pattern — it must stay
 * in error state until the user manually goes back to cart.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  return (
    <ErrorBoundary fallback={<RouteFallback />} resetKey={path}>
      {children}
    </ErrorBoundary>
  );
}
