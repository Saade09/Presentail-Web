/**
 * Product grid layout constants.
 *
 * These values control the column width passed to every <ProductCard /> on the
 * home and catalog screens.  They live here — rather than inline in each screen
 * file — so the formula can be unit-tested and any change that accidentally
 * breaks card sizing is caught before shipping.
 *
 * If you need to adjust gutters, gaps, or column counts, update the constants
 * below AND update the corresponding assertions in lib/gridLayout.test.ts so
 * the intended layout is re-documented.
 *
 * Screen files MUST consume these exports directly in their JSX rather than
 * duplicating the numeric literals — that is the only way a change to one
 * constant is guaranteed to propagate to both the card-width calculation AND the
 * wrapping container styles.
 */

import { Dimensions } from "react-native";

const { width: SCREEN_W } = Dimensions.get("window");

/** Number of columns in the two-column product grid (home + catalog). */
export const GRID_NUM_COLUMNS = 2 as const;

// ---------------------------------------------------------------------------
// Home screen
// ---------------------------------------------------------------------------

/** Horizontal padding applied on each side of the home screen grid container. */
export const HOME_GRID_PADDING_H = 24;

/** Gap between the two columns in the home screen grid. */
export const HOME_GRID_COLUMN_GAP = 14;

/**
 * Pixel width of each ProductCard on the home screen.
 * Formula: (screenWidth - paddingH * 2 - columnGap) / numColumns
 */
export const HOME_CARD_W =
  (SCREEN_W - HOME_GRID_PADDING_H * 2 - HOME_GRID_COLUMN_GAP) / GRID_NUM_COLUMNS;

/**
 * Flat config object for the home screen two-column grid.
 * Consume this in home section View styles so they share the same source of
 * truth as the HOME_CARD_W calculation — preventing silent drift.
 */
export const HOME_GRID_CONFIG = {
  numColumns: GRID_NUM_COLUMNS,
  paddingH: HOME_GRID_PADDING_H,
  columnGap: HOME_GRID_COLUMN_GAP,
  cardWidth: HOME_CARD_W,
} as const;

// ---------------------------------------------------------------------------
// Catalog screen
// ---------------------------------------------------------------------------

/** Horizontal padding applied on each side of the catalog grid container. */
export const CATALOG_GRID_PADDING_H = 24;

/** Gap between the two columns in the catalog grid view. */
export const CATALOG_GRID_COLUMN_GAP = 10;

/**
 * Pixel width of each ProductCard in catalog two-column grid mode.
 * Formula: (screenWidth - paddingH * 2 - columnGap) / numColumns
 */
export const CATALOG_GRID_CARD_W =
  (SCREEN_W - CATALOG_GRID_PADDING_H * 2 - CATALOG_GRID_COLUMN_GAP) / GRID_NUM_COLUMNS;

/**
 * Pixel width of each ProductCard in catalog single-column list mode.
 * Formula: screenWidth - paddingH * 2
 */
export const CATALOG_LIST_CARD_W = SCREEN_W - CATALOG_GRID_PADDING_H * 2;

/**
 * FlatList-level grid config for the catalog screen.
 * Pass these values directly into the FlatList `numColumns` and
 * `columnWrapperStyle` props so the container padding/gap cannot drift from
 * the CATALOG_GRID_CARD_W calculation.
 */
export const CATALOG_GRID_FLATLIST_CONFIG = {
  numColumns: GRID_NUM_COLUMNS,
  columnWrapperPaddingH: CATALOG_GRID_PADDING_H,
  columnGap: CATALOG_GRID_COLUMN_GAP,
  gridCardWidth: CATALOG_GRID_CARD_W,
  listCardWidth: CATALOG_LIST_CARD_W,
  listPaddingH: CATALOG_GRID_PADDING_H,
} as const;

// ---------------------------------------------------------------------------
// Pure formula helper (used by tests to compute expected values independently)
// ---------------------------------------------------------------------------

/**
 * Compute the card width for a symmetric multi-column grid given explicit
 * params.  Passing the same args used by the exported constants must always
 * reproduce those constants — if it doesn't, the constants have drifted from
 * their formula.
 */
export function computeGridCardWidth(
  screenWidth: number,
  paddingH: number,
  columnGap: number,
  numColumns: number,
): number {
  return (screenWidth - paddingH * 2 - columnGap) / numColumns;
}
