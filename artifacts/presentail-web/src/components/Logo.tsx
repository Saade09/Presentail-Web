import { useLocale } from "@/contexts/LocaleContext";
import logoEn from "@assets/Presentail_PNG-01_1777795626872.png";
import logoAr from "@assets/Presentail-Arabic-Logo.png";
import logoEnWhite from "@assets/Presentail_PNG-01_white.png";
import logoArWhite from "@assets/Presentail-Arabic-Logo-white.png";

type LogoProps = {
  height?: number;
  className?: string;
  inverse?: boolean;
};

export function Logo({ height, className, inverse = false }: LogoProps) {
  const { language } = useLocale();
  const isArabic = language === "ar";
  const src = isArabic
    ? inverse ? logoArWhite : logoAr
    : inverse ? logoEnWhite : logoEn;
  return (
    <img
      src={src}
      alt="Presentail"
      style={height !== undefined ? { height, width: "auto" } : undefined}
      className={className}
      draggable={false}
    />
  );
}
