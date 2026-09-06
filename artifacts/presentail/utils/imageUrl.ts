/**
 * Returns an alternative URI to retry when the primary image URL fails.
 *
 * Keep retries on the same URI. In particular, never unwrap /api/img/proxy
 * URLs to their raw OS object-storage source: that would bypass the display
 * image width bound after a transient proxy error.
 */
export function getFallbackUri(uri: string): string {
  return uri;
}
