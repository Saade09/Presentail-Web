const SUPPORTED_LANGS = new Set(["en", "ar", "fr", "el"]);

/**
 * Resolve the one supported locale-only GMC route to its canonical city URL.
 * Returns null for normal traffic so the existing server routing is unchanged.
 */
export function resolveGmcLocaleOnlyCheckoutRedirect(
  pathname,
  search = "",
  basePath = "",
) {
  const match = pathname.match(/^\/([a-z]{2})-cy\/checkout\/?$/);
  if (!match || !SUPPORTED_LANGS.has(match[1])) return null;

  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const hasItemId = [...params.keys()].some((key) => key.toLowerCase() === "item_id");
  if (!hasItemId) return null;

  const cleanBase = basePath ? basePath.replace(/\/$/, "") : "";
  return `${cleanBase}/${match[1]}-cy/nicosia/checkout${search}`;
}