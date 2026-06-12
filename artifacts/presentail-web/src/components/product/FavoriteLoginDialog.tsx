import { useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";

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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FavoriteLoginDialog({ open, onOpenChange }: Props) {
  const { t, dir } = useLocale();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState<"google" | "apple" | null>(null);

  const onContinueEmail = () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setEmailError(t("auth.invalidEmail"));
      return;
    }
    setEmailError(null);
    const qs = new URLSearchParams({ email_address: trimmed }).toString();
    onOpenChange(false);
    setLocation(`/sign-in?${qs}`);
  };

  const onOAuth = (provider: "google" | "apple") => {
    setOauthBusy(provider);
    const qs = new URLSearchParams({
      strategy: provider === "google" ? "oauth_google" : "oauth_apple",
    }).toString();
    onOpenChange(false);
    setLocation(`/sign-in?${qs}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={dir}
        className="max-w-md p-0 overflow-hidden"
        data-testid="dialog-favorite-login"
      >
        <div className="px-6 pt-8 pb-6 text-center">
          <h2 className="text-2xl font-serif mb-2">
            {t("product.favoriteLogin.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("product.favoriteLogin.desc")}
          </p>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="favorite-login-email">
              {t("auth.emailLabel")}
            </label>
            <Input
              id="favorite-login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              placeholder={t("auth.emailPlaceholder")}
              data-testid="input-favorite-login-email"
            />
            {emailError ? (
              <p
                className="text-xs text-destructive"
                data-testid="text-favorite-login-email-error"
              >
                {emailError}
              </p>
            ) : null}
          </div>

          <Button
            size="lg"
            className="w-full h-12 rounded-xl"
            onClick={onContinueEmail}
            data-testid="button-favorite-login-continue"
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
              className="w-full h-12 rounded-xl flex items-center justify-center gap-2"
              onClick={() => onOAuth("apple")}
              disabled={oauthBusy !== null}
              data-testid="button-favorite-login-apple"
            >
              <AppleLogo />
              {t("auth.continueApple")}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full h-12 rounded-xl flex items-center justify-center gap-2"
              onClick={() => onOAuth("google")}
              disabled={oauthBusy !== null}
              data-testid="button-favorite-login-google"
            >
              <GoogleLogo />
              {t("auth.continueGoogle")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
