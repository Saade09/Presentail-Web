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

import { useEffect, useState } from "react";
import { Dimensions } from "react-native";

const { width: SCREEN_W } = Dimensions.get("window");

/** Number of columns in the two-column product grid (home + catalog). */
export const GRID_NUM_COLUMNS = 2 as const;

/**
 * Screen-width breakpoint (dp) at which the catalog/category/brand grids
 * switch from 2 columns to 3 columns.  Matches the smallest tablet/landscape
 * width where a third column is comfortable.
 */
export const GRID_THREE_COLUMN_BREAKPOINT = 600;

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
// Occasion screen
// ---------------------------------------------------------------------------

/** Horizontal padding applied on each side of the occasion screen container. */
export const OCCASION_GRID_PADDING_H = 24;

/**
 * Divisor used to compute the occasion card width.
 * The occasion screen uses 2.3 rather than the integer column count used by
 * the catalog grid — the extra 0.3 intentionally reveals the leading edge of
 * a third card to signal horizontal scrollability.
 */
export const OCCASION_CARD_DIVISOR = 2.3;

/** Maximum pixel width of a single ProductCard on the occasion screen. */
export const OCCASION_CARD_MAX_W = 160;

/**
 * Pixel width of each ProductCard on the occasion screen.
 * Formula: min(OCCASION_CARD_MAX_W, (screenWidth - paddingH*2) / OCCASION_CARD_DIVISOR)
 *
 * The cap ensures cards are never taller than a comfortable browse height on
 * extra-wide devices (≥ ~416 px screen width).
 */
export const OCCASION_CARD_W = Math.min(
  OCCASION_CARD_MAX_W,
  (SCREEN_W - OCCASION_GRID_PADDING_H * 2) / OCCASION_CARD_DIVISOR,
);

/**
 * Pixel width of a ProductCard in the full-width (list) mode on the occasion
 * screen.
 * Formula: screenWidth - paddingH*2
 */
export const OCCASION_LIST_CARD_W = SCREEN_W - OCCASION_GRID_PADDING_H * 2;

// ---------------------------------------------------------------------------
// Pure formula helpers (used by tests to compute expected values independently)
// ---------------------------------------------------------------------------

/**
 * Compute the card width for a symmetric multi-column grid given explicit
 * params.  Passing the same args used by the exported constants must always
 * reproduce those constants — if it doesn't, the constants have drifted from
 * their formula.
 *
 * `columnGap` is the total inter-column spacing (i.e. the gap value multiplied
 * by the number of gaps, which is `numColumns - 1`).  For two columns with a
 * 10 dp gap, pass `columnGap = 10`; for three columns with a 10 dp gap per
 * seam, pass `columnGap = 20`.
 */
export function computeGridCardWidth(
  screenWidth: number,
  paddingH: number,
  columnGap: number,
  numColumns: number,
): number {
  return (screenWidth - paddingH * 2 - columnGap) / numColumns;
}

/**
 * Return the number of grid columns appropriate for a given screen width.
 *
 * - Screens narrower than `breakpoint` dp → 2 columns (portrait phone)
 * - Screens ≥ `breakpoint` dp            → 3 columns (landscape phone / tablet)
 *
 * The `breakpoint` parameter defaults to {@link GRID_THREE_COLUMN_BREAKPOINT}.
 */
export function computeNumColumns(
  screenWidth: number,
  breakpoint: number = GRID_THREE_COLUMN_BREAKPOINT,
): 2 | 3 {
  return screenWidth >= breakpoint ? 3 : 2;
}

/**
 * Compute the occasion card width given explicit params.  The formula mirrors
 * OCCASION_CARD_W — passing the same constants must always reproduce that
 * exported value.
 */
export function computeOccasionCardWidth(
  screenWidth: number,
  paddingH: number,
  divisor: number,
  maxW: number,
): number {
  return Math.min(maxW, (screenWidth - paddingH * 2) / divisor);
}

// ---------------------------------------------------------------------------
// Reactive hooks — subscribe to Dimensions changes for foldables / iPads
// ---------------------------------------------------------------------------

/**
 * Config accepted by {@link useGridCardWidth}.
 * Compatible with HOME_GRID_CONFIG and CATALOG_GRID_FLATLIST_CONFIG so either
 * object can be spread/passed directly.
 */
export type GridLayoutConfig = {
  paddingH: number;
  columnGap: number;
  numColumns: number;
};

/**
 * Config accepted by {@link useOccasionCardWidth}.
 */
export type OccasionLayoutConfig = {
  paddingH: number;
  divisor: number;
  maxW: number;
};

/**
 * Hook that returns reactive grid card widths and column count, recalculated
 * whenever the window dimensions change (foldables, iPads, split-screen
 * windows, phone rotation).
 *
 * `numColumns` is derived adaptively from the current screen width using
 * {@link computeNumColumns}: 2 columns on portrait phones (< 600 dp) and
 * 3 columns on landscape phones / tablets (≥ 600 dp).  The `numColumns` field
 * in `config` is retained for typing compatibility but is not used — callers
 * should read the returned `numColumns` and pass it directly to their FlatList.
 *
 * @returns `gridCardWidth` — width for a card in multi-column grid mode.
 * @returns `listCardWidth` — full-bleed card width in single-column list mode.
 * @returns `numColumns`    — adaptive column count (2 or 3) for the FlatList.
 */
export function useGridCardWidth(config: GridLayoutConfig): {
  gridCardWidth: number;
  listCardWidth: number;
  numColumns: 2 | 3;
} {
  const [screenW, setScreenW] = useState(() => Dimensions.get("window").width);

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setScreenW(window.width);
    });
    return () => sub.remove();
  }, []);

  const numColumns = computeNumColumns(screenW);
  const totalColumnGap = config.columnGap * (numColumns - 1);

  return {
    gridCardWidth: computeGridCardWidth(screenW, config.paddingH, totalColumnGap, numColumns),
    listCardWidth: screenW - config.paddingH * 2,
    numColumns,
  };
}

/**
 * Hook that returns reactive occasion card widths, recalculated whenever the
 * window dimensions change (foldables, iPads, split-screen windows).
 *
 * @returns `cardWidth` — peeking-scroll card width (capped at `maxW`).
 * @returns `listCardWidth` — full-bleed card width in single-column list mode.
 */
export function useOccasionCardWidth(config: OccasionLayoutConfig): {
  cardWidth: number;
  listCardWidth: number;
} {
  const [screenW, setScreenW] = useState(() => Dimensions.get("window").width);

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setScreenW(window.width);
    });
    return () => sub.remove();
  }, []);

  return {
    cardWidth: computeOccasionCardWidth(screenW, config.paddingH, config.divisor, config.maxW),
    listCardWidth: screenW - config.paddingH * 2,
  };
}
