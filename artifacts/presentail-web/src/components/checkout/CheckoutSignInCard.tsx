import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { useAuth } from "@/contexts/AuthContext";
import type { ShimUser } from "@/contexts/AuthContext";
import { trackWebEvent } from "@/lib/analytics";
import {
  signInWithApplePopup,
  signInWithGooglePopup,
  type OAuthSignInResult,
} from "@/lib/oauthPopup";
import { EmailSignInModal } from "@/components/checkout/EmailSignInModal";

/**
 * Compact optional sign-in card shown on checkout (above Recipient Details)
 * for signed-out shoppers when the frictionless-checkout flag is on.
 *
 * Never blocks guest checkout: the delivery form below stays fully usable,
 * OAuth failures/cancellations surface as a non-blocking inline message, and
 * the card simply disappears once the shopper signs in.
 */

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.418 2.2-1.253 3.06-.87.91-2.06 1.6-3.24 1.51-.14-1.15.42-2.35 1.19-3.13.87-.9 2.28-1.55 3.3-1.44zM20.94 17.06c-.55 1.27-.82 1.83-1.53 2.95-1 1.56-2.4 3.5-4.14 3.51-1.55.02-1.95-1.02-4.05-1.01-2.1.01-2.54 1.04-4.09 1.02-1.74-.02-3.07-1.77-4.06-3.33C.29 15.86-.02 11.11 1.6 8.61c1.15-1.79 2.96-2.84 4.66-2.84 1.73 0 2.82 1.02 4.25 1.02 1.39 0 2.24-1.02 4.24-1.02 1.52 0 3.12.83 4.27 2.25-3.75 2.06-3.14 7.4 1.92 9.04z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.85-.07-1.46-.22-2.1H12v3.99h6.63c-.14 1.06-.86 2.66-2.47 3.74l-.02.15 3.58 2.77.25.03c2.28-2.11 3.52-5.2 3.52-8.58z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.81-2.95c-1.01.7-2.37 1.2-4.14 1.2-3.17 0-5.86-2.09-6.82-4.98l-.14.01-3.72 2.88-.05.14C3.25 21.31 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.18 14.37a7.36 7.36 0 0 1-.4-2.37c0-.83.15-1.63.38-2.37l-.01-.16-3.77-2.93-.12.06A11.96 11.96 0 0 0 0 12c0 1.93.47 3.76 1.27 5.4l3.91-3.03z" />
      <path fill="#EA4335" d="M12 4.64c2.25 0 3.77.97 4.63 1.79l3.38-3.3C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.27 6.6l3.9 3.03C6.14 6.73 8.83 4.64 12 4.64z" />
    </svg>
  );
}

export function CheckoutSignInCard({
  onContinueAsGuest,
}: {
  /** Invoked when the shopper picks "Continue as Guest" inside the email
   *  modal — Checkout uses it to focus the first incomplete form field. */
  onContinueAsGuest?: () => void;
}) {
  const { t } = useLocale();
  const { login } = useAuth();
  const [oauthBusy, setOauthBusy] = useState<"apple" | "google" | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const emailTriggerRef = useRef<HTMLButtonElement | null>(null);

  const handleSignedIn = (token: string, user: ShimUser, provider: string) => {
    // Updates AuthContext state in place — no navigation, no remount. The
    // checkout page's own effects prefill only-empty sender/recipient fields.
    login(token, user, provider);
  };

  const runOAuth = async (
    method: "apple" | "google",
    fn: () => Promise<OAuthSignInResult>,
  ) => {
    if (oauthBusy) return;
    setInlineError(null);
    trackWebEvent({ type: "checkout_sign_in_method_selected", properties: { method } });
    trackWebEvent({ type: "checkout_auth_started", properties: { method } });
    setOauthBusy(method);
    try {
      const result = await fn();
      if (result.ok) {
        trackWebEvent({ type: "checkout_auth_completed", properties: { method } });
        handleSignedIn(result.token, result.user, result.provider);
        return;
      }
      if (result.cancelled) {
        trackWebEvent({ type: "checkout_auth_cancelled", properties: { method } });
        return;
      }
      trackWebEvent({
        type: "checkout_auth_failed",
        properties: { method, error_category: result.errorCategory },
      });
      setInlineError(t("checkoutSignIn.error"));
    } finally {
      setOauthBusy(null);
    }
  };

  const buttonClasses =
    "h-11 rounded-full border border-primary/25 bg-white text-primary hover:bg-primary/5 flex items-center justify-center gap-2 text-sm font-medium";

  return (
    <section
      aria-label={t("checkoutLogin.title")}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:p-6 mb-5 max-md:mb-3"
      data-testid="card-checkout-signin"
    >
      <h3 className="font-serif text-lg lg:text-xl font-medium text-primary mb-1">
        {t("checkoutLogin.title")}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">{t("checkoutSignIn.subtitle")}</p>

      {inlineError ? (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          data-testid="text-checkout-signin-error"
        >
          {inlineError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <Button
          type="button"
          variant="outline"
          className={buttonClasses}
          onClick={() => void runOAuth("apple", signInWithApplePopup)}
          disabled={oauthBusy !== null}
          data-testid="button-checkout-signin-apple"
        >
          <AppleLogo />
          {oauthBusy === "apple" ? t("checkout.processing") : t("auth.continueApple")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={buttonClasses}
          onClick={() => void runOAuth("google", signInWithGooglePopup)}
          disabled={oauthBusy !== null}
          data-testid="button-checkout-signin-google"
        >
          <GoogleLogo />
          {oauthBusy === "google" ? t("checkout.processing") : t("auth.continueGoogle")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={buttonClasses}
          ref={emailTriggerRef}
          onClick={() => {
            trackWebEvent({
              type: "checkout_sign_in_method_selected",
              properties: { method: "email" },
            });
            setInlineError(null);
            setEmailModalOpen(true);
          }}
          disabled={oauthBusy !== null}
          data-testid="button-checkout-signin-email"
        >
          {t("checkoutSignIn.email")}
        </Button>
      </div>

      <p className="mt-3 text-sm text-muted-foreground" data-testid="text-checkout-signin-guest-hint">
        {t("checkoutSignIn.guestHint")}
      </p>

      <EmailSignInModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        onSuccess={(token, user) => {
          setEmailModalOpen(false);
          handleSignedIn(token, user, "password");
        }}
        onContinueAsGuest={() => {
          setEmailModalOpen(false);
          onContinueAsGuest?.();
        }}
        onBack={() => {
          setEmailModalOpen(false);
          // Radix returns focus to the trigger automatically; make it explicit
          // so "back to other sign-in options" reliably lands on the card.
          requestAnimationFrame(() => emailTriggerRef.current?.focus());
        }}
      />
    </section>
  );
}
