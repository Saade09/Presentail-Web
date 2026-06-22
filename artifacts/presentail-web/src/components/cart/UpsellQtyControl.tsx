import { useCart } from "@/contexts/CartContext";
import { useLocale } from "@/contexts/LocaleContext";
import type { ResolvedUpsellProduct } from "@/lib/cartUpsells";

type Props = {
  product: ResolvedUpsellProduct;
  onFirstAdd?: () => void;
  addButtonClassName?: string;
  "data-testid"?: string;
};

export function UpsellQtyControl({
  product,
  onFirstAdd,
  addButtonClassName,
  "data-testid": testId,
}: Props) {
  const { t } = useLocale();
  const { items, addItem, updateQuantity } = useCart();

  const cartItem = items.find((i) => i.product.id === product.id);
  const qty = cartItem?.quantity ?? 0;

  if (qty > 0) {
    return (
      <div
        className="mt-auto w-full flex items-center justify-between bg-primary text-primary-foreground rounded-full overflow-hidden"
        data-testid={testId ? `${testId}-stepper` : undefined}
      >
        <button
          type="button"
          aria-label={t("cart.upsells.decreaseQty")}
          data-testid={testId ? `${testId}-decrease` : undefined}
          onClick={() => updateQuantity(product.id, qty - 1)}
          className="px-3 py-1.5 text-base font-semibold hover:bg-primary/80 transition-colors leading-none"
        >
          −
        </button>
        <span className="text-[11px] font-semibold tabular-nums">{qty}</span>
        <button
          type="button"
          aria-label={t("cart.upsells.increaseQty")}
          data-testid={testId ? `${testId}-increase` : undefined}
          onClick={() => addItem(product, 1)}
          className="px-3 py-1.5 text-base font-semibold hover:bg-primary/80 transition-colors leading-none"
        >
          +
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        addItem(product, 1);
        onFirstAdd?.();
      }}
      aria-label={t("cart.upsells.add")}
      data-testid={testId}
      className={
        addButtonClassName ??
        "mt-auto w-full bg-primary text-primary-foreground rounded-full py-2 text-[11px] font-semibold uppercase tracking-wider hover:bg-primary/90 transition-colors"
      }
    >
      {t("cart.upsells.add")}
    </button>
  );
}
