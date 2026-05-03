import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLogin, useRegister, checkEmailExists, requestPasswordReset } from "@/lib/queries";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import authBg from "@/assets/hero.png";
import { useLocale } from "@/contexts/LocaleContext";

type Step = "email" | "login" | "signup" | "forgot" | "forgotSent";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      // Unknown-email responses come back as a 404 with code "unknown_email".
      // Treat those as success so we don't leak account existence beyond what
      // the email-first step already implied. Transport/upstream failures
      // surface a neutral retry message instead of silently advancing.
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

  const heading =
    step === "email"
      ? t("auth.welcome")
      : step === "login"
      ? t("auth.welcome")
      : step === "signup"
      ? t("auth.create")
      : step === "forgot"
      ? t("auth.forgotTitle")
      : t("auth.forgotSentTitle");
  const description =
    step === "email"
      ? t("auth.emailStepDesc")
      : step === "login"
      ? t("auth.signinDesc")
      : step === "signup"
      ? t("auth.signupDesc")
      : step === "forgot"
      ? t("auth.forgotDesc")
      : t("auth.forgotSentDesc", { email: formData.email });

  return (
    <div className="min-h-screen flex pt-20">
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-12 md:px-24">
        <div className="max-w-md w-full mx-auto space-y-8">
          <div>
            <h1 className="text-4xl font-serif mb-2">{heading}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>

          {step === "email" && (
            <form onSubmit={handleContinueEmail} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("auth.email")}</label>
                <Input
                  type="email"
                  required
                  autoFocus
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                {emailError && (
                  <p className="text-sm text-destructive" role="alert">
                    {emailError}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full h-14 rounded-xl mt-6"
                disabled={emailChecking}
              >
                {emailChecking ? (
                  <span className="inline-block h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  t("auth.continue")
                )}
              </Button>
            </form>
          )}

          {step === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              {arrivedFromCheck && (
                <p className="text-sm text-muted-foreground">{t("auth.accountFound")}</p>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("auth.email")}</label>
                <Input type="email" value={formData.email} readOnly />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("auth.password")}</label>
                <Input
                  type="password"
                  required
                  autoFocus
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  minLength={8}
                />
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full h-14 rounded-xl mt-6"
                disabled={loginMutation.isPending}
              >
                {t("auth.signin")}
              </Button>

              <div className="flex flex-col items-center gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setForgotError(null);
                    setStep("forgot");
                  }}
                  className="font-medium hover:text-primary transition-colors"
                >
                  {t("auth.forgotPassword")}
                </button>
                <button
                  type="button"
                  onClick={resetToEmail}
                  className="font-medium hover:text-primary transition-colors"
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
              className="space-y-4"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("auth.email")}</label>
                <Input type="email" value={formData.email} readOnly />
              </div>

              {forgotError && (
                <p className="text-sm text-destructive" role="alert">
                  {forgotError}
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full h-14 rounded-xl mt-6"
                disabled={forgotBusy}
              >
                {forgotBusy ? (
                  <span className="inline-block h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  t("auth.forgotSend")
                )}
              </Button>

              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setForgotError(null);
                    setStep("login");
                  }}
                  className="font-medium hover:text-primary transition-colors"
                >
                  {t("auth.forgotBackToSignIn")}
                </button>
              </div>
            </form>
          )}

          {step === "forgotSent" && (
            <div className="space-y-4">
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-full h-14 rounded-xl"
                disabled={forgotBusy}
                onClick={handleSendReset}
              >
                {forgotBusy ? (
                  <span className="inline-block h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  t("auth.forgotResend")
                )}
              </Button>

              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setForgotError(null);
                    setStep("login");
                  }}
                  className="font-medium hover:text-primary transition-colors"
                >
                  {t("auth.forgotBackToSignIn")}
                </button>
              </div>
            </div>
          )}

          {step === "signup" && (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("auth.email")}</label>
                <Input type="email" value={formData.email} readOnly />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("auth.firstName")}</label>
                  <Input
                    required
                    autoFocus
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("auth.lastName")}</label>
                  <Input
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("auth.password")}</label>
                <Input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  minLength={8}
                />
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full h-14 rounded-xl mt-6"
                disabled={registerMutation.isPending}
              >
                {t("auth.create")}
              </Button>

              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={resetToEmail}
                  className="font-medium hover:text-primary transition-colors"
                >
                  {t("auth.changeEmail")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="hidden lg:block lg:flex-1 relative bg-secondary">
        <img src={authBg} alt={t("auth.heroAlt")} className="absolute inset-0 w-full h-full object-cover opacity-80 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <blockquote className="text-3xl font-serif leading-snug mb-4">
            {t("auth.quote")}
          </blockquote>
          <p className="opacity-80">{t("auth.atelier")}</p>
        </div>
      </div>
    </div>
  );
}
