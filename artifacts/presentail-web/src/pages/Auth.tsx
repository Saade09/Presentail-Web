import { useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLogin, useRegister, checkEmailExists, requestPasswordReset } from "@/lib/queries";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/contexts/LocaleContext";

type Step = "email" | "login" | "signup" | "forgot" | "forgotSent";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "h-[60px] w-full rounded-2xl border border-[hsl(var(--primary)/0.15)] bg-white px-5 text-base text-[hsl(var(--primary))] shadow-none placeholder:text-[hsl(var(--primary)/0.45)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.25)] focus-visible:border-[hsl(var(--primary)/0.5)]";

const primaryButtonClass =
  "w-full h-[62px] rounded-full bg-[hsl(var(--primary))] text-white text-base font-semibold tracking-wide hover:bg-[hsl(var(--primary)/0.92)] border border-[hsl(var(--primary))]";

const outlineButtonClass =
  "w-full h-[60px] rounded-full bg-white text-[hsl(var(--primary))] text-base font-medium border border-[hsl(var(--primary)/0.25)] hover:bg-[hsl(var(--primary)/0.04)]";

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.46 2.23-1.21 3.03-.81.86-2.13 1.51-3.21 1.42-.13-1.11.41-2.27 1.16-3.05.82-.86 2.23-1.5 3.26-1.4zM20.5 17.27c-.56 1.29-.83 1.87-1.55 3.01-1.01 1.59-2.43 3.57-4.19 3.59-1.56.02-1.96-1.02-4.07-1-2.11.01-2.55 1.02-4.11 1-1.76-.02-3.11-1.81-4.12-3.4C-.36 16.43-.66 11.16 1.18 8.36c1.31-1.99 3.38-3.16 5.32-3.16 1.98 0 3.22 1.08 4.86 1.08 1.59 0 2.56-1.08 4.85-1.08 1.73 0 3.56.94 4.86 2.57-4.27 2.34-3.58 8.45.43 9.5z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20.4H24v7.2h11.3c-1.5 4.2-5.5 7.2-10.3 7.2-6.2 0-11.2-5-11.2-11.2s5-11.2 11.2-11.2c2.8 0 5.4 1 7.4 2.8l5.1-5.1C34.5 7.2 29.5 5.2 24 5.2 13.5 5.2 5 13.7 5 24.2s8.5 19 19 19 19-8.5 19-19c0-1.3-.1-2.5-.4-3.7z"/>
      <path fill="#FF3D00" d="M7.3 14.7l5.9 4.3c1.6-3.9 5.4-6.6 9.8-6.6 2.8 0 5.4 1 7.4 2.8l5.1-5.1C32.5 7.2 27.5 5.2 22 5.2c-7.4 0-13.7 4.2-16.7 10.5z"/>
      <path fill="#4CAF50" d="M24 43.2c5.3 0 10.1-2 13.7-5.3l-6.3-5.3c-2 1.4-4.6 2.3-7.4 2.3-4.7 0-8.7-3-10.2-7.1l-5.9 4.5C10.2 39 16.6 43.2 24 43.2z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20.4H24v7.2h11.3c-.7 2-2 3.7-3.7 5l6.3 5.3c-.4.4 6.7-4.9 6.7-13.7 0-1.3-.1-2.5-.4-3.7z"/>
    </svg>
  );
}

function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[hsl(40_46%_95%)] flex items-start justify-center px-4 sm:px-6 py-10 sm:py-16">
      <div className="w-full max-w-[560px] bg-white rounded-2xl border border-[hsl(var(--primary)/0.08)] shadow-[0_1px_2px_rgba(0,0,0,0.02)] px-6 sm:px-12 py-10 sm:py-14">
        {children}
      </div>
    </div>
  );
}

export default function Auth() {
  const { login: setAuth } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLocale();

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const [step, setStep] = useState<Step>("email");
  const [arrivedFromCheck, setArrivedFromCheck] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
  });

  const resetToEmail = () => {
    setStep("email");
    setArrivedFromCheck(false);
    setFormData((d) => ({ ...d, password: "", firstName: "", lastName: "" }));
  };

  const handleContinueEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = formData.email.trim();
    if (!EMAIL_RE.test(email)) {
      setEmailError(t("auth.invalidEmail"));
      return;
    }
    setEmailError(null);
    setEmailChecking(true);
    try {
      const r = await checkEmailExists(email);
      setFormData((d) => ({ ...d, email }));
      setArrivedFromCheck(true);
      setStep(r.exists ? "login" : "signup");
    } catch {
      setEmailError(t("auth.checkFailed"));
    } finally {
      setEmailChecking(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await loginMutation.mutateAsync({ email: formData.email, password: formData.password });
      if (res.ok) {
        setAuth(res.token, res.user);
        setLocation("/account");
      } else {
        toast({ title: t("auth.toast.loginFailed"), description: t("auth.toast.invalidCreds"), variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: t("auth.toast.error"), description: error.message, variant: "destructive" });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await registerMutation.mutateAsync(formData);
      if (res.ok) {
        if (res.token) {
          setAuth(res.token, res.user);
          setLocation("/account");
        } else {
          toast({ title: t("auth.toast.created"), description: t("auth.toast.createdDesc") });
          setArrivedFromCheck(true);
          setStep("login");
        }
      } else {
        toast({ title: t("auth.toast.regFailed"), description: t("auth.toast.regFailedDesc"), variant: "destructive" });
      }
    } catch (error: any) {
      const msg = String(error?.message ?? "").toLowerCase();
      if (msg.includes("registered") || msg.includes("exists") || msg.includes("email")) {
        setArrivedFromCheck(true);
        setStep("login");
        return;
      }
      toast({ title: t("auth.toast.error"), description: error.message, variant: "destructive" });
    }
  };

  const handleSendReset = async () => {
    if (forgotBusy) return;
    setForgotError(null);
    setForgotBusy(true);
    try {
      await requestPasswordReset(formData.email);
      setStep("forgotSent");
    } catch (err: any) {
      const msg = String(err?.message ?? "").toLowerCase();
      if (msg.includes("couldn't find") || msg.includes("unknown")) {
        setStep("forgotSent");
      } else {
        setForgotError(t("auth.forgotFailed"));
      }
    } finally {
      setForgotBusy(false);
    }
  };

  const handleProviderSoon = (provider: "Apple" | "Google") => {
    toast({
      title: t("auth.providerSoonTitle"),
      description: t("auth.providerSoonDesc", { provider }),
    });
  };

  const heading =
    step === "email"
      ? t("auth.cardHeading")
      : step === "login"
      ? t("auth.welcome")
      : step === "signup"
      ? t("auth.create")
      : step === "forgot"
      ? t("auth.forgotTitle")
      : t("auth.forgotSentTitle");
  const description =
    step === "email"
      ? t("auth.cardSubheading")
      : step === "login"
      ? t("auth.signinDesc")
      : step === "signup"
      ? t("auth.signupDesc")
      : step === "forgot"
      ? t("auth.forgotDesc")
      : t("auth.forgotSentDesc", { email: formData.email });

  const spinner = (
    <span className="inline-block h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
  );

  return (
    <AuthCard>
      <div className="text-center space-y-2 mb-8 sm:mb-10">
        <h1 className="font-serif text-[hsl(var(--primary))] text-[34px] sm:text-[40px] leading-tight">
          {heading}
        </h1>
        <p className="text-[hsl(var(--primary)/0.85)] text-lg sm:text-xl">
          {description}
        </p>
      </div>

      {step === "email" && (
        <form onSubmit={handleContinueEmail} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[hsl(var(--primary))]">
              {t("auth.emailLabel")}
            </label>
            <Input
              type="email"
              required
              autoFocus
              placeholder={t("auth.emailPlaceholder")}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={inputClass}
            />
            {emailError && (
              <p className="text-sm text-destructive" role="alert">
                {emailError}
              </p>
            )}
          </div>

          <Button type="submit" className={primaryButtonClass} disabled={emailChecking}>
            {emailChecking ? spinner : t("auth.continue")}
          </Button>

          <div className="flex items-center gap-4 py-2">
            <div className="flex-1 h-px bg-[hsl(var(--primary)/0.15)]" />
            <span className="text-sm text-[hsl(var(--primary)/0.7)]">{t("auth.or")}</span>
            <div className="flex-1 h-px bg-[hsl(var(--primary)/0.15)]" />
          </div>

          <Button
            type="button"
            variant="outline"
            className={outlineButtonClass}
            onClick={() => handleProviderSoon("Apple")}
          >
            <AppleLogo />
            <span>{t("auth.continueApple")}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            className={outlineButtonClass}
            onClick={() => handleProviderSoon("Google")}
          >
            <GoogleLogo />
            <span>{t("auth.continueGoogle")}</span>
          </Button>
        </form>
      )}

      {step === "login" && (
        <form onSubmit={handleLogin} className="space-y-5">
          {arrivedFromCheck && (
            <p className="text-sm text-[hsl(var(--primary)/0.75)] text-center">
              {t("auth.accountFound")}
            </p>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[hsl(var(--primary))]">
              {t("auth.emailLabel")}
            </label>
            <Input type="email" value={formData.email} readOnly className={inputClass} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[hsl(var(--primary))]">
              {t("auth.password")}
            </label>
            <Input
              type="password"
              required
              autoFocus
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              minLength={8}
              className={inputClass}
            />
          </div>

          <Button type="submit" className={primaryButtonClass} disabled={loginMutation.isPending}>
            {loginMutation.isPending ? spinner : t("auth.signin")}
          </Button>

          <div className="flex flex-col items-center gap-3 text-sm pt-2">
            <button
              type="button"
              onClick={() => {
                setForgotError(null);
                setStep("forgot");
              }}
              className="font-medium text-[hsl(var(--primary))] hover:underline"
            >
              {t("auth.forgotPassword")}
            </button>
            <button
              type="button"
              onClick={resetToEmail}
              className="font-medium text-[hsl(var(--primary)/0.7)] hover:text-[hsl(var(--primary))]"
            >
              {t("auth.changeEmail")}
            </button>
          </div>
        </form>
      )}

      {step === "forgot" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendReset();
          }}
          className="space-y-5"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium text-[hsl(var(--primary))]">
              {t("auth.emailLabel")}
            </label>
            <Input type="email" value={formData.email} readOnly className={inputClass} />
          </div>

          {forgotError && (
            <p className="text-sm text-destructive" role="alert">
              {forgotError}
            </p>
          )}

          <Button type="submit" className={primaryButtonClass} disabled={forgotBusy}>
            {forgotBusy ? spinner : t("auth.forgotSend")}
          </Button>

          <div className="text-center text-sm pt-2">
            <button
              type="button"
              onClick={() => {
                setForgotError(null);
                setStep("login");
              }}
              className="font-medium text-[hsl(var(--primary))] hover:underline"
            >
              {t("auth.forgotBackToSignIn")}
            </button>
          </div>
        </form>
      )}

      {step === "forgotSent" && (
        <div className="space-y-5">
          <Button
            type="button"
            variant="outline"
            className={outlineButtonClass}
            disabled={forgotBusy}
            onClick={handleSendReset}
          >
            {forgotBusy ? spinner : t("auth.forgotResend")}
          </Button>

          <div className="text-center text-sm pt-2">
            <button
              type="button"
              onClick={() => {
                setForgotError(null);
                setStep("login");
              }}
              className="font-medium text-[hsl(var(--primary))] hover:underline"
            >
              {t("auth.forgotBackToSignIn")}
            </button>
          </div>
        </div>
      )}

      {step === "signup" && (
        <form onSubmit={handleSignup} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[hsl(var(--primary))]">
              {t("auth.emailLabel")}
            </label>
            <Input type="email" value={formData.email} readOnly className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[hsl(var(--primary))]">
                {t("auth.firstName")}
              </label>
              <Input
                required
                autoFocus
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[hsl(var(--primary))]">
                {t("auth.lastName")}
              </label>
              <Input
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[hsl(var(--primary))]">
              {t("auth.password")}
            </label>
            <Input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              minLength={8}
              className={inputClass}
            />
          </div>

          <Button type="submit" className={primaryButtonClass} disabled={registerMutation.isPending}>
            {registerMutation.isPending ? spinner : t("auth.create")}
          </Button>

          <div className="text-center text-sm pt-2">
            <button
              type="button"
              onClick={resetToEmail}
              className="font-medium text-[hsl(var(--primary))] hover:underline"
            >
              {t("auth.changeEmail")}
            </button>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
