const SESSION_KEY = "ps_occasion_ref";

/** Record the occasion slug the shopper navigated from. Stored in sessionStorage
 *  so it survives within-tab checkout navigation but clears after the tab closes. */
export function setOccasionRef(slug: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, slug);
  } catch {
    // sessionStorage may be unavailable in private browsing or cross-origin frames
  }
}

/** Read the current occasion ref (slug), or null if none was set this session. */
export function readOccasionRef(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** Clear the occasion ref after it has been sent with an order. */
export function clearOccasionRef(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
