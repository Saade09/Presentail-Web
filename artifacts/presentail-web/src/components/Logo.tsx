import { useLocale } from "@/contexts/LocaleContext";
import logoEn from "@assets/Presentail_PNG-01_1777795626872.png";
import logoAr from "@assets/Presentail-Arabic-Logo.png";

type LogoProps = {
  height?: number;
  className?: string;
};

export function Logo({ height = 32, className }: LogoProps) {
  const { language } = useLocale();
  const isArabic = language === "ar";
  const src = isArabic ? logoAr : logoEn;
  return (
    <img
      src={src}
      alt="Presentail"
      style={{ height, width: "auto" }}
      className={className}
      draggable={false}
    />
  );
}
