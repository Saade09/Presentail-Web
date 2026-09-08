export type CommercialServiceCopy = {
  market: string;
  heading: string;
  body: string;
  details: string[];
  occasionsLabel: string;
  contactLabel: string;
};

export function getCommercialServiceCopy(
  page: "corporate" | "weddings",
  lang: string,
  country: string | null | undefined,
  city: string,
): CommercialServiceCopy | null;