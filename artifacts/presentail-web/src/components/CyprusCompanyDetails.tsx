import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";

type CyprusCompanyDetailsProps = {
  className?: string;
};

/**
 * The Cyprus legal entity details are required on every public Cyprus web
 * surface, including shells that intentionally do not render the full footer.
 * Keep this as a static paragraph rather than a navigation item or accordion
 * so it is always exposed in the rendered page content.
 */
export function CyprusCompanyDetails({
  className = "",
}: CyprusCompanyDetailsProps) {
  const { t } = useLocale();
  const { countryCode } = useLocationSelection();

  if (countryCode?.toUpperCase() !== "CY") return null;

  const year = new Date().getFullYear();

  return (
    <p
      className={`text-xs leading-relaxed ${className}`.trim()}
      data-testid="cyprus-company-details"
    >
      {t("footer.cyprusCompanyDetails", { year })}
    </p>
  );
}