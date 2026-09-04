// Mirrors @workspace/presentail-os parsePositivePlainDecimal exactly.
const AED_DECIMAL_RE = /^\d+(?:\.\d+)?$/;

export function isExactAedDecimal(value) {
  return typeof value === "string" && value === value.trim() && AED_DECIMAL_RE.test(value) && /[1-9]/.test(value);
}

function compareExactDecimals(left, right) {
  const [li, lf = ""] = left.split(".");
  const [ri, rf = ""] = right.split(".");
  const width = Math.max(lf.length, rf.length);
  const a = BigInt(li + lf.padEnd(width, "0"));
  const b = BigInt(ri + rf.padEnd(width, "0"));
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Resolves a valid native AED selling price without numeric coercion. */
export function resolveExactAedPrice(regular, sale) {
  if (!isExactAedDecimal(regular)) return null;
  return {
    regular,
    sale: isExactAedDecimal(sale) && compareExactDecimals(sale, regular) < 0 ? sale : null,
    selling: isExactAedDecimal(sale) && compareExactDecimals(sale, regular) < 0 ? sale : regular,
  };
}