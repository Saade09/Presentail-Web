import { useEffect, useMemo, useRef, useState } from "react";
import { useSignIn } from "@clerk/react/legacy";
import { AuthenticateWithRedirectCallback } from "@clerk/react";
import { useLocation, useRouter, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";

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
// that case so OAuth flows can complete.

const AppleLogo = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.39.07 2.35.74 3.15.8 1.2-.24 2.35-.93 3.63-.84 1.54.12 2.7.72 3.46 1.83-3.18 1.9-2.43 5.86.32 7.04-.63 1.55-1.41 3.05-2.56 4.05ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
  </svg>
);

const GoogleLogo = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export default function SignInPage() {
  const router = useRouter();
  const base = (router.base || "").replace(/\/+$/, "");
  const [, setLocation] = useLocation();
  const [isSsoCallback] = useRoute("/sign-in/sso-callback");
  const { t, dir } = useLocale();
  const { toast } = useToast();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [oauthBusy, setOauthBusy] = useState<"apple" | "google" | null>(null);

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

  const onOAuth = async (provider: "apple" | "google") => {
    if (!isLoaded || !signIn) return;
    trackEvent({ name: "signin_page_action", action: provider });
    try {
      setOauthBusy(provider);
      await signIn.authenticateWithRedirect({
        strategy: provider === "google" ? "oauth_google" : "oauth_apple",
        redirectUrl: `${window.location.origin}${base}/sign-in/sso-callback`,
        redirectUrlComplete: `${window.location.origin}${initial.redirectTo || `${base}/account`}`,
      });
    } catch (err) {
      setOauthBusy(null);
      toast({
        title: t("auth.toast.oauthFailed", {
          provider: provider === "google" ? "Google" : "Apple",
        }),
        description: err instanceof Error ? err.message : t("auth.toast.error"),
        variant: "destructive",
      });
    }
  };

  const onContinueEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      setEmailError(t("auth.invalidEmail"));
      return;
    }
    setEmailError(null);
    trackEvent({ name: "signin_page_action", action: "continue" });
    setBusy(true);
    try {
      // Step 1: server-side bridge — check WP/WC before touching Clerk.
      // We intentionally do this BEFORE checking Clerk's `isLoaded` so
      // that new emails (exists: false) always route to sign-up even
      // when Clerk hasn't finished initialising (e.g. prod keys on a
      // non-production domain).
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

      // Step 2: now we know the user exists and Clerk is ready — check
      // that the Clerk SDK has finished loading before proceeding.
      if (!isLoaded || !signIn) {
        toast({
          title: t("auth.toast.error"),
          description: t("auth.checkFailed"),
          variant: "destructive",
        });
        return;
      }

      // Step 3: ask Clerk to send an email-code first factor. Clerk's
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
      // Clerk reports unknown identifiers via form_identifier_not_found.
      // That theoretically can't happen here (we just JIT-created the
      // Clerk user) but be defensive: if it does, route to sign-up
      // rather than dead-ending the shopper.
      const code = String(err?.errors?.[0]?.code ?? "");
      if (/form_identifier_not_found/.test(code)) {
        goToSignUp(trimmed);
        return;
      }
      const msg = /incorrect_password/i.test(code)
        ? t("auth.incorrectPassword")
        : (err?.errors?.[0]?.longMessage ?? err?.message ?? t("auth.checkFailed"));
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
      const code = String(err?.errors?.[0]?.code ?? "");
      const msg = /incorrect_password/i.test(code)
        ? t("auth.incorrectPassword")
        : (err?.errors?.[0]?.longMessage ?? err?.message ?? t("auth.codeInvalid"));
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
      className="min-h-screen flex items-center justify-center pt-12 pb-12 px-4 bg-[#F7F7F7]"
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
                className="h-12 rounded-sm"
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
              disabled={busy}
              data-testid="button-signin-continue"
            >
              {busy ? t("checkout.processing") : t("auth.continue")}
            </Button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                {t("auth.or")}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="space-y-2">
              <Button
                variant="outline"
                size="lg"
                className="w-full h-12 rounded-xl flex items-center justify-center gap-2"
                onClick={() => void onOAuth("apple")}
                disabled={busy || oauthBusy !== null}
                data-testid="button-signin-apple"
              >
                <AppleLogo />
                {oauthBusy === "apple" ? t("checkout.processing") : t("auth.continueApple")}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full h-12 rounded-xl flex items-center justify-center gap-2"
                onClick={() => void onOAuth("google")}
                disabled={busy || oauthBusy !== null}
                data-testid="button-signin-google"
              >
                <GoogleLogo />
                {oauthBusy === "google" ? t("checkout.processing") : t("auth.continueGoogle")}
              </Button>
            </div>
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
                className="h-12 rounded-sm"
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
      </div>
    </div>
  );
}
