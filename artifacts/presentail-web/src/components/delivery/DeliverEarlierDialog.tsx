import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarDays, Zap } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { FormattedPrice } from "@/components/FormattedPrice";

interface Props {
  open: boolean;
  /** Close via overlay/escape — treated as "keep scheduled delivery". */
  onOpenChange: (open: boolean) => void;
  /** Complete original date/window line, e.g. "Arrives tomorrow, 2–5 PM". */
  originalLine: string;
  /** Complete new date/ETA line, e.g. "Arrives today by 4:30 PM". */
  newLine: string;
  /** Exact change in the cart Total (USD) if the shopper confirms. */
  totalChangeUsd: number;
  /** Primary "Deliver earlier" — commits the earlier selection. */
  onConfirm: () => void;
  /** Secondary "Keep scheduled delivery" — preserves the original selection. */
  onCancel: () => void;
  /** True while the confirm action is committing (disables both actions). */
  confirming?: boolean;
}

/**
 * "Deliver earlier?" confirmation. Used by the cart's quiet "Need it today?"
 * prompt and by the delivery picker whenever a newly picked option moves the
 * delivery to an earlier calendar date. Never changes the selection itself —
 * the caller commits on `onConfirm` and must preserve the original selection
 * (and totals) on `onCancel`/close.
 */
export function DeliverEarlierDialog({
  open,
  onOpenChange,
  originalLine,
  newLine,
  totalChangeUsd,
  onConfirm,
  onCancel,
  confirming = false,
}: Props) {
  const { t } = useLocale();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && open) onCancel();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md" data-testid="dialog-deliver-earlier">
        <DialogTitle className="text-xl font-serif">{t("cart.deliverEarlier.title")}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {t("cart.deliverEarlier.subtitle")}
        </DialogDescription>

        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <span className="block text-xs font-medium text-muted-foreground">
                {t("cart.deliverEarlier.current")}
              </span>
              <span className="block font-semibold text-foreground whitespace-normal break-words" data-testid="text-deliver-earlier-original">
                {originalLine}
              </span>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-[#FBF7EF] px-4 py-3">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <span className="block text-xs font-medium text-muted-foreground">
                {t("cart.deliverEarlier.new")}
              </span>
              <span className="block font-semibold text-foreground whitespace-normal break-words" data-testid="text-deliver-earlier-new">
                {newLine}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 px-1">
            <span className="font-medium">{t("cart.deliverEarlier.totalChange")}</span>
            <span className="font-semibold tabular-nums" data-testid="text-deliver-earlier-total-change">
              {totalChangeUsd >= 0 ? "+" : "−"}
              <FormattedPrice usdValue={Math.abs(totalChangeUsd)} />
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            className="w-full rounded-xl"
            onClick={onConfirm}
            disabled={confirming}
            aria-busy={confirming}
            data-testid="button-deliver-earlier-confirm"
          >
            {t("cart.deliverEarlier.confirm")}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="w-full rounded-xl"
            onClick={onCancel}
            disabled={confirming}
            data-testid="button-deliver-earlier-keep"
          >
            {t("cart.deliverEarlier.keep")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
