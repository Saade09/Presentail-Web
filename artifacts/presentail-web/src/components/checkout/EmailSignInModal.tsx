import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { trackWebEvent } from "@/lib/analytics";
import type { ShimUser } from "@/contexts/AuthContext";

/**
 * Email-first sign-in modal for the frictionless checkout flow.
 *
 * States:
 *  - "email":    email input + Continue (no password field yet)
 *  - "password": existing account → password step (reuses /api/auth/login)
 *  - "new":      unknown email → offer account creation OR guest, never forcing
 *
 * Reuses the existing /api/auth/web-bridge and /api/auth/login endpoints.
 * Renders as a centered dialog on desktop and a full-width bottom sheet on
 * mobile. Radix Dialog provides dialog semantics, focus trap, Escape/close,
 * and focus return to the trigger.
 */

type ApiAuthResponse = {
  ok: boolean;
  token?: string;
  user?: { id: number; email: string; firstName: string; lastName: string; phone?: string };
  message?: string;
  code?: string;
};

function mapApiUser(u: NonNullable<ApiAuthResponse["user"]>): ShimUser {
  return {
    id: String(u.id),
    email: u.email ?? "",
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    phone: u.phone || undefined,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailSignInModal({
  open,
  onOpenChange,
  onSuccess,
  onContinueAsGuest,
  onBack,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (token: string, user: ShimUser) => void;
  onContinueAsGuest: () => void;
  onBack: () => void;
}) {
  const { t } = useLocale();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"email" | "password" | "new">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const authStartedRef = useRef(false);

  // Reset transient state each time the modal opens (keep the typed email so
  // reopening after an accidental close doesn't lose it).
  useEffect(() => {
    if (open) {
      setStep("email");
      setPassword("");
      setError(null);
      setBusy(false);
      authStartedRef.current = false;
    }
  }, [open]);

  const fireAuthStartedOnce = () => {
    if (authStartedRef.current) return;
    authStartedRef.current = true;
    trackWebEvent({ type: "checkout_auth_started", properties: { method: "email" } });
  };

  const onSubmitEmail = async () => {
    if (busy) return;
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError(t("auth.invalidEmail"));
      return;
    }
    setError(null);
    setBusy(true);
    fireAuthStartedOnce();
    try {
      const res = await fetch("/api/auth/web-bridge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        userExists?: boolean;
        passwordLoginAvailable?: boolean;
      } | null;
      if (!res.ok || !json || json.ok !== true) {
        setError(t("auth.checkFailed"));
        return;
      }
      if (json.userExists === false) {
        setStep("new");
        return;
      }
      // Known email. Social-only accounts have no password; surface the
      // password step anyway with the standard incorrect-password recovery —
      // matching the sign-in page's behaviour, the server rejects with a
      // helpful message for social-only accounts.
      setStep("password");
    } catch {
      setError(t("auth.checkFailed"));
    } finally {
      setBusy(false);
    }
  };

  const onSubmitPassword = async () => {
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = (await res.json()) as ApiAuthResponse;
      if (!res.ok || !data.ok || !data.token || !data.user) {
        const msg = /incorrect_password/i.test(data.code ?? "")
          ? t("auth.incorrectPassword")
          : (data.message ?? t("auth.checkFailed"));
        trackWebEvent({
          type: "checkout_auth_failed",
          properties: { method: "email", error_category: "invalid_credentials" },
        });
        setError(msg);
        return;
      }
      trackWebEvent({ type: "checkout_auth_completed", properties: { method: "email" } });
      onSuccess(data.token, mapApiUser(data.user));
    } catch {
      trackWebEvent({
        type: "checkout_auth_failed",
        properties: { method: "email", error_category: "network" },
      });
      setError(t("auth.checkFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleGuest = () => {
    trackWebEvent({ type: "checkout_continue_as_guest", properties: { source: "email_modal" } });
    onContinueAsGuest();
  };

  const guestButton = (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full h-12 rounded-xl"
      onClick={handleGuest}
      data-testid="button-email-modal-guest"
    >
      {t("checkoutSignIn.modal.guest")}
    </Button>
  );

  const orDivider = (
    <div className="flex items-center gap-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      {t("auth.or")}
      <div className="h-px flex-1 bg-border" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full gap-0 p-8 sm:max-w-md sm:rounded-2xl max-sm:max-w-none max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:p-6"
        data-testid="dialog-checkout-email-signin"
      >
        <div className="text-center space-y-2 mb-6">
          <DialogTitle className="font-serif text-2xl text-primary">
            {step === "password"
              ? t("checkoutSignIn.modal.passwordTitle")
              : step === "new"
                ? t("checkoutSignIn.modal.newTitle")
                : t("checkoutSignIn.email")}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {step === "password"
              ? t("auth.enterPassword", { email: email.trim() })
              : step === "new"
                ? t("checkoutSignIn.modal.newDesc")
                : t("checkoutSignIn.modal.helper")}
          </DialogDescription>
        </div>

        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
            data-testid="text-email-modal-error"
          >
            {error}
          </div>
        ) : null}

        {step === "email" && (
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void onSubmitEmail();
            }}
          >
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="checkout-email-signin-input"
              >
                {t("auth.emailLabel")}
              </label>
              <Input
                id="checkout-email-signin-input"
                type="email"
                autoComplete="email"
                inputMode="email"
                className="h-12 rounded-sm"
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-email-modal-email"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full h-12 rounded-xl"
              disabled={busy}
              data-testid="button-email-modal-continue"
            >
              {busy ? t("checkout.processing") : t("auth.continue")}
            </Button>
            {orDivider}
            {guestButton}
          </form>
        )}

        {step === "password" && (
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void onSubmitPassword();
            }}
          >
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="checkout-password-signin-input"
              >
                {t("auth.passwordLabel")}
              </label>
              <Input
                id="checkout-password-signin-input"
                type="password"
                autoComplete="current-password"
                className="h-12 rounded-sm"
                placeholder={t("auth.passwordPlaceholderLogin")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                data-testid="input-email-modal-password"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full h-12 rounded-xl"
              disabled={busy || !password}
              data-testid="button-email-modal-signin"
            >
              {busy ? t("checkout.processing") : t("auth.signIn")}
            </Button>
            <div className="text-center">
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => {
                  setStep("email");
                  setPassword("");
                  setError(null);
                }}
                data-testid="button-email-modal-change-email"
              >
                {t("auth.changeEmail")}
              </button>
            </div>
            {orDivider}
            {guestButton}
          </form>
        )}

        {step === "new" && (
          <div className="space-y-4">
            <Button
              type="button"
              size="lg"
              className="w-full h-12 rounded-xl"
              onClick={() => {
                const qs = new URLSearchParams({
                  email_address: email.trim().toLowerCase(),
                  redirect_url: "/checkout",
                });
                setLocation(`/sign-up?${qs.toString()}`);
              }}
              data-testid="button-email-modal-create-account"
            >
              {t("checkoutSignIn.modal.createAccount")}
            </Button>
            {orDivider}
            {guestButton}
            <div className="text-center">
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => {
                  setStep("email");
                  setError(null);
                }}
                data-testid="button-email-modal-different-email"
              >
                {t("auth.changeEmail")}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 border-t pt-4 text-center">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-primary hover:underline"
            onClick={onBack}
            data-testid="button-email-modal-back"
          >
            {t("checkoutSignIn.modal.back")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
