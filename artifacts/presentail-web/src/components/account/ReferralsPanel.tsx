import { useEffect, useState } from "react";
import { Copy, Check, Share2, Gift } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type ReferralData = {
  code: string;
  shareUrl: string;
};

export function ReferralsPanel({ t }: { t: (k: string) => string }) {
  const [data, setData] = useState<ReferralData | null>(null);
  const [error, setError] = useState(false);
  const [noCode, setNoCode] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ ok: boolean; code: string; shareUrl: string }>("/me/referral-code")
      .then((r) => {
        if (cancelled) return;
        setData({ code: r.code, shareUrl: r.shareUrl });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const apiErr = err as { status?: number; code?: string };
        if (apiErr.status === 404 || apiErr.code === "no_referral_code") {
          setNoCode(true);
        } else {
          setError(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const handleCopy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked
    }
  };

  const handleShare = async () => {
    if (!data) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: t("account.referrals.shareTitle"),
          text: t("account.referrals.shareText"),
          url: data.shareUrl,
        });
      } catch {
        // user dismissed
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="px-6 py-5 border-b border-border/50">
        <h2 className="text-xl font-serif">{t("account.referrals")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("account.referrals.subtitle")}</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Hero */}
        <div className="rounded-2xl bg-gradient-to-br from-primary/8 to-primary/4 border border-primary/15 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-4">
            <Gift className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-serif text-lg mb-1">{t("account.referrals.heroTitle")}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {t("account.referrals.heroDesc")}
          </p>
        </div>

        {/* Referral code */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            {t("account.referrals.yourCode")}
          </p>
          {error || noCode ? (
            <p className="text-sm text-muted-foreground">{t("account.referrals.noCode")}</p>
          ) : !data ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/30 px-5 py-4">
              <span
                className="font-mono text-2xl font-bold tracking-[0.15em] text-primary flex-1 select-all"
                data-testid="referral-code"
              >
                {data.code}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary px-3.5 py-1.5 text-sm font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors shrink-0"
                data-testid="referral-copy"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    {t("loyalty.copied")}
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    {t("loyalty.copy")}
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Share button */}
        {data && (
          <Button
            variant="outline"
            className="w-full rounded-full gap-2"
            onClick={handleShare}
            data-testid="referral-share"
          >
            <Share2 className="w-4 h-4" />
            {t("account.referrals.share")}
          </Button>
        )}

        {/* How it works */}
        <div className="rounded-xl bg-secondary/30 border border-border/40 p-4 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("account.referrals.howItWorks")}
          </p>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <span>{t("account.referrals.step1")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <span>{t("account.referrals.step2")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <span>{t("account.referrals.step3")}</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
