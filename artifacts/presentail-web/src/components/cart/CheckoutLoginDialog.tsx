import { useState } from "react";
import { useSignIn } from "@clerk/react/legacy";
import { useLocation, useRouter } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinueAsGuest: () => void;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function CheckoutLoginDialog({
  open,
  onOpenChange,
  onContinueAsGuest,
}: Props) {
  const { t, dir } = useLocale();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const router = useRouter();
  const { isLoaded, signIn } = useSignIn();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState<"google" | "apple" | null>(null);

  const base = (router.base || "").replace(/\/+$/, "");
  // Where to send the user after sign-in completes — straight to checkout.
  const redirectAfterAuth = `${base}/checkout`;

  const onContinueEmail = () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setEmailError(t("auth.invalidEmail"));
      return;
    }
    setEmailError(null);
    // Clerk's hosted <SignIn> form owns the multi-step email flow. We
    // forward the typed email as a hint via the URL (Clerk's hosted form
    // doesn't currently consume `email_address`, so this is best-effort
    // for future wiring; tracked as a follow-up) and set redirect_url so
    // the user lands on /checkout after sign-in.
    const qs = new URLSearchParams({
      redirect_url: "/checkout",
      email_address: trimmed,
    }).toString();
    onOpenChange(false);
    setLocation(`/sign-in?${qs}`);
  };

  const onOAuth = async (provider: "google" | "apple") => {
    if (!isLoaded || !signIn) return;
    try {
      setOauthBusy(provider);
      await signIn.authenticateWithRedirect({
        strategy: provider === "google" ? "oauth_google" : "oauth_apple",
        // Clerk needs absolute URLs here; same-origin is fine because the
        // storefront and Clerk callback both live under the wouter base.
        redirectUrl: `${window.location.origin}${base}/sign-in/sso-callback`,
        redirectUrlComplete: `${window.location.origin}${redirectAfterAuth}`,
      });
    } catch (err) {
      setOauthBusy(null);
      toast({
        title: t("auth.toast.oauthFailed", {
          provider: provider === "google" ? "Google" : "Apple",
        }),
        description:
          err instanceof Error ? err.message : t("auth.toast.error"),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={dir}
        className="max-w-md p-0 overflow-hidden"
        data-testid="dialog-checkout-login"
      >
        <div className="px-6 pt-8 pb-6 text-center">
          <h2 className="text-2xl font-serif mb-2">
            {t("checkoutLogin.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("checkoutLogin.desc")}
          </p>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="checkout-login-email">
              {t("auth.emailLabel")}
            </label>
            <Input
              id="checkout-login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              placeholder={t("auth.emailPlaceholder")}
              data-testid="input-checkout-login-email"
            />
            {emailError ? (
              <p
                className="text-xs text-destructive"
                data-testid="text-checkout-login-email-error"
              >
                {emailError}
              </p>
            ) : null}
          </div>

          <Button
            size="lg"
            className="w-full h-12 rounded-xl"
            onClick={onContinueEmail}
            data-testid="button-checkout-login-continue"
          >
            {t("auth.continue")}
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
              className="w-full h-12 rounded-xl"
              onClick={() => onOAuth("google")}
              disabled={!isLoaded || oauthBusy !== null}
              data-testid="button-checkout-login-google"
            >
              {oauthBusy === "google"
                ? t("checkout.processing")
                : t("auth.continueGoogle")}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full h-12 rounded-xl"
              onClick={() => onOAuth("apple")}
              disabled={!isLoaded || oauthBusy !== null}
              data-testid="button-checkout-login-apple"
            >
              {oauthBusy === "apple"
                ? t("checkout.processing")
                : t("auth.continueApple")}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="lg"
            className="w-full h-12 rounded-xl border border-primary/30 text-primary hover:bg-primary/5"
            onClick={() => {
              onOpenChange(false);
              onContinueAsGuest();
            }}
            data-testid="button-checkout-as-guest"
          >
            {t("checkoutLogin.guest")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
