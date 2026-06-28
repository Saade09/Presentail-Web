const STARTUP_KEYS = [
  "presentail_delivery_location_v1",
  "presentail_lang_v1",
  "presentail_language_v1",
  "presentail_web_token",
  "presentail_web_provider",
  "presentail_cart_v1",
] as const;

type StartupKey = (typeof STARTUP_KEYS)[number];

const _cache = new Map<StartupKey, string | null>();

if (typeof window !== "undefined") {
  try {
    for (const key of STARTUP_KEYS) {
      _cache.set(key, localStorage.getItem(key));
    }
  } catch {
  }
}

export function getStartupItem(key: StartupKey): string | null {
  return _cache.get(key) ?? null;
}
