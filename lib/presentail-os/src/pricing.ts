/**
 * OS-native AED pricing is a lexical decimal contract. Keep the original
 * string (including configured trailing zeros) rather than round-tripping it
 * through JavaScript's binary number representation.
 */
const PLAIN_DECIMAL = /^\d+(?:\.\d+)?$/;

/** Returns the untouched positive plain-decimal string, or null when invalid. */
export function parsePositivePlainDecimal(value: unknown): string | null {
  if (typeof value !== "string" || value !== value.trim() || !PLAIN_DECIMAL.test(value)) {
    return null;
  }
  return /[1-9]/.test(value) ? value : null;
}

/** Compares two already-valid non-negative plain decimal strings exactly. */
export function comparePlainDecimals(left: string, right: string): number {
  const [leftWhole, leftFraction = ""] = left.split(".");
  const [rightWhole, rightFraction = ""] = right.split(".");
  const normalizedLeftWhole = leftWhole.replace(/^0+(?=\d)/, "");
  const normalizedRightWhole = rightWhole.replace(/^0+(?=\d)/, "");
  if (normalizedLeftWhole.length !== normalizedRightWhole.length) {
    return normalizedLeftWhole.length < normalizedRightWhole.length ? -1 : 1;
  }
  if (normalizedLeftWhole !== normalizedRightWhole) {
    return normalizedLeftWhole < normalizedRightWhole ? -1 : 1;
  }
  const width = Math.max(leftFraction.length, rightFraction.length);
  const paddedLeft = leftFraction.padEnd(width, "0");
  const paddedRight = rightFraction.padEnd(width, "0");
  return paddedLeft === paddedRight ? 0 : paddedLeft < paddedRight ? -1 : 1;
}

export function resolveNativeAedPrices(
  regularValue: unknown,
  saleValue: unknown,
): { priceAedExact: string | null; discountPriceAedExact: string | null } {
  const priceAedExact = parsePositivePlainDecimal(regularValue);
  const sale = parsePositivePlainDecimal(saleValue);
  return {
    priceAedExact,
    discountPriceAedExact:
      priceAedExact !== null && sale !== null && comparePlainDecimals(sale, priceAedExact) < 0
        ? sale
        : null,
  };
}