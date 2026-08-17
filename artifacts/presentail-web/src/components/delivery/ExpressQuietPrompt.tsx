import { X, Zap } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { buildFeeNode } from "@/lib/feeNode";

interface Props {
  /** "Express arrives by [exact local time]" line — parent guarantees it is exact (prompt is suppressed otherwise). */
  arrivesByLine: string;
  /** Exact incremental price of switching to Express (USD). */
  deltaUsd: number;
  /** Fired when the shopper taps "See option" — opens the confirmation, never switches directly. */
  onSeeOption: () => void;
  /** Fired when the shopper dismisses the prompt. */
  onDismiss: () => void;
}

/**
 * Quiet secondary "Need it today?" prompt shown in the cart's Delivery
 * Summary when the active delivery selection was *system-assigned* to a
 * future date while same-day Express is still available. Deliberately more
 * muted than ExpressUpgradeCard and never one-click: "See option" opens a
 * confirmation step.
 */
export function ExpressQuietPrompt({ arrivesByLine, deltaUsd, onSeeOption, onDismiss }: Props) {
  const { t } = useLocale();
  return (
    <div
      className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3"
      data-testid="card-express-quiet-prompt"
    >
      <Zap className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <span className="block text-xs font-medium text-foreground" data-testid="text-express-prompt-title">
          {t("cart.expressPrompt.title")}
        </span>
        <span
          className="block text-xs text-muted-foreground whitespace-normal break-words"
          data-testid="text-express-prompt-arrival"
        >
          {arrivesByLine}
          {" · "}
          <span className="tabular-nums">{buildFeeNode(t("cart.expressDelta"), { amount: deltaUsd })}</span>
        </span>
      </div>
      <button
        type="button"
        onClick={onSeeOption}
        className="min-h-9 shrink-0 rounded-full border border-border bg-white px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`${t("cart.expressPrompt.title")} — ${arrivesByLine} — ${t("cart.expressPrompt.cta")}`}
        data-testid="button-express-prompt-see-option"
      >
        {t("cart.expressPrompt.cta")}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("cart.expressPrompt.dismissAria")}
        className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="button-express-prompt-dismiss"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
