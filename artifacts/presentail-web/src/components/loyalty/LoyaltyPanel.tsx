import { useEffect, useState } from "react";
import { Sparkles, Copy, Check } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { LoyaltyTiersExplainer } from "./LoyaltyTiersInfo";

type LoyaltyCoupon = {
  id: number;
  tier: string;
  tierLabel: string;
  discountPercent: number;
  code: string;
  status: string;
  storeKey: string | null;
  createdAt: string;
};

type LoyaltySummary = {
  points: number;
  tier: { key: string; label: string; threshold: number; discountPercent: number };
  nextTier: { key: string; label: string; threshold: number; discountPercent: number } | null;
  pointsToNext: number | null;
  coupons: LoyaltyCoupon[];
};

const FALLBACK_LOYALTY: LoyaltySummary = {
  points: 0,
  tier: { key: "starter", label: "Starter", threshold: 0, discountPercent: 0 },
  nextTier: null,
  pointsToNext: null,
  coupons: [],
};

export function LoyaltyPanel({ t }: { t: (k: string) => string }) {
  const [data, setData] = useState<LoyaltySummary | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ ok: boolean; loyalty: LoyaltySummary }>("/loyalty/me")
      .then((r) => {
        if (cancelled) return;
        setData(r.loyalty);
      })
      .catch(() => {
        if (cancelled) return;
        setData(FALLBACK_LOYALTY);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div
        className="bg-secondary/30 rounded-3xl p-8 border border-border/50"
        data-testid="loyalty-loading"
      >
        <p className="text-muted-foreground">{t("loyalty.loading")}</p>
      </div>
    );
  }

  const pct = data.nextTier
    ? Math.min(
        100,
        Math.max(
          0,
          ((data.points - data.tier.threshold) /
            (data.nextTier.threshold - data.tier.threshold)) *
            100,
        ),
      )
    : 100;

  const copy = async (id: number, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
    } catch {
      /* clipboard blocked — silent */
    }
  };

  return (
    <div
      className="bg-secondary/30 rounded-3xl p-8 border border-border/50 space-y-8"
      data-testid="loyalty-panel"
    >
      <div>
        <h2 className="text-2xl font-serif">{t("account.loyalty")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("account.loyalty")} · {data.tier.label} {t("loyalty.tier")}
        </p>
      </div>

      {data.points === 0 ? (
        <div
          className="rounded-2xl bg-background/60 border border-border/50 p-6 flex items-center gap-4"
          data-testid="loyalty-no-points"
        >
          <span className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-muted-foreground" />
          </span>
          <p className="text-sm text-muted-foreground">{t("loyalty.noPointsYet")}</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-background/60 border border-border/50 p-6">
          <div className="flex items-baseline justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-gold flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </span>
              <div>
                <div className="text-3xl font-serif" data-testid="loyalty-points">
                  {data.points}
                </div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("loyalty.points")}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("loyalty.currentTier")}
              </div>
              <div className="font-medium text-lg" data-testid="loyalty-tier">
                {data.tier.label}
              </div>
            </div>
          </div>
          {data.nextTier && data.pointsToNext != null ? (
            <div className="mt-5">
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-gold transition-all"
                  style={{ width: `${pct}%` }}
                  data-testid="loyalty-progress"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t("loyalty.pointsToNext").replace("{points}", String(data.pointsToNext)).replace("{tier}", data.nextTier.label).replace("{discount}", String(data.nextTier.discountPercent))}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-4">
              {t("loyalty.vipMessage")}
            </p>
          )}
        </div>
      )}

      {data.points > 0 && data.coupons.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-3">
            {t("loyalty.activeCoupons")}
          </h3>
          <ul className="space-y-3" data-testid="loyalty-coupons">
            {data.coupons.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl bg-background/60 border border-border/50 p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {c.tierLabel} · {t("loyalty.tierDiscount").replace("{n}", String(c.discountPercent))}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground mt-1 truncate">
                    {c.code}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copy(c.id, c.code)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                  data-testid={`loyalty-copy-${c.id}`}
                >
                  {copied === c.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> {t("loyalty.copied")}
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> {t("loyalty.copy")}
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="pt-2 border-t border-border/40">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-3 mt-4">
          {t("loyalty.howTiersWork")}
        </h3>
        <LoyaltyTiersExplainer
          current={data.tier.key}
          points={data.points}
        />
      </div>
    </div>
  );
}
