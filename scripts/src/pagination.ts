/**
 * Pagination utilities for Presentail collection pages.
 *
 * Canonical page URL conventions:
 *  - Page 1: bare collection URL (no /page/N suffix).
 *  - Page N≥2: collection URL + /page/N.
 *
 * These helpers are pure and synchronous so they can be unit-tested
 * in @workspace/scripts without any server or network dependencies.
 */

export const PAGINATION_PAGE_SIZE = 24;

export interface PaginationLinks {
  prev?: string;
  next?: string;
  outOfRange?: true;
}

/**
 * Compute the prev/next URLs for a paginated collection page.
 *
 * @param baseUrl       Bare collection URL without any /page/N suffix.
 * @param page          1-indexed current page number.
 * @param totalProducts Total product count for the collection.
 * @param pageSize      Products per page (pass PAGINATION_PAGE_SIZE).
 *
 * Returns:
 *  - `{ outOfRange: true }` when page exceeds the total page count.
 *  - `{ prev?, next? }` otherwise. Page 1 has no prev; last page has no next.
 *    When prev would be page 1, it uses the bare collection URL (not /page/1).
 */
export function buildPaginationLinks(
  baseUrl: string,
  page: number,
  totalProducts: number,
  pageSize: number,
): PaginationLinks {
  if (page < 1 || pageSize < 1 || totalProducts < 0) return { outOfRange: true };
  const maxPage = Math.ceil(totalProducts / pageSize);
  if (maxPage <= 0 || page > maxPage) return { outOfRange: true };

  const result: PaginationLinks = {};
  if (page > 1) {
    result.prev = page === 2 ? baseUrl : `${baseUrl}/page/${page - 1}`;
  }
  if (page < maxPage) {
    result.next = `${baseUrl}/page/${page + 1}`;
  }
  return result;
}
