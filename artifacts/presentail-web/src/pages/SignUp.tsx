import { useRef, useMemo, useState } from "react";
import { useSignUp } from "@clerk/react/legacy";
import { useLocation, useRouter } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";
import PhoneInput from "react-phone-number-input";
import type { Value as PhoneValue } from "react-phone-number-input";
import "react-phone-number-input/style.css";

type Step = "name-password" | "phone" | "code";

export default function SignUpPage() {
  const router = useRouter();
  const base = (router.base || "").replace(/\/+$/, "");
  const [, setLocation] = useLocation();
  const { t, dir } = useLocale();
  const { toast } = useToast();
  const { signUp, setActive } = useSignUp();

  const initial = useMemo(() => {
    if (typeof window === "undefined") return { email: "", redirectTo: "" };
    const sp = new URLSearchParams(window.location.search);
    return {
      email: sp.get("email_address")?.trim() ?? "",
      redirectTo: sp.get("redirect_url") ?? "",
    };
  }, []);

  const [step, setStep] = useState<Step>("name-password");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState<PhoneValue | undefined>(undefined);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const codeRef = useRef<HTMLInputElement | null>(null);

  const onContinueToPhone = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t("auth.nameRequired");
    if (!password) errs.password = t("auth.passwordRequired");
    else if (password.length < 8) errs.password = t("auth.passwordTooShort");
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setStep("phone");
  };

  const onCreateAccount = async () => {
    setErrors({});
    setBusy(true);
    try {
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0] ?? name.trim();
      const lastName = nameParts.slice(1).join(" ") || undefined;

      if (signUp) {
        const createParams: Parameters<typeof signUp.create>[0] = {
          emailAddress: initial.email.toLowerCase(),
          password,
          firstName,
          lastName,
        };
        await signUp.create(createParams);
        if (signUp.status === "complete" && signUp.createdSessionId) {
          await setActive!({ session: signUp.createdSessionId });
          setLocation(initial.redirectTo || `${base}/account`);
          return;
        }
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      }
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 100);
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ?? err?.message ?? t("auth.checkFailed");
      const errCode = String(err?.errors?.[0]?.code ?? "");
      if (/form_identifier_exists/.test(errCode)) {
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
      toast({ title: t("auth.toast.error"), description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onVerifyCode = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (!signUp || !setActive) {
      toast({
        title: t("auth.toast.error"),
        description: t("auth.checkFailed"),
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code: trimmed });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        setLocation(initial.redirectTo || `${base}/account`);
        return;
      }
      toast({
        title: t("auth.toast.error"),
        description: t("auth.codeInvalid"),
        variant: "destructive",
      });
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ?? err?.message ?? t("auth.codeInvalid");
      toast({ title: t("auth.toast.error"), description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onResendCode = async () => {
    if (!signUp) return;
    setBusy(true);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
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
    <div className="py-10 flex justify-center px-4 bg-background" dir={dir}>
      <div
        className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm"
        data-testid="signup-card"
      >
        {/* Back button */}
        <button
          type="button"
          onClick={() => {
            if (step === "phone") { setStep("name-password"); return; }
            if (step === "code") { setStep("phone"); return; }
            if (window.history.length > 1) window.history.back();
            else setLocation("/sign-in");
          }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          data-testid="button-signup-back-page"
        >
          <ArrowLeft className={`w-4 h-4 ${dir === "rtl" ? "rotate-180" : ""}`} />
          {t("checkout.back")}
        </button>

        {/* Step 1: Name + Password */}
        {step === "name-password" && (
          <>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-serif">{t("auth.signup")}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t("auth.signupDesc")}
              </p>
            </div>

            {/* Email badge */}
            {initial.email && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t("auth.emailLabel")}:</span>
                <span className="font-medium truncate">{initial.email}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="signup-name">
                  {t("auth.nameLabel")} <span className="text-destructive">*</span>
                </label>
                <Input
                  id="signup-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((p) => ({ ...p, name: "" }));
                  }}
                  placeholder={t("auth.fullNamePlaceholder")}
                  disabled={busy}
                  data-testid="input-signup-name"
                />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name}</p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="signup-password">
                  {t("auth.passwordLabel")} <span className="text-destructive">*</span>
                </label>
                <Input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => ({ ...p, password: "" }));
                  }}
                  placeholder={t("auth.passwordPlaceholder")}
                  disabled={busy}
                  onKeyDown={(e) => { if (e.key === "Enter") onContinueToPhone(); }}
                  data-testid="input-signup-password"
                />
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password}</p>
                )}
              </div>

              <Button
                size="lg"
                className="w-full h-12 rounded-xl mt-2"
                onClick={onContinueToPhone}
                disabled={busy}
                data-testid="button-signup-continue"
              >
                {t("auth.continue")}
              </Button>
            </div>
          </>
        )}

        {/* Step 2: Phone */}
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
                <label className="text-sm font-medium" htmlFor="signup-phone">
                  {t("auth.phoneLabel")}
                </label>
                <div className="pi-phone-wrap">
                  <PhoneInput
                    international
                    defaultCountry="LB"
                    value={phone}
                    onChange={setPhone}
                    placeholder="+961 70 000 000"
                    data-testid="input-signup-phone"
                  />
                </div>
              </div>

              <Button
                size="lg"
                className="w-full h-12 rounded-xl mt-2"
                onClick={() => void onCreateAccount()}
                disabled={busy}
                data-testid="button-signup-create"
              >
                {busy ? t("checkout.processing") : t("auth.createAccount")}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => void onCreateAccount()}
                  disabled={busy}
                  data-testid="button-signup-skip-phone"
                >
                  {t("auth.skipPhone")}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 3: Email verification code */}
        {step === "code" && (
          <>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-serif">{t("auth.signup")}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t("auth.codeSentTo", { email: initial.email })}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="signup-code">
                  {t("auth.codeLabel")}
                </label>
                <Input
                  id="signup-code"
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                  }
                  placeholder={t("auth.codePlaceholder")}
                  className="text-center text-xl tracking-[0.35em] font-mono h-14"
                  disabled={busy}
                  onKeyDown={(e) => { if (e.key === "Enter") void onVerifyCode(); }}
                  data-testid="input-signup-code"
                />
              </div>
              <Button
                size="lg"
                className="w-full h-12 rounded-xl"
                onClick={() => void onVerifyCode()}
                disabled={busy || code.length < 4}
                data-testid="button-signup-verify"
              >
                {busy ? t("checkout.processing") : t("auth.verifyCode")}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => { setStep("phone"); setCode(""); }}
                  data-testid="button-signup-back"
                >
                  {t("checkout.back")}
                </button>
                <button
                  type="button"
                  className="text-primary hover:underline disabled:opacity-50"
                  onClick={() => void onResendCode()}
                  disabled={busy}
                  data-testid="button-signup-resend"
                >
                  {t("auth.resendCode")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
