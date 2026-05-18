import { useRef, useMemo, useState } from "react";
import { useSignUp } from "@clerk/react/legacy";
import { useLocation, useRouter } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";

export default function SignUpPage() {
  const router = useRouter();
  const base = (router.base || "").replace(/\/+$/, "");
  const [, setLocation] = useLocation();
  const { t, dir } = useLocale();
  const { toast } = useToast();
  const { isLoaded, signUp, setActive } = useSignUp();

  const initial = useMemo(() => {
    if (typeof window === "undefined") return { email: "", redirectTo: "" };
    const sp = new URLSearchParams(window.location.search);
    return {
      email: sp.get("email_address")?.trim() ?? "",
      redirectTo: sp.get("redirect_url") ?? "",
    };
  }, []);

  type Step = "details" | "code";
  const [step, setStep] = useState<Step>("details");
  const [email, setEmail] = useState(initial.email);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [birthday, setBirthday] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const codeRef = useRef<HTMLInputElement | null>(null);

  const isValidEmail = (v: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!email.trim() || !isValidEmail(email))
      errs.email = t("auth.invalidEmail");
    if (!name.trim()) errs.name = "Name is required.";
    return errs;
  };

  const onCreateAccount = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    if (!isLoaded || !signUp) return;
    setBusy(true);
    try {
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0] ?? name.trim();
      const lastName = nameParts.slice(1).join(" ") || undefined;
      await signUp.create({
        emailAddress: email.trim().toLowerCase(),
        firstName,
        lastName,
        unsafeMetadata: {
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(gender ? { gender } : {}),
          ...(birthday ? { birthday } : {}),
        },
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 100);
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ??
        err?.message ??
        t("auth.checkFailed");
      const errCode = String(err?.errors?.[0]?.code ?? "");
      if (/form_identifier_exists/.test(errCode)) {
        toast({
          title: t("auth.toast.error"),
          description:
            "An account with this email already exists. Please sign in instead.",
        });
        setLocation(
          `/sign-in?email_address=${encodeURIComponent(email.trim())}`,
        );
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
    if (!trimmed || !isLoaded || !signUp) return;
    setBusy(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: trimmed,
      });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive!({ session: result.createdSessionId });
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
    if (!isLoaded || !signUp) return;
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
    <div
      className="min-h-screen flex items-center justify-center pt-24 pb-24 px-4 bg-background"
      dir={dir}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm"
        data-testid="signup-card"
      >
        <div className="text-center mb-6">
          <h1 className="text-2xl font-serif">{t("auth.signup")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {step === "details"
              ? t("auth.signupDesc")
              : t("auth.codeSentTo", { email })}
          </p>
        </div>

        {step === "details" ? (
          <div className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="signup-email">
                {t("auth.emailLabel")}{" "}
                <span className="text-destructive">*</span>
              </label>
              <Input
                id="signup-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((p) => ({ ...p, email: "" }));
                }}
                placeholder={t("auth.emailPlaceholder")}
                disabled={busy}
                data-testid="input-signup-email"
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
            </div>

            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="signup-name">
                Full Name <span className="text-destructive">*</span>
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
                placeholder="Your full name"
                disabled={busy}
                data-testid="input-signup-name"
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="signup-phone">
                Phone Number{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <Input
                id="signup-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+961 3 000 000"
                disabled={busy}
                data-testid="input-signup-phone"
              />
            </div>

            {/* Gender */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="signup-gender">
                Gender{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <select
                id="signup-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                disabled={busy}
                data-testid="input-signup-gender"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>

            {/* Birthday */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="signup-birthday">
                Birthday{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <Input
                id="signup-birthday"
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                disabled={busy}
                data-testid="input-signup-birthday"
              />
            </div>

            <Button
              size="lg"
              className="w-full h-12 rounded-xl mt-2"
              onClick={() => void onCreateAccount()}
              disabled={busy || !isLoaded}
              data-testid="button-signup-create"
            >
              {busy ? t("checkout.processing") : t("auth.signup")}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() =>
                  setLocation(
                    `/sign-in${email ? `?email_address=${encodeURIComponent(email)}` : ""}`,
                  )
                }
                className="text-primary hover:underline font-medium"
                data-testid="link-signup-signin"
              >
                Sign in
              </button>
            </p>
          </div>
        ) : (
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onVerifyCode();
                }}
                data-testid="input-signup-code"
              />
            </div>
            <Button
              size="lg"
              className="w-full h-12 rounded-xl"
              onClick={() => void onVerifyCode()}
              disabled={busy || !isLoaded || code.length < 4}
              data-testid="button-signup-verify"
            >
              {busy ? t("checkout.processing") : t("auth.verifyCode")}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => {
                  setStep("details");
                  setCode("");
                }}
                data-testid="button-signup-back"
              >
                {t("auth.changeEmail")}
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
        )}
      </div>
    </div>
  );
}
