import { Fragment } from "react";
import { FormattedPrice } from "@/components/FormattedPrice";

/**
 * Renders a translated template containing `{key}` amount placeholders as a
 * React node, substituting each placeholder with a <FormattedPrice> so the
 * amount shows the proper currency symbol (e.g. the dirham SVG for AED)
 * instead of a plain-text currency code inside sentence copy.
 *
 * Amounts are raw USD values — FormattedPrice performs the FX conversion.
 */
export function buildFeeNode(
  template: string,
  amounts: Record<string, number>,
): React.ReactNode {
  const re = /\{(\w+)\}/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    if (m.index > lastIndex) parts.push(template.slice(lastIndex, m.index));
    const key = m[1];
    parts.push(
      key in amounts // i18n-ignore — JS expression, not user-visible text
        ? <FormattedPrice key={`${key}-${m.index}`} usdValue={amounts[key]} />
        : m[0],
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < template.length) parts.push(template.slice(lastIndex));
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}
