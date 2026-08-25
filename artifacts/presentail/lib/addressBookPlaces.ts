import { API_BASE } from "@/lib/stripe";

export type CheckoutPlace = {
  id: string;
  name: string;
  officialName: string | null;
  aliases?: string[];
  area: string | null;
  districtName: string | null;
  districtCityId: string | null;
  districtCityName: string | null;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
  verified: true;
  followUpQuestion: string | null;
  followUpPlaceholder: string | null;
};

type PlacesResponse = {
  ok?: boolean;
  places?: CheckoutPlace[];
};

export async function searchCheckoutPlaces(
  query: string,
  countryCode: string,
): Promise<CheckoutPlace[]> {
  const params = new URLSearchParams({
    q: query.trim(),
    country: countryCode.toUpperCase(),
  });
  const response = await fetch(`${API_BASE}/api/address-book/places/search?${params.toString()}`);
  if (!response.ok) return [];
  const body = (await response.json()) as PlacesResponse;
  return Array.isArray(body.places) ? body.places : [];
}

export function flattenPlaceAddress(place: CheckoutPlace, internalDetail: string): string {
  const namePart = place.officialName ? `${place.name} (${place.officialName})` : place.name;
  const areaPart = [place.area, place.districtCityName ?? place.districtName]
    .filter((part): part is string => Boolean(part?.trim()))
    .filter((part, index, all) => all.findIndex((item) => item.toLowerCase() === part.toLowerCase()) === index)
    .join(", ");

  return [namePart, internalDetail.trim(), areaPart]
    .filter((part) => part.length > 0)
    .join(" — ");
}

export function placeSecondaryLine(place: CheckoutPlace): string | null {
  if (place.officialName) return place.officialName;
  const aliases = (place.aliases ?? []).filter(
    (alias) => alias.trim().length > 0 && alias.trim().toLowerCase() !== place.name.trim().toLowerCase(),
  );
  return aliases.length > 0 ? aliases.join(", ") : null;
}