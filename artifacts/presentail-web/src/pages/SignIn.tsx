import { useEffect, useMemo, useRef, useState } from "react";
import { useSignIn } from "@clerk/react/legacy";
import { AuthenticateWithRedirectCallback } from "@clerk/react";
import { useLocation, useRouter, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";

// Mounted at `/{lang}-{country}/{city}/sign-in` (relative to wouter's
// nested router base). This page implements a CUSTOM email-first flow
// instead of Clerk's hosted `<SignIn>` form because we need to bridge
// existing WordPress shoppers (who have no Clerk account yet) into Clerk
// transparently:
//
//   1. Shopper enters email.
//   2. We POST to `/api/auth/web-bridge` — the server checks the email
//      against WP/WC and, if the shopper exists there but not in Clerk,
//      JIT-creates a Clerk user with the same external_id mapping the
//      one-shot import script uses (`importCustomersToClerk`). This is
//      idempotent and treats `form_identifier_exists` as success.
//   3. We start a Clerk sign-in with `strategy: "email_code"` so the
//      shopper just needs to enter the 6-digit code Clerk emails them —
//      no password is involved (we never had access to WP password
//      hashes anyway).
//   4. New emails (no WP/WC match) are routed to the existing `/sign-up`
//      page so Clerk's normal sign-up form handles them.
//
// Hard-error contract: when the bridge returns `code: lookup_failed` or
// `lookup_unavailable`, we MUST NOT silently route the shopper to
// sign-up — that would create a duplicate account divorced from their
// order history. We surface a toast and keep them on the email step so
// they can retry.
//
// The locale-prefixed mount also catches Clerk's OAuth callback URL
// (`/sign-in/sso-callback`) — we render Clerk's redirect handler in
// that case so Google/Apple flows from the cart prompt keep working.
export default function SignInPage() {
  const router = useRouter();
  const base = (router.base || "").replace(/\/+$/, "");
  const [, setLocation] = useLocation();
  const [isSsoCallback] = useRoute("/sign-in/sso-callback");
  const { t, dir } = useLocale();
  const { toast } = useToast();
  const { isLoaded, signIn, setActive } = useSignIn();

  // SSO callback sub-route: hand control to Clerk so the OAuth handshake
  // finishes the sign-in started by `<CheckoutLoginDialog>`.
  if (isSsoCallback) {
    return <AuthenticateWithRedirectCallback />;
  }

  // Pre-fill with the email the cart's CheckoutLoginDialog forwards via
  // `?email_address=`, and respect Clerk's `?redirect_url=` so we land
  // back on /checkout after a completed sign-in.
  const initial = useMemo(() => {
    if (typeof window === "undefined") return { email: "", redirectTo: "" };
    const sp = new URLSearchParams(window.location.search);
    return {
      email: sp.get("email_address")?.trim() ?? "",
      redirectTo: sp.get("redirect_url") ?? "",
    };
  }, []);

  type Step = "email" | "code";
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(initial.email);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step === "code") codeInputRef.current?.focus();
  }, [step]);

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const goToSignUp = (prefilledEmail: string) => {
    const qs = new URLSearchParams({
      email_address: prefilledEmail,
      ...(initial.redirectTo ? { redirect_url: initial.redirectTo } : {}),
    });
    setLocation(`/sign-up?${qs.toString()}`);
  };

  const onContinueEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      setEmailError(t("auth.invalidEmail"));
      return;
    }
    setEmailError(null);
    if (!isLoaded || !signIn) {
      // Clerk script not yet ready — keep the user on the same step.
      return;
    }
    setBusy(true);
    try {
      // Step 1: server-side bridge. Using a relative URL so the storefront's
      // base path / proxy routing applies in both dev and prod.
      const bridgeRes = await fetch("/api/auth/web-bridge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      // Treat any non-2xx HTTP response as a hard error — silently
      // routing to sign-up here would create a duplicate Clerk account
      // divorced from the WP order history.
      if (!bridgeRes.ok) {
        toast({
          title: t("auth.toast.error"),
          description: t("auth.checkFailed"),
          variant: "destructive",
        });
        return;
      }
      const bridgeJson = (await bridgeRes.json().catch(() => null)) as {
        ok?: boolean;
        exists?: boolean;
        clerkReady?: boolean;
        code?: "lookup_failed" | "lookup_unavailable";
      } | null;
      // Malformed body or missing required `exists` field → hard error.
      // The contract is `{ok:true, exists:boolean, ...}`; anything else
      // means we cannot trust the response.
      if (!bridgeJson || bridgeJson.ok !== true || typeof bridgeJson.exists !== "boolean") {
        toast({
          title: t("auth.toast.error"),
          description: t("auth.checkFailed"),
          variant: "destructive",
        });
        return;
      }
      // Hard-error codes from a well-formed body.
      if (bridgeJson.code === "lookup_failed" || bridgeJson.code === "lookup_unavailable") {
        toast({
          title: t("auth.toast.error"),
          description: t("auth.checkFailed"),
          variant: "destructive",
        });
        return;
      }
      if (!bridgeJson.exists) {
        // No WP/WC match → let the normal sign-up flow handle them.
        goToSignUp(trimmed);
        return;
      }
      if (bridgeJson.clerkReady !== true) {
        // Existed in WP but Clerk provisioning failed (or field missing
        // from a partial response) — hard error, never advance silently.
        toast({
          title: t("auth.toast.error"),
          description: t("auth.checkFailed"),
          variant: "destructive",
        });
        return;
      }

      // Step 2: ask Clerk to send an email-code first factor. Clerk's
      // sign-in `create({identifier})` returns supported first factors;
      // we only need the email-code path.
      const created = await signIn.create({ identifier: trimmed });
      const emailFactor = created.supportedFirstFactors?.find(
        (f: any) => f.strategy === "email_code",
      ) as { emailAddressId: string } | undefined;
      if (!emailFactor) {
        toast({
          title: t("auth.toast.error"),
          description: t("auth.checkFailed"),
          variant: "destructive",
        });
        return;
      }
      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: emailFactor.emailAddressId,
      });
      setStep("code");
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ?? err?.message ?? t("auth.checkFailed");
      // Clerk reports unknown identifiers via form_identifier_not_found.
      // That theoretically can't happen here (we just JIT-created the
      // Clerk user) but be defensive: if it does, route to sign-up
      // rather than dead-ending the shopper.
      const code = String(err?.errors?.[0]?.code ?? "");
      if (/form_identifier_not_found/.test(code)) {
        goToSignUp(trimmed);
        return;
      }
      toast({
        title: t("auth.toast.error"),
        description: msg,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onVerifyCode = async () => {
    const trimmed = code.trim();
    if (!trimmed || !isLoaded || !signIn) return;
    setBusy(true);
    try {
      const attempt = await signIn.attemptFirstFactor({
        strategy: "email_code",
        code: trimmed,
      });
      if (attempt.status === "complete" && attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        // Send the user back to where they came from (/checkout in the
        // cart-prompt flow) or to /account by default.
        setLocation(initial.redirectTo || "/account");
        return;
      }
      // Any other status (e.g. needs_second_factor — not enabled in our
      // tenant) means we can't progress here.
      toast({
        title: t("auth.toast.error"),
        description: t("auth.checkFailed"),
        variant: "destructive",
      });
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ??
        err?.message ??
        t("auth.codeInvalid");
      toast({
        title: t("auth.toast.error"),
        description: msg,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onResendCode = async () => {
    if (!isLoaded || !signIn) return;
    setBusy(true);
    try {
      const factor = signIn.supportedFirstFactors?.find(
        (f: any) => f.strategy === "email_code",
      ) as { emailAddressId: string } | undefined;
      if (!factor) return;
      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: factor.emailAddressId,
      });
      toast({ title: t("auth.codeResent") });
    } catch (err: any) {
      toast({
        title: t("auth.toast.error"),
        description: err?.message ?? t("auth.checkFailed"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center pt-24 pb-24 px-4 bg-background"
      dir={dir}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm"
        data-testid="signin-card"
      >
        <div className="text-center mb-6">
          <h1 className="text-2xl font-serif">{t("auth.cardHeading")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {step === "email" ? t("auth.cardSubheading") : t("auth.codeSentTo", { email })}
          </p>
        </div>

        {step === "code" ? (
          <div
            className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground"
            data-testid="text-signin-account-found"
          >
            {t("auth.accountFound")}
          </div>
        ) : null}

        {step === "email" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="signin-email">
                {t("auth.emailLabel")}
              </label>
              <Input
                id="signin-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                placeholder={t("auth.emailPlaceholder")}
                data-testid="input-signin-email"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onContinueEmail();
                }}
              />
              {emailError ? (
                <p
                  className="text-xs text-destructive"
                  data-testid="text-signin-email-error"
                >
                  {emailError}
                </p>
              ) : null}
            </div>
            <Button
              size="lg"
              className="w-full h-12 rounded-xl"
              onClick={() => void onContinueEmail()}
              disabled={busy || !isLoaded}
              data-testid="button-signin-continue"
            >
              {busy ? t("checkout.processing") : t("auth.continue")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="signin-code">
                {t("auth.codeLabel")}
              </label>
              <Input
                id="signin-code"
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))
                }
                placeholder={t("auth.codePlaceholder")}
                data-testid="input-signin-code"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onVerifyCode();
                }}
              />
            </div>
            <Button
              size="lg"
              className="w-full h-12 rounded-xl"
              onClick={() => void onVerifyCode()}
              disabled={busy || !isLoaded || code.length < 4}
              data-testid="button-signin-verify"
            >
              {busy ? t("checkout.processing") : t("auth.verifyCode")}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => {
                  setStep("email");
                  setCode("");
                }}
                data-testid="button-signin-change-email"
              >
                {t("auth.changeEmail")}
              </button>
              <button
                type="button"
                className="text-primary hover:underline disabled:opacity-50"
                onClick={() => void onResendCode()}
                disabled={busy}
                data-testid="button-signin-resend"
              >
                {t("auth.resendCode")}
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground mt-6">
          {t("auth.noAccount")}
          <a
            href={`${base}/sign-up`}
            className="text-primary hover:underline"
            data-testid="link-signin-to-signup"
          >
            {t("auth.signup")}
          </a>
        </p>
      </div>
    </div>
  );
}
