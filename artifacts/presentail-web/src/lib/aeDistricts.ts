/**
 * aeDistricts.ts — UAE emirate ordering and helper for the checkout district picker.
 *
 * The four served emirates are listed in descending delivery-volume order so
 * Dubai appears first in the picker.  Unserved emirates (marked isActive===false
 * by Presentail OS) are sorted after all served ones — they are not removed so
 * shoppers can still see that those areas exist.
 */

export const AE_EMIRATE_ORDER = [
  "Dubai",
  "Abu Dhabi",
  "Sharjah",
  "Al Ain",
] as const;

/**
 * Sort a UAE city list so served emirates appear in delivery-volume order
 * (Dubai → Abu Dhabi → Sharjah → Al Ain) and inactive/unserved ones are
 * grouped at the bottom.  Non-AE lists are returned unchanged.
 *
 * The function is generic so it works with both the web OSCity shape and the
 * mobile CheckoutDistrict shape — any object with `name` and optional `isActive`.
 */
export function sortAECities<T extends { name: string; isActive?: boolean }>(
  cities: T[],
): T[] {
  const active = cities.filter((c) => c.isActive !== false);
  const inactive = cities.filter((c) => c.isActive === false);
  const preferred: T[] = AE_EMIRATE_ORDER
    .map((n) => active.find((c) => c.name === n))
    .filter((c): c is T => c != null);
  const rest = active.filter(
    (c) => !(AE_EMIRATE_ORDER as readonly string[]).includes(c.name),
  );
  return [...preferred, ...rest, ...inactive];
}
