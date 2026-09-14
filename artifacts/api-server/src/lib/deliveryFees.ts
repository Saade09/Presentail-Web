export type ExpressFeeConfig = {
  cityFeeUsd?: number | null;
  expressSurchargeUsd?: number;
  expressFeeTotalUsd?: number;
  expressSurchargeIsExplicit?: boolean;
};

/**
 * Resolve the total Express delivery fee that replaces standard delivery.
 *
 * Express delivery is a separate service: when a customer chooses Express,
 * only this amount is charged — the standard district fee is NOT added on top.
 * Callers must therefore zero out `districtFeeUsd` whenever Express is active.
 *
 * Semantics by source:
 * - OS `express_delivery_fee` (no explicit surcharge): the returned value IS the
 *   configured Express total, regardless of cart subtotal or the free-delivery
 *   threshold. Pass it through unchanged.
 * - Explicit OS `express_surcharge`: the surcharge is charged in addition to
 *   whatever the standard fee would have been (`effectiveStandardFeeUsd`).
 *   The resolver returns that combined total so callers remain uniform.
 * - Legacy snapshots / hardcoded fallback: treated as additive surcharges on
 *   top of the standard fee, same as explicit surcharges.
 */
export function resolveEffectiveExpressFeeUsd(
  config: ExpressFeeConfig | null | undefined,
  effectiveStandardFeeUsd: number,
  fallbackExpressFeeUsd: number,
): number {
  // Explicit OS surcharge: Express total = standard fee + declared surcharge.
  if (
    config?.expressSurchargeIsExplicit === true &&
    typeof config.expressSurchargeUsd === "number" &&
    Number.isFinite(config.expressSurchargeUsd)
  ) {
    return Math.max(0, effectiveStandardFeeUsd + config.expressSurchargeUsd);
  }

  // OS-configured Express total: always charge this amount exactly.
  // Free-delivery thresholds apply only to standard delivery; they never
  // reduce the Express fee.
  if (
    typeof config?.expressFeeTotalUsd === "number" &&
    Number.isFinite(config.expressFeeTotalUsd)
  ) {
    return Math.max(0, config.expressFeeTotalUsd);
  }

  // Compatibility: legacy snapshots that only have expressSurchargeUsd.
  if (
    typeof config?.expressSurchargeUsd === "number" &&
    config.expressSurchargeUsd > 0
  ) {
    return Math.max(0, effectiveStandardFeeUsd + config.expressSurchargeUsd);
  }

  // Hardcoded country-level fallback.
  return Math.max(0, effectiveStandardFeeUsd + fallbackExpressFeeUsd);
}
