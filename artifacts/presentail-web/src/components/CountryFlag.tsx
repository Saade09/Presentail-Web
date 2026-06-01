import LB from "country-flag-icons/react/3x2/LB";
import AE from "country-flag-icons/react/3x2/AE";
import CY from "country-flag-icons/react/3x2/CY";
import US from "country-flag-icons/react/3x2/US";
import GB from "country-flag-icons/react/3x2/GB";
import EU from "country-flag-icons/react/3x2/EU";
import CA from "country-flag-icons/react/3x2/CA";
import AU from "country-flag-icons/react/3x2/AU";
import QA from "country-flag-icons/react/3x2/QA";
import SA from "country-flag-icons/react/3x2/SA";
import KW from "country-flag-icons/react/3x2/KW";
import OM from "country-flag-icons/react/3x2/OM";
import CH from "country-flag-icons/react/3x2/CH";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FLAGS: Record<string, React.ComponentType<any>> = {
  LB, AE, CY, US, GB, EU, CA, AU, QA, SA, KW, OM, CH,
};

type Props = {
  code: string;
  title?: string;
  className?: string;
};

/**
 * Renders an SVG country/region flag for a given ISO-3166-1 alpha-2 or
 * region code (EU supported). Falls back to null for unknown codes.
 */
export function CountryFlag({ code, title, className = "w-5 h-auto" }: Props) {
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
