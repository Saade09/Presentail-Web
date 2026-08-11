import { useMemo, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

// ── Request step (send reset email) ──────────────────────────────────────────

function ResetRequestStep() {
  const { t, dir } = useLocale();
  const { toast } = useToast();

  const initialEmail = useMemo(() => {
    if (typeof window === "undefined") return "";
    return (
      new URLSearchParams(window.location.search)
        .get("email_address")
        ?.trim() ?? ""
    );
  }, []);

  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      toast({
        title: t("auth.toast.error"),
        description: t("auth.invalidEmail"),
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        code?: string;
        message?: string;
      } | null;
      if (res.status === 429) {
        toast({
          title: t("auth.toast.error"),
          description: data?.message ?? t("auth.checkFailed"),
          variant: "destructive",
        });
        return;
      }
      setSent(true);
    } catch {
      toast({
        title: t("auth.toast.error"),
        description: t("auth.checkFailed"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-10 flex justify-center px-4 bg-[#F7F7F7]" dir={dir}>
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-serif">{t("auth.forgotPassword")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("auth.resetPasswordDesc")}
          </p>
        </div>

        {sent ? (
          <div
            className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-center"
            data-testid="text-reset-sent"
          >
            {t("auth.resetEmailSent")}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="reset-email">
                {t("auth.emailLabel")}
              </label>
              <Input
                id="reset-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.emailPlaceholder")}
                data-testid="input-reset-email"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onSubmit();
                }}
                className="h-12 rounded-sm"
              />
            </div>
            <Button
              size="lg"
              className="w-full h-12 rounded-xl"
              onClick={() => void onSubmit()}
              disabled={busy}
              data-testid="button-reset-submit"
            >
              {busy ? t("checkout.processing") : t("auth.sendResetLink")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Confirm step (set new password from reset link) ───────────────────────────

function ResetConfirmStep({ resetKey, login }: { resetKey: string; login: string }) {
  const { t, dir } = useLocale();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (password.length < 8) {
      toast({
        title: t("auth.toast.error"),
        description: t("auth.passwordTooShort"),
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: resetKey, login, password }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        code?: string;
        message?: string;
      } | null;
      if (data?.ok) {
        setSuccess(true);
        return;
      }
      if (data?.code === "expired_link") {
        setLinkError(t("auth.resetLinkExpired"));
        return;
      }
      if (data?.code === "weak_password") {
        toast({
          title: t("auth.toast.error"),
          description: t("auth.passwordTooShort"),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: t("auth.toast.error"),
        description: data?.message ?? t("auth.checkFailed"),
        variant: "destructive",
      });
    } catch {
      toast({
        title: t("auth.toast.error"),
        description: t("auth.checkFailed"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-10 flex justify-center px-4 bg-[#F7F7F7]" dir={dir}>
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        {success ? (
          <>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-serif">{t("auth.resetConfirmTitle")}</h1>
            </div>
            <div
              className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-center mb-6"
              data-testid="text-reset-confirm-success"
            >
              {t("auth.resetSuccessMessage")}
            </div>
            <Button
              size="lg"
              className="w-full h-12 rounded-xl"
              onClick={() => { window.location.href = "/sign-in"; }}
              data-testid="button-reset-sign-in"
            >
              {t("auth.resetSuccessSignIn")}
            </Button>
          </>
        ) : linkError ? (
          <>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-serif">{t("auth.resetConfirmTitle")}</h1>
            </div>
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-center text-destructive mb-6"
              data-testid="text-reset-link-expired"
            >
              {linkError}
            </div>
            <Button
              size="lg"
              variant="outline"
              className="w-full h-12 rounded-xl"
              onClick={() => { window.location.href = "/reset-password"; }}
            >
              {t("auth.sendResetLink")}
            </Button>
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-serif">{t("auth.resetConfirmTitle")}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t("auth.resetConfirmDesc").replace("{email}", login)}
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="reset-new-password">
                  {t("auth.resetNewPasswordLabel")}
                </label>
                <Input
                  id="reset-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.resetNewPasswordPlaceholder")}
                  data-testid="input-reset-new-password"
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void onSubmit();
                  }}
                  className="h-12 rounded-sm"
                />
              </div>
              <Button
                size="lg"
                className="w-full h-12 rounded-xl"
                onClick={() => void onSubmit()}
                disabled={busy || password.length === 0}
                data-testid="button-reset-confirm-submit"
              >
                {busy ? t("checkout.processing") : t("auth.resetConfirmSubmit")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Page router ───────────────────────────────────────────────────────────────
// When the URL contains both `key` and `login` params (from the reset email
// link), show the confirm step.  Otherwise show the request step.

export default function ResetPasswordPage() {
  const { key, login } = useMemo(() => {
    if (typeof window === "undefined") return { key: "", login: "" };
    const params = new URLSearchParams(window.location.search);
    return {
      key: params.get("key")?.trim() ?? "",
      login: params.get("login")?.trim() ?? "",
    };
  }, []);

  if (key && login) {
    return <ResetConfirmStep resetKey={key} login={login} />;
  }
  return <ResetRequestStep />;
}
