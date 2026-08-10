/**
 * Returns an alternative URI to retry when the primary image URL fails.
 *
 * For proxy URLs served through the API server (e.g. /api/os/image?url=…
 * or /api/img/proxy?url=…), the raw upstream URL is extracted so the retry
 * goes directly to the origin rather than hitting the same proxy that just
 * failed.
 *
 * For direct CDN / OS URLs, the original URI is returned unchanged.  The
 * caller can still force a fresh network request by remounting the Image
 * component (change its `key` prop) even though the source string is the same.
 */
export function getFallbackUri(uri: string): string {
  try {
    const u = new URL(uri);
    const urlParam = u.searchParams.get("url");
    if (
      urlParam &&
      (u.pathname.endsWith("/os/image") || u.pathname.endsWith("/img/proxy"))
    ) {
      return urlParam;
    }
  } catch {
    // Not a parseable URL — fall through.
  }
  return uri;
}
