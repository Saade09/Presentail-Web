/**
 * lbCityOrder.ts — Lebanon city ordering shared by the landing page and the
 * location picker modal.
 *
 * The eight most popular delivery areas are pinned first (curated by the
 * business, roughly by order volume), and every other active city follows
 * alphabetically by its localized display name. Keeping this in one helper
 * guarantees the landing page and the "Where in Lebanon should we deliver?"
 * picker always show the same order.
 */

export const PINNED_LB_CITY_IDS = [
  "lb-beirut",
  "lb-metn",
  "lb-kesserwan",
  "lb-baabda",
  "lb-aley",
  "lb-tripoli",
  "lb-jbeil",
  "lb-chouf",
] as const;

/**
 * Sort active Lebanon cities: pinned cities first (in curated order), then the
 * rest alphabetically by localized display name. Returns a new array; the
 * input is not mutated. Callers are expected to pass only active cities —
 * inactive/"coming soon" grouping stays the caller's responsibility.
 *
 * @param cities   Active Lebanon cities (any shape with `id` and `name`).
 * @param localize Resolves the localized display name, e.g. `cityName` from
 *                 `useLocale()` — `(id, fallbackName) => localizedName`.
 */
export function sortLbActiveCities<T extends { id: string; name: string }>(
  cities: T[],
  localize: (id: string, fallbackName: string) => string,
): T[] {
  const pinned = PINNED_LB_CITY_IDS as readonly string[];
  return [...cities].sort((a, b) => {
    const aPin = pinned.indexOf(a.id);
    const bPin = pinned.indexOf(b.id);
    if (aPin !== -1 && bPin !== -1) return aPin - bPin;
    if (aPin !== -1) return -1;
    if (bPin !== -1) return 1;
    return localize(a.id, a.name).localeCompare(localize(b.id, b.name));
  });
}
