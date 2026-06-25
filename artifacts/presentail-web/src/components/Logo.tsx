import { useLocale } from "@/contexts/LocaleContext";
import logoEn from "@assets/Presentail_PNG-01_1777795626872.png";
import logoAr from "@assets/Presentail-Arabic-Logo.png";
import logoEnWhite from "@assets/Presentail_PNG-01_white.png";
import logoArWhite from "@assets/Presentail-Arabic-Logo-white.png";

const AR_SCALE = 0.55;

type LogoProps = {
  height?: number;
  className?: string;
  inverse?: boolean;
};

export function Logo({ height, className, inverse = false }: LogoProps) {
  const { language, t } = useLocale();
  const isArabic = language === "ar";
  const src = isArabic
    ? inverse ? logoArWhite : logoAr
    : inverse ? logoEnWhite : logoEn;

  let style: React.CSSProperties | undefined;
  if (height !== undefined) {
    style = { height: isArabic ? Math.round(height * AR_SCALE) : height, width: "auto" };
  } else if (isArabic) {
    style = { zoom: AR_SCALE };
  }

  const [intrinsicWidth, intrinsicHeight] = isArabic ? [3250, 792] : [4167, 2383];

  return (
    <img
      src={src}
      alt={t("nav.logoAria")}
      width={intrinsicWidth}
      height={intrinsicHeight}
      style={style}
      className={className}
      draggable={false}
    />
  );
}
