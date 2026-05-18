import LB from "country-flag-icons/react/3x2/LB";
import AE from "country-flag-icons/react/3x2/AE";
import CY from "country-flag-icons/react/3x2/CY";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FLAGS: Record<string, React.ComponentType<any>> = { LB, AE, CY };

type Props = {
  code: string;
  title?: string;
  className?: string;
};

/**
 * Renders an SVG country flag for a given ISO-3166-1 alpha-2 code.
 * Falls back to null for unknown codes.
 */
export function CountryFlag({ code, title, className = "w-5 h-auto rounded-[2px]" }: Props) {
  const Flag = FLAGS[code.toUpperCase()];
  if (!Flag) return null;
  return (
    <Flag
      title={title}
      aria-hidden={title ? undefined : true}
      className={className}
      style={{ display: "block", flexShrink: 0 }}
    />
  );
}
