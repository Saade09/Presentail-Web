import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRouter } from "wouter";
import { loadAuthScripts } from "@/lib/authScripts";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/contexts/AuthContext";
import type { ShimUser } from "@/contexts/AuthContext";
import { CompleteProfileDialog } from "@/components/auth/CompleteProfileDialog";

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

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as
  | string
  | undefined;
const APPLE_SERVICE_ID = import.meta.env.VITE_APPLE_SERVICE_ID as
  | string
  | undefined;

type ApiAuthResponse = {
  ok: boolean;
  token?: string;
  user?: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  message?: string;
};

function mapApiUser(
  u: NonNullable<ApiAuthResponse["user"]>
): ShimUser {
  return {
    id: String(u.id),
    email: u.email ?? "",
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    phone: u.phone || undefined,
  };
}

export default function SignInPage() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const router = useRouter();
  const _base = (router.base || "").replace(/\/+$/, "");
  const { t, dir } = useLocale();
  const { toast } = useToast();
  const [oauthBusy, setOauthBusy] = useState<"apple" | "google" | null>(null);
  const [pendingAppleAuth, setPendingAppleAuth] = useState<{
    token: string;
    user: ShimUser;
  } | null>(null);

  const initial = useMemo(() => {
    if (typeof window === "undefined") return { email: "", redirectTo: "", strategy: "" };
    const sp = new URLSearchParams(window.location.search);
    return {
      email: sp.get("email_address")?.trim() ?? "",
      redirectTo: sp.get("return_to") ?? sp.get("redirect_url") ?? "",
      strategy: sp.get("strategy") ?? "",
    };
  }, []);

  type Step = "email" | "password" | "social-redirect";
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(initial.email);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step === "password") passwordInputRef.current?.focus();
  }, [step]);

  const redirectAfterAuth = initial.redirectTo || "/account";

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const goToSignUp = (prefilledEmail: string) => {
    const qs = new URLSearchParams({
      email_address: prefilledEmail,
      ...(initial.redirectTo ? { redirect_url: initial.redirectTo } : {}),
    });
    setLocation(`/sign-up?${qs.toString()}`);
  };

  const handleAuthSuccess = (
    token: string,
    user: ShimUser,
    provider: string
  ) => {
    login(token, user, provider);
    setLocation(redirectAfterAuth);
  };

  const onOAuthGoogle = async () => {
    if (!GOOGLE_CLIENT_ID) {
      toast({
        title: t("auth.toast.error"),
        description: "Google sign-in is not configured.",
        variant: "destructive",
      });
      return;
    }
    await loadAuthScripts();
    if (!window.google?.accounts?.oauth2) {
      toast({
        title: t("auth.toast.error"),
        description: t("auth.toast.oauthFailed", { provider: "Google" }),
        variant: "destructive",
      });
      return;
    }
    trackEvent({ name: "signin_page_action", action: "google" });
    setOauthBusy("google");
    try {
      await new Promise<void>((resolve, reject) => {
        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID!,
          scope: "openid email profile",
          ux_mode: "popup",
          callback: async (response) => {
            if (response.error || !response.access_token) {
              reject(
                new Error(
                  response.error_description ??
                    response.error ??
                    t("auth.toast.error")
                )
              );
              return;
            }
            try {
              const res = await fetch("/api/auth/oauth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accessToken: response.access_token }),
              });
              const data = (await res.json()) as ApiAuthResponse;
              if (!res.ok || !data.ok || !data.token || !data.user) {
                reject(new Error(data.message ?? t("auth.toast.error")));
                return;
              }
              handleAuthSuccess(data.token, mapApiUser(data.user), "google");
              resolve();
            } catch (err) {
              reject(err);
            }
          },
        });
        client.requestAccessToken();
      });
    } catch (err: any) {
      toast({
        title: t("auth.toast.oauthFailed", { provider: "Google" }),
        description: err instanceof Error ? err.message : t("auth.toast.error"),
        variant: "destructive",
      });
    } finally {
      setOauthBusy(null);
    }
  };

  const onOAuthApple = async () => {
    if (!APPLE_SERVICE_ID) {
      toast({
        title: t("auth.toast.error"),
        description: "Apple sign-in is not configured.",
        variant: "destructive",
      });
      return;
    }
    await loadAuthScripts();
    if (!window.AppleID?.auth) {
      toast({
        title: t("auth.toast.error"),
        description: t("auth.toast.oauthFailed", { provider: "Apple" }),
        variant: "destructive",
      });
      return;
    }
    trackEvent({ name: "signin_page_action", action: "apple" });
    setOauthBusy("apple");
    try {
      window.AppleID.auth.init({
        clientId: APPLE_SERVICE_ID,
        scope: "name email",
        redirectURI: `${window.location.origin}/sign-in`,
        usePopup: true,
      });
      const appleRes = await window.AppleID.auth.signIn();
      const idToken =
        appleRes?.authorization?.id_token;
      if (!idToken) throw new Error("Apple did not return an identity token");

      const res = await fetch("/api/auth/oauth/apple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_token: idToken,
          user: appleRes.user ?? null,
        }),
      });
      const data = (await res.json()) as ApiAuthResponse;
      if (!res.ok || !data.ok || !data.token || !data.user) {
        throw new Error(data.message ?? t("auth.toast.error"));
      }
      const mappedUser = mapApiUser(data.user);
      if (!mappedUser.firstName.trim() || !mappedUser.lastName.trim()) {
        setPendingAppleAuth({ token: data.token, user: mappedUser });
      } else {
        handleAuthSuccess(data.token, mappedUser, "apple");
      }
    } catch (err: any) {
      // Apple's JS SDK throws a structured { error: string } object (not an
      // Error instance) for user-facing cancellations and configuration errors.
      const appleErrorCode: string | undefined =
        err && typeof err === "object" && typeof err.error === "string"
          ? err.error
          : undefined;
      const silentCancels = ["popup_closed_by_user", "user_cancelled_authorize"];
      if (appleErrorCode && silentCancels.includes(appleErrorCode)) {
        return;
      }
      toast({
        title: t("auth.toast.oauthFailed", { provider: "Apple" }),
        description: appleErrorCode
          ? appleErrorCode
          : err instanceof Error
          ? err.message
          : t("auth.toast.error"),
        variant: "destructive",
      });
    } finally {
      setOauthBusy(null);
    }
  };

  // Pre-fetch Google GSI and Apple auth scripts on mount so they are ready
  // when the user clicks a social button. loadAuthScripts() is idempotent.
  useEffect(() => {
    void loadAuthScripts();
  }, []);

  // Auto-trigger OAuth when navigated here from CheckoutLoginDialog with ?strategy=
  useEffect(() => {
    if (initial.strategy === "oauth_google") {
      void onOAuthGoogle();
    } else if (initial.strategy === "oauth_apple") {
      void onOAuthApple();
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const bridgeRes = await fetch("/api/auth/web-bridge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
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
        code?: "lookup_failed" | "lookup_unavailable";
        passwordLoginAvailable?: boolean;
      } | null;
      if (
        !bridgeJson ||
        bridgeJson.ok !== true ||
        typeof bridgeJson.exists !== "boolean"
      ) {
        toast({
          title: t("auth.toast.error"),
          description: t("auth.checkFailed"),
          variant: "destructive",
        });
        return;
      }
      // When the server found (or is confident about) an existing account,
      // check whether password login is still available before advancing.
      // Only show the password step when the server explicitly signals
      // passwordLoginAvailable === true — treat undefined (older server) as
      // false so returning shoppers are never silently routed to a dead-end.
      if (bridgeJson.exists) {
        // If the lookup found an account but can't proceed (e.g. Clerk not
        // configured, or provisioning failed), surface an error — the user
        // already has an account so we must not silently route them to sign-up.
        if (
          bridgeJson.code === "lookup_failed" ||
          bridgeJson.code === "lookup_unavailable"
        ) {
          toast({
            title: t("auth.toast.error"),
            description: t("auth.checkFailed"),
            variant: "destructive",
          });
          return;
        }
        if (bridgeJson.passwordLoginAvailable === true) {
          setStep("password");
        } else {
          setStep("social-redirect");
        }
        return;
      }
      // exists: false — route to sign-up even when the lookup was inconclusive.
      // The sign-up endpoint rejects duplicate emails as a final safety net,
      // so the worst case is the user sees a "already registered" message and
      // is redirected to sign-in instead.
      goToSignUp(trimmed);
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

  const onSignIn = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!password) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, password }),
      });
      const data = (await res.json()) as ApiAuthResponse;
      if (!res.ok || !data.ok || !data.token || !data.user) {
        const wpCode = (data as any).code as string | undefined;
        const msg = /incorrect_password/i.test(wpCode ?? "")
          ? t("auth.incorrectPassword")
          : (data.message ?? t("auth.checkFailed"));
        toast({
          title: t("auth.toast.error"),
          description: msg,
          variant: "destructive",
        });
        return;
      }
      handleAuthSuccess(data.token, mapApiUser(data.user), "password");
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
    <>
    {pendingAppleAuth ? (
      <CompleteProfileDialog
        open={pendingAppleAuth !== null}
        onOpenChange={(v) => {
          if (!v && pendingAppleAuth) {
            handleAuthSuccess(pendingAppleAuth.token, pendingAppleAuth.user, "apple");
            setPendingAppleAuth(null);
          }
        }}
        token={pendingAppleAuth.token}
        onComplete={(update) => {
          if (pendingAppleAuth) {
            const updatedUser: ShimUser = update
              ? { ...pendingAppleAuth.user, firstName: update.firstName, lastName: update.lastName }
              : pendingAppleAuth.user;
            handleAuthSuccess(pendingAppleAuth.token, updatedUser, "apple");
            setPendingAppleAuth(null);
          }
        }}
      />
    ) : null}
    <div
      className="h-[calc(100vh-130px)] flex flex-col items-center justify-center px-4 py-4 bg-[#F7F7F7] overflow-hidden"
      dir={dir}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm overflow-y-auto max-h-full"
        data-testid="signin-card"
      >
        <div className="text-center mb-6">
          <h1 className="text-2xl font-serif">{t("auth.cardHeading")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {step === "email" || step === "social-redirect"
              ? t("auth.cardSubheading")
              : t("auth.enterPassword", { email })}
          </p>
        </div>

        {step === "password" ? (
          <div
            className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground"
            data-testid="text-signin-account-found"
          >
            {t("auth.accountFound")}
          </div>
        ) : null}

        {step === "social-redirect" ? (
          <div className="space-y-4">
            <div
              className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground"
              data-testid="text-signin-social-prompt"
            >
              {t("auth.existingAccountSocialPrompt")}
            </div>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="lg"
                className="w-full h-12 rounded-xl flex items-center justify-center gap-2"
                onClick={() => void onOAuthApple()}
                disabled={busy || oauthBusy !== null}
                data-testid="button-signin-apple"
              >
                <AppleLogo />
                {oauthBusy === "apple"
                  ? t("checkout.processing")
                  : t("auth.continueApple")}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full h-12 rounded-xl flex items-center justify-center gap-2"
                onClick={() => void onOAuthGoogle()}
                disabled={busy || oauthBusy !== null}
                data-testid="button-signin-google"
              >
                <GoogleLogo />
                {oauthBusy === "google"
                  ? t("checkout.processing")
                  : t("auth.continueGoogle")}
              </Button>
            </div>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => {
                  setStep("email");
                }}
                data-testid="button-signin-change-email"
              >
                {t("auth.changeEmail")}
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:underline"
                onClick={() =>
                  setLocation(
                    `/reset-password?email_address=${encodeURIComponent(
                      email.trim().toLowerCase()
                    )}`
                  )
                }
                data-testid="button-signin-forgot"
              >
                {t("auth.forgotPassword")}
              </button>
            </div>
          </div>
        ) : step === "email" ? (
          <div className="space-y-4">
            {/* Account benefits line */}
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              {t("auth.accountBenefits")}
            </p>

            {/* Social buttons — Apple first */}
            <div className="space-y-2">
              <Button
                variant="outline"
                size="lg"
                className="w-full h-12 rounded-xl flex items-center justify-center gap-2"
                onClick={() => void onOAuthApple()}
                disabled={busy || oauthBusy !== null}
                data-testid="button-signin-apple"
              >
                <AppleLogo />
                {oauthBusy === "apple"
                  ? t("checkout.processing")
                  : t("auth.continueApple")}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full h-12 rounded-xl flex items-center justify-center gap-2"
                onClick={() => void onOAuthGoogle()}
                disabled={busy || oauthBusy !== null}
                data-testid="button-signin-google"
              >
                <GoogleLogo />
                {oauthBusy === "google"
                  ? t("checkout.processing")
                  : t("auth.continueGoogle")}
              </Button>
            </div>

            {/* Divider */}
            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground shrink-0">
                {t("auth.orContinueWithEmail")}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Email field */}
            <div className="flex flex-col gap-[5px]">
              <label className="text-sm font-medium block" htmlFor="signin-email">
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
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("auth.emailHelper")}
                </p>
              )}
            </div>

            {/* Continue with Email button — strong teal once email is valid */}
            <Button
              size="lg"
              className="w-full h-12 rounded-xl"
              onClick={() => void onContinueEmail()}
              disabled={busy || !isValidEmail(email)}
              data-testid="button-signin-continue"
            >
              {busy ? t("checkout.processing") : t("auth.continueWithEmail")}
            </Button>

            {/* Help link */}
            <p className="text-center text-xs text-muted-foreground">
              <a
                href="mailto:support@presentail.com"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {t("auth.helpLink")}
              </a>
            </p>

            {/* Privacy note */}
            <p className="text-center text-[11px] text-muted-foreground/70 leading-relaxed">
              {t("auth.privacyNote")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="signin-password">
                {t("auth.passwordLabel")}
              </label>
              <div className="relative">
                <Input
                  id="signin-password"
                  ref={passwordInputRef}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.passwordPlaceholderLogin")}
                  data-testid="input-signin-password"
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void onSignIn();
                  }}
                  className="h-12 rounded-sm pr-10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <Button
              size="lg"
              className="w-full h-12 rounded-xl"
              onClick={() => void onSignIn()}
              disabled={busy || !password}
              data-testid="button-signin-submit"
            >
              {busy ? t("checkout.processing") : t("auth.signIn")}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => {
                  setStep("email");
                  setPassword("");
                }}
                data-testid="button-signin-change-email"
              >
                {t("auth.changeEmail")}
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:underline"
                onClick={() =>
                  setLocation(
                    `/reset-password?email_address=${encodeURIComponent(
                      email.trim().toLowerCase()
                    )}`
                  )
                }
                data-testid="button-signin-forgot"
              >
                {t("auth.forgotPassword")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
