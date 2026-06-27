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

export default function SignUpPage() {
  const [, setLocation] = useLocation();
  const { t, dir } = useLocale();
  const { toast } = useToast();
  const { login } = useAuth();

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
              <h1 className="text-2xl font-serif">{t("auth.signup")}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t("auth.signupDesc")}
              </p>
            </div>

            {initial.email && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t("auth.emailLabel")}:</span>
                <span className="font-medium truncate">{initial.email}</span>
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="signup-first-name">
                    {t("auth.firstNameLabel")} <span className="text-destructive">*</span>
                  </label>
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
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="signup-last-name">
                    {t("auth.lastNameLabel")} <span className="text-destructive">*</span>
                  </label>
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
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="signup-password">
                  {t("auth.passwordLabel")} <span className="text-destructive">*</span>
                </label>
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
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password}</p>
                )}
              </div>

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

            <div className="space-y-4">
              <div className="space-y-1.5">
                <LazyWebPhoneField
                  label={t("auth.phoneLabel")}
                  required
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
              </div>

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
