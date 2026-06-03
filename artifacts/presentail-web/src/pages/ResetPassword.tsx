import { useMemo, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPasswordPage() {
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

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

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
