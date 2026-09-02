import { apiFetch } from "./api";
import type { Product } from "./queries";

export const GMC_MAX_QUANTITY = 99;

export type GmcCheckoutOutcome =
  | "disabled"
  | "missing_identifier"
  | "invalid_identifier"
  | "catalog_unavailable"
  | "not_found"
  | "out_of_market"
  | "out_of_stock"
  | "personalization_required"
  | "resolved";

export type GmcCheckoutResolution = {
  ok: boolean;
  outcome: GmcCheckoutOutcome;
  product?: Product;
  currencyCode?: string;
};

export type GmcCartMutation =
  | { kind: "none" }
  | { kind: "add"; quantity: number };

export function getCaseInsensitiveParam(
  params: URLSearchParams,
  wanted: string,
): string | undefined {
  for (const [key, value] of params.entries()) {
    if (key.toLowerCase() === wanted.toLowerCase()) return value;
  }
  return undefined;
}

/**
 * Invalid and fractional quantities fail safe to one unit. Valid values are
 * clamped to the existing storefront quantity ceiling.
 */
export function normalizeGmcQuantity(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 1;
  return Math.min(GMC_MAX_QUANTITY, Math.max(1, Math.floor(value)));
}

export function getGmcCartMutation(
  existingQuantity: number | undefined,
  requestedQuantity: number | undefined,
): GmcCartMutation {
  const target = requestedQuantity ?? 1;
  if (existingQuantity === undefined) return { kind: "add", quantity: target };
  // An omitted quantity is deliberately inert for an existing line. An
  // explicit quantity only raises the line to the requested amount.
  if (requestedQuantity === undefined || existingQuantity >= target) {
    return { kind: "none" };
  }
  return { kind: "add", quantity: target - existingQuantity };
}


export function removeGmcParams(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower === "item_id" || lower === "quantity") url.searchParams.delete(key);
  }
}

export async function resolveGmcCheckoutLink(input: {
  itemId: string;
  quantity?: number;
  countryCode?: string;
  cityId?: string;
}): Promise<GmcCheckoutResolution> {
  const params = new URLSearchParams({ item_id: input.itemId });
  if (input.quantity !== undefined) params.set("quantity", String(input.quantity));
  if (input.countryCode) params.set("countryCode", input.countryCode);
  if (input.cityId) params.set("cityId", input.cityId);
  return apiFetch<GmcCheckoutResolution>(
    `/products/gmc-checkout-link?${params.toString()}`,
  );
}