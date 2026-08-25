import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { loadAuthScripts } from "@/lib/authScripts";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { ShimUser } from "@/contexts/AuthContext";
import { LazyWebPhoneField } from "@/components/LazyWebPhoneField";
import { Logo } from "@/components/Logo";
import { trackEvent } from "@/lib/analytics";
import { CheckoutField } from "@/components/checkout/CheckoutField";

type Step = "name-password" | "phone";

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

const APPLE_SERVICE_ID = import.meta.env.VITE_APPLE_SERVICE_ID as
  | string
  | undefined;

function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Instagram|FBAN|FBAV|BytedanceWebview|TikTok/i.test(ua);
}

export default function SignUpPage() {
  const [, setLocation] = useLocation();
  const { t, dir } = useLocale();
  const { toast } = useToast();
  const { login } = useAuth();
  const [inAppBrowser] = useState(() => isInAppBrowser());
  const [oauthBusy, setOauthBusy] = useState(false);

  // Pre-fetch Google GSI and Apple auth scripts on mount so they are ready
  // if the user navigates back to sign-in. loadAuthScripts() is idempotent.
  useEffect(() => {
    void loadAuthScripts();
  }, []);

  const initial = useMemo(() => {
    if (typeof window === "undefined") return { email: "", redirectTo: "" };
    const sp = new URLSearchParams(window.location.search);
    return {
      email: sp.get("email_address")?.trim() ?? "",
      redirectTo: sp.get("redirect_url") ?? "",
    };
  }, []);

  const [step, setStep] = useState<Step>("name-password");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);

  const redirectAfterAuth = initial.redirectTo || "/account";

  const onOAuthApple = async () => {
    if (!APPLE_SERVICE_ID) {
      toast({
        title: t("auth.toast.error"),
        description: "Apple sign-in is not configured.",
        variant: "destructive",
      });
      return;
    }
    setOauthBusy(true);
    try {
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
      window.AppleID.auth.init({
        clientId: APPLE_SERVICE_ID,
        scope: "name email",
        redirectURI: `${window.location.origin}/sign-in`,
        usePopup: true,
      });
      const appleRes = await window.AppleID.auth.signIn();
      const idToken = appleRes?.authorization?.id_token;
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
      login(data.token, mapApiUser(data.user), "apple");
      setLocation(redirectAfterAuth);
    } catch (err: any) {
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
      setOauthBusy(false);
    }
  };

  const onContinueToPhone = () => {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = t("auth.firstNameRequired");
    if (!lastName.trim()) errs.lastName = t("auth.lastNameRequired");
    if (!password) errs.password = t("auth.passwordRequired");
    else if (password.length < 8) errs.password = t("auth.passwordTooShort");
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setStep("phone");
  };

  const doRegister = async (phoneValue?: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: initial.email.toLowerCase(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim() || undefined,
          phone: phoneValue ?? undefined,
        }),
      });
      const data = (await res.json()) as ApiAuthResponse;
      if (!res.ok || !data.ok) {
        const errCode = data.code ?? "";
        if (errCode === "registration_failed_social_account") {
          const provider = (data as any).provider as "google" | "apple" | undefined;
          const description =
            provider === "google"
              ? t("auth.existingAccountSocialPromptGoogle")
              : provider === "apple"
              ? t("auth.existingAccountSocialPromptApple")
              : t("auth.existingAccountSocialPrompt");
          toast({ title: t("auth.toast.error"), description });
          const qs = new URLSearchParams({ email_address: initial.email });
          if (provider) qs.set("social_provider", provider);
          setLocation(`/sign-in?${qs.toString()}`);
          return;
        }
        if (/form_identifier_exists|registration_failed/.test(errCode)) {
          toast({
            title: t("auth.toast.error"),
            description:
              "An account with this email already exists. Please sign in instead.",
          });
          setLocation(
            `/sign-in?email_address=${encodeURIComponent(initial.email)}`,
          );
          return;
        }
        toast({
          title: t("auth.toast.error"),
          description: data.message ?? t("auth.checkFailed"),
          variant: "destructive",
        });
        return;
      }
      if (data.token && data.user) {
        login(data.token, mapApiUser(data.user), "password");
        setLocation(redirectAfterAuth);
      } else {
        // Registered but no JWT returned (WP JWT plugin not installed) — go to sign-in
        setLocation(
          `/sign-in?email_address=${encodeURIComponent(initial.email)}`,
        );
      }
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

  const onCreateAccountWithPhone = async () => {
    if (!phone) {
      setErrors((p) => ({ ...p, phone: t("auth.phoneRequired") }));
      return;
    }
    setErrors((p) => ({ ...p, phone: "" }));
    await doRegister(phone);
  };

  return (
    <div className="py-10 flex justify-center px-4 bg-background" dir={dir}>
      <div
        className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm"
        data-testid="signup-card"
      >
        <button
          type="button"
          onClick={() => {
            if (step === "phone") {
              setStep("name-password");
              return;
            }
            if (window.history.length > 1) window.history.back();
            else setLocation("/sign-in");
          }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          data-testid="button-signup-back-page"
        >
          <ArrowLeft className={`w-4 h-4 ${dir === "rtl" ? "rotate-180" : ""}`} />
          {t("checkout.back")}
        </button>

        {step === "name-password" && (
          <>
            <div className="text-center mb-6">
              <div className="flex justify-center mb-4">
                <Logo height={36} />
              </div>
              <h1 className="text-2xl font-serif">{t("auth.signup")}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t("auth.signupDesc")}
              </p>
            </div>

            {APPLE_SERVICE_ID && !inAppBrowser && (
              <div className="mb-5 space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full h-12 rounded-xl flex items-center gap-2"
                  onClick={() => void onOAuthApple()}
                  disabled={oauthBusy}
                  data-testid="button-signup-apple"
                >
                  <AppleLogo />
                  {t("auth.continueWithApple")}
                </Button>
                <div className="relative flex items-center gap-3 py-1">
                  <div className="flex-1 border-t" />
                  <span className="text-xs text-muted-foreground">{t("auth.orContinueWith")}</span>
                  <div className="flex-1 border-t" />
                </div>
              </div>
            )}

            {initial.email && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t("auth.emailLabel")}:</span>
                <span className="font-medium truncate">{initial.email}</span>
              </div>
            )}

            <div>
              <div className="grid grid-cols-2 gap-x-3">
                <CheckoutField
                  label={t("auth.firstNameLabel")}
                  htmlFor="signup-first-name"
                  required
                >
                  <Input
                    id="signup-first-name"
                    type="text"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (errors.firstName) setErrors((p) => ({ ...p, firstName: "" }));
                    }}
                    placeholder={t("auth.firstNamePlaceholder")}
                    disabled={busy}
                    data-testid="input-signup-name"
                    className="h-12 rounded-sm"
                  />
                  {errors.firstName && (
                    <p className="text-xs text-destructive">{errors.firstName}</p>
                  )}
                </CheckoutField>
                <CheckoutField
                  label={t("auth.lastNameLabel")}
                  htmlFor="signup-last-name"
                  required
                >
                  <Input
                    id="signup-last-name"
                    type="text"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      if (errors.lastName) setErrors((p) => ({ ...p, lastName: "" }));
                    }}
                    placeholder={t("auth.lastNamePlaceholder")}
                    disabled={busy}
                    data-testid="input-signup-last-name"
                    className="h-12 rounded-sm"
                  />
                  {errors.lastName && (
                    <p className="text-xs text-destructive">{errors.lastName}</p>
                  )}
                </CheckoutField>
              </div>

              <CheckoutField
                label={t("auth.passwordLabel")}
                htmlFor="signup-password"
                required
                className="mb-2"
              >
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors((p) => ({ ...p, password: "" }));
                    }}
                    placeholder={t("auth.passwordPlaceholder")}
                    disabled={busy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onContinueToPhone();
                    }}
                    data-testid="input-signup-password"
                    className="h-12 rounded-sm pe-10"
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
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password}</p>
                )}
              </CheckoutField>

              <Button
                size="lg"
                className="w-full h-12 rounded-xl mt-2"
                onClick={onContinueToPhone}
                disabled={busy || !firstName.trim() || !lastName.trim() || !password}
                data-testid="button-signup-continue"
              >
                {t("auth.continue")}
              </Button>
            </div>
          </>
        )}

        {step === "phone" && (
          <>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-serif">{t("auth.phoneStep.title")}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t("auth.phoneStep.desc")}
              </p>
            </div>

            <div>
              <CheckoutField label={t("auth.phoneLabel")} required className="mb-2">
                <LazyWebPhoneField
                  label=""
                  defaultCountry="LB"
                  value={phone}
                  onChange={(v) => {
                    setPhone(v);
                    if (errors.phone) setErrors((p) => ({ ...p, phone: "" }));
                  }}
                  showError={!!errors.phone}
                  errorMessage={errors.phone}
                  data-testid="input-signup-phone"
                />
              </CheckoutField>

              <Button
                size="lg"
                className="w-full h-12 rounded-xl mt-2"
                onClick={() => void onCreateAccountWithPhone()}
                disabled={busy || !phone.trim()}
                data-testid="button-signup-create"
              >
                {busy ? t("checkout.processing") : t("auth.createAccount")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
