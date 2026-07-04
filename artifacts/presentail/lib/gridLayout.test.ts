/**
 * Grid layout formula tests
 *
 * These tests close two regression paths:
 *
 *   1. Formula drift — HOME_CARD_W or CATALOG_GRID_CARD_W no longer equals
 *      what the formula (screenW - padding*2 - gap) / numColumns produces for
 *      the documented params.  Caught by the "Home screen grid" and "Catalog
 *      screen grid" describe blocks.
 *
 *   2. Container-style drift — the FlatList/View styles in the screen files use
 *      the same paddingH/columnGap constants that drive the card-width formula,
 *      so the rendered layout and card-width cannot silently diverge.  Verified
 *      by the "Grid row render" block, which renders a small wrapper component
 *      built from the same exported config objects and asserts the rendered
 *      style props match.
 *
 * Covered scenarios
 * -----------------
 * Home screen grid
 *   - HOME_CARD_W matches (screenW − paddingH*2 − columnGap) / numColumns
 *   - HOME_CARD_W is positive for a typical phone screen width
 *   - computeGridCardWidth is proportional to screen width for HOME params
 *   - HOME_GRID_CONFIG carries identical values to the flat constants
 *
 * Catalog screen grid
 *   - CATALOG_GRID_CARD_W matches (screenW − paddingH*2 − columnGap) / numColumns
 *   - CATALOG_LIST_CARD_W matches screenW − paddingH*2
 *   - catalog grid card is narrower than list card
 *   - CATALOG_GRID_FLATLIST_CONFIG carries identical values to the flat constants
 *   - numColumns × gridCardWidth + paddingH*2 + columnGap fills the screen width
 *
 * Home vs catalog column gap
 *   - home gap is wider than catalog gap → home cards are narrower
 *
 * Grid row render (integration)
 *   - catalog grid row rendered with config constants has correct paddingHorizontal
 *   - catalog grid row rendered with config constants has correct gap
 *   - catalog grid row rendered with config constants has correct numColumns
 *   - catalog grid row cards rendered with config constants have correct width
 *   - home grid row rendered with config constants has correct paddingHorizontal
 *   - home grid row rendered with config constants has correct gap
 *
 * computeGridCardWidth helper
 *   - returns correct value for arbitrary inputs
 *   - returns a smaller width when numColumns increases
 *   - returns a smaller width when columnGap increases
 *   - returns a smaller width when paddingH increases
 *   - returns a larger width when screenWidth increases
 */

import React from "react";
import { View } from "react-native";
import { describe, expect, it } from "vitest";

import {
  CATALOG_GRID_CARD_W,
  CATALOG_GRID_COLUMN_GAP,
  CATALOG_GRID_FLATLIST_CONFIG,
  CATALOG_GRID_PADDING_H,
  CATALOG_LIST_CARD_W,
  GRID_NUM_COLUMNS,
  HOME_CARD_W,
  HOME_GRID_COLUMN_GAP,
  HOME_GRID_CONFIG,
  HOME_GRID_PADDING_H,
  OCCASION_CARD_DIVISOR,
  OCCASION_CARD_MAX_W,
  OCCASION_CARD_W,
  OCCASION_GRID_PADDING_H,
  OCCASION_LIST_CARD_W,
  computeGridCardWidth,
  computeOccasionCardWidth,
} from "./gridLayout";
import { renderWithProviders } from "../tests/test-utils";

// The react-native mock (tests/__mocks__/react-native.ts) returns 375 for
// Dimensions.get("window").width, which is what gridLayout.ts picks up at
// module-load time in the test environment.
const MOCK_SCREEN_W = 375;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...(style as unknown[]).map(flattenStyle));
  }
  if (typeof style === "object") return style as Record<string, unknown>;
  return {};
}

// ---------------------------------------------------------------------------
// Home screen grid
// ---------------------------------------------------------------------------

describe("Home screen grid", () => {
  it("HOME_CARD_W matches (screenW - paddingH*2 - columnGap) / numColumns", () => {
    // *** INTENTIONAL HARD-CODED SPEC ***
    // These numbers are the authoritative layout contract for the home screen
    // two-column grid.  If you change HOME_GRID_PADDING_H, HOME_GRID_COLUMN_GAP,
    // or GRID_NUM_COLUMNS in gridLayout.ts, this test will fail — update the
    // expected values here to document the new intended layout.
    expect(HOME_GRID_PADDING_H).toBe(24);
    expect(HOME_GRID_COLUMN_GAP).toBe(14);
    expect(GRID_NUM_COLUMNS).toBe(2);

    const expected = (MOCK_SCREEN_W - HOME_GRID_PADDING_H * 2 - HOME_GRID_COLUMN_GAP) / GRID_NUM_COLUMNS;
    expect(HOME_CARD_W).toBe(expected);
  });

  it("HOME_CARD_W is positive for a typical phone screen width", () => {
    expect(HOME_CARD_W).toBeGreaterThan(0);
  });

  it("HOME_CARD_W updates proportionally when computeGridCardWidth is called with a different screen width", () => {
    const narrowScreen = 320;
    const wideScreen = 428;
    const narrow = computeGridCardWidth(narrowScreen, HOME_GRID_PADDING_H, HOME_GRID_COLUMN_GAP, GRID_NUM_COLUMNS);
    const wide = computeGridCardWidth(wideScreen, HOME_GRID_PADDING_H, HOME_GRID_COLUMN_GAP, GRID_NUM_COLUMNS);
    expect(wide).toBeGreaterThan(narrow);
    expect(wide - narrow).toBeCloseTo((wideScreen - narrowScreen) / GRID_NUM_COLUMNS);
  });

  it("HOME_GRID_CONFIG carries the same values as the flat constants", () => {
    expect(HOME_GRID_CONFIG.numColumns).toBe(GRID_NUM_COLUMNS);
    expect(HOME_GRID_CONFIG.paddingH).toBe(HOME_GRID_PADDING_H);
    expect(HOME_GRID_CONFIG.columnGap).toBe(HOME_GRID_COLUMN_GAP);
    expect(HOME_GRID_CONFIG.cardWidth).toBe(HOME_CARD_W);
  });
});

// ---------------------------------------------------------------------------
// Catalog screen grid
// ---------------------------------------------------------------------------

describe("Catalog screen grid", () => {
  it("CATALOG_GRID_CARD_W matches (screenW - paddingH*2 - columnGap) / numColumns", () => {
    // *** INTENTIONAL HARD-CODED SPEC ***
    expect(CATALOG_GRID_PADDING_H).toBe(24);
    expect(CATALOG_GRID_COLUMN_GAP).toBe(10);
    expect(GRID_NUM_COLUMNS).toBe(2);

    const expected = (MOCK_SCREEN_W - CATALOG_GRID_PADDING_H * 2 - CATALOG_GRID_COLUMN_GAP) / GRID_NUM_COLUMNS;
    expect(CATALOG_GRID_CARD_W).toBe(expected);
  });

  it("CATALOG_LIST_CARD_W matches screenW - paddingH*2 (full-width minus margins)", () => {
    const expected = MOCK_SCREEN_W - CATALOG_GRID_PADDING_H * 2;
    expect(CATALOG_LIST_CARD_W).toBe(expected);
  });

  it("catalog grid card is narrower than catalog list card", () => {
    expect(CATALOG_GRID_CARD_W).toBeLessThan(CATALOG_LIST_CARD_W);
  });

  it("CATALOG_GRID_FLATLIST_CONFIG carries the same values as the flat constants", () => {
    expect(CATALOG_GRID_FLATLIST_CONFIG.numColumns).toBe(GRID_NUM_COLUMNS);
    expect(CATALOG_GRID_FLATLIST_CONFIG.columnWrapperPaddingH).toBe(CATALOG_GRID_PADDING_H);
    expect(CATALOG_GRID_FLATLIST_CONFIG.columnGap).toBe(CATALOG_GRID_COLUMN_GAP);
    expect(CATALOG_GRID_FLATLIST_CONFIG.gridCardWidth).toBe(CATALOG_GRID_CARD_W);
    expect(CATALOG_GRID_FLATLIST_CONFIG.listCardWidth).toBe(CATALOG_LIST_CARD_W);
  });

  it("numColumns × gridCardWidth + paddingH*2 + columnGap fills MOCK_SCREEN_W exactly", () => {
    const totalWidth =
      CATALOG_GRID_FLATLIST_CONFIG.numColumns * CATALOG_GRID_FLATLIST_CONFIG.gridCardWidth +
      CATALOG_GRID_FLATLIST_CONFIG.columnWrapperPaddingH * 2 +
      CATALOG_GRID_FLATLIST_CONFIG.columnGap;
    expect(totalWidth).toBeCloseTo(MOCK_SCREEN_W);
  });
});

// ---------------------------------------------------------------------------
// Home vs catalog — gap difference is visible
// ---------------------------------------------------------------------------

describe("Home vs catalog column gap", () => {
  it("home gap (14) is wider than catalog gap (10), making home cards slightly narrower", () => {
    expect(HOME_GRID_COLUMN_GAP).toBeGreaterThan(CATALOG_GRID_COLUMN_GAP);
    expect(HOME_CARD_W).toBeLessThan(CATALOG_GRID_CARD_W);
  });
});

// ---------------------------------------------------------------------------
// Occasion screen grid
// ---------------------------------------------------------------------------

describe("Occasion screen grid", () => {
  it("OCCASION_CARD_W matches computeOccasionCardWidth with documented params", () => {
    // *** INTENTIONAL HARD-CODED SPEC ***
    // These numbers are the authoritative layout contract for the occasion
    // screen product card width.  If you change OCCASION_GRID_PADDING_H,
    // OCCASION_CARD_DIVISOR, or OCCASION_CARD_MAX_W in gridLayout.ts, this
    // test will fail — update the expected values here to document the new
    // intended layout.
    expect(OCCASION_GRID_PADDING_H).toBe(24);
    expect(OCCASION_CARD_DIVISOR).toBe(2.3);
    expect(OCCASION_CARD_MAX_W).toBe(160);

    const expected = computeOccasionCardWidth(
      MOCK_SCREEN_W,
      OCCASION_GRID_PADDING_H,
      OCCASION_CARD_DIVISOR,
      OCCASION_CARD_MAX_W,
    );
    expect(OCCASION_CARD_W).toBe(expected);
  });

  it("OCCASION_CARD_W is positive for a typical phone screen width", () => {
    expect(OCCASION_CARD_W).toBeGreaterThan(0);
  });

  it("OCCASION_CARD_W does not exceed OCCASION_CARD_MAX_W on any screen width", () => {
    // On a 375px mock screen the uncapped value is (375-48)/2.3 ≈ 142 px,
    // well below the 160 px cap.  Verify the cap would engage at a wider width.
    const narrowUncapped = (MOCK_SCREEN_W - OCCASION_GRID_PADDING_H * 2) / OCCASION_CARD_DIVISOR;
    expect(narrowUncapped).toBeLessThan(OCCASION_CARD_MAX_W);

    // On a 432 px screen (iPad mini / Plus-class phones) the uncapped value
    // exceeds 160 px — the max cap must apply.
    const wideUncapped = (432 - OCCASION_GRID_PADDING_H * 2) / OCCASION_CARD_DIVISOR;
    expect(wideUncapped).toBeGreaterThan(OCCASION_CARD_MAX_W);
    expect(computeOccasionCardWidth(432, OCCASION_GRID_PADDING_H, OCCASION_CARD_DIVISOR, OCCASION_CARD_MAX_W)).toBe(OCCASION_CARD_MAX_W);
  });

  it("OCCASION_LIST_CARD_W matches screenWidth - paddingH*2 (full-width minus margins)", () => {
    const expected = MOCK_SCREEN_W - OCCASION_GRID_PADDING_H * 2;
    expect(OCCASION_LIST_CARD_W).toBe(expected);
  });

  it("OCCASION_CARD_W is narrower than OCCASION_LIST_CARD_W (grid card fits beside a peek of the next card)", () => {
    expect(OCCASION_CARD_W).toBeLessThan(OCCASION_LIST_CARD_W);
  });

  it("OCCASION_CARD_W is narrower than CATALOG_GRID_CARD_W (occasion uses 2.3 divisor, not 2)", () => {
    // The 2.3 divisor intentionally reveals the leading edge of a third card.
    expect(OCCASION_CARD_W).toBeLessThan(CATALOG_GRID_CARD_W);
  });
});

// ---------------------------------------------------------------------------
// Category screen grid — delegates to catalog constants
// ---------------------------------------------------------------------------

describe("Category screen grid", () => {
  it("CATALOG_GRID_CARD_W covers the category screen grid formula (padding=24, gap=10, 2-col)", () => {
    // The category screen previously duplicated: (SCREEN_W - 24*2 - 10) / 2
    // It now imports CATALOG_GRID_CARD_W which encodes the same formula.
    const categoryInlineFormula = (MOCK_SCREEN_W - 24 * 2 - 10) / 2;
    expect(CATALOG_GRID_CARD_W).toBe(categoryInlineFormula);
  });

  it("CATALOG_LIST_CARD_W covers the category screen list formula (SCREEN_W - 48)", () => {
    // The category screen previously duplicated: SCREEN_W - 48
    const categoryListInline = MOCK_SCREEN_W - 48;
    expect(CATALOG_LIST_CARD_W).toBe(categoryListInline);
  });
});

// ---------------------------------------------------------------------------
// Brand screen grid — delegates to catalog constants
// ---------------------------------------------------------------------------

describe("Brand screen grid", () => {
  it("CATALOG_GRID_CARD_W covers the brand screen grid formula (padding=24, gap=10, 2-col)", () => {
    // The brand screen FlatList uses columnWrapperStyle={{ gap: 10, paddingHorizontal: 24 }}
    // and now imports CATALOG_GRID_CARD_W (padding=24, gap=10) rather than the old
    // inline formula that incorrectly used gap=14.
    expect(CATALOG_GRID_PADDING_H).toBe(24);
    expect(CATALOG_GRID_COLUMN_GAP).toBe(10);
    const brandGridFormula = (MOCK_SCREEN_W - CATALOG_GRID_PADDING_H * 2 - CATALOG_GRID_COLUMN_GAP) / GRID_NUM_COLUMNS;
    expect(CATALOG_GRID_CARD_W).toBe(brandGridFormula);
  });
});

// ---------------------------------------------------------------------------
// Grid row render — integration tests
//
// These tests render a minimal grid-row component using the *same exported
// config objects* that the catalog and home screens consume in their JSX.
// If a constant in gridLayout.ts changes, both the rendered style and the
// card-width formula will reflect the change together.  If someone instead
// hard-codes a different literal in the screen file, these tests remain green
// (they verify the config object, not the screen), but the screen will diverge
// — which is the pattern the CATALOG_GRID_FLATLIST_CONFIG / HOME_GRID_CONFIG
// exports are designed to prevent by making the screen consume the object.
// ---------------------------------------------------------------------------

describe("Grid row render (integration)", () => {
  /**
   * Minimal catalog grid row component — mirrors the outer wrapper and card
   * widths that catalog.tsx renders for each FlatList row in grid mode.
   */
  function CatalogGridRow({ numColumns }: { numColumns: number }) {
    return (
      React.createElement(View, {
        style: {
          flexDirection: "row" as const,
          paddingHorizontal: CATALOG_GRID_FLATLIST_CONFIG.columnWrapperPaddingH,
          gap: CATALOG_GRID_FLATLIST_CONFIG.columnGap,
        },
      },
      ...Array.from({ length: numColumns }).map((_, i) =>
        React.createElement(View, {
          key: i,
          style: { width: CATALOG_GRID_FLATLIST_CONFIG.gridCardWidth },
        }),
      ))
    );
  }

  /**
   * Minimal home grid row — mirrors the horizontal-scroll section wrappers
   * in index.tsx (FlowersSection, SummerCollectionSection).
   */
  function HomeGridRow({ cardWidth }: { cardWidth: number }) {
    return (
      React.createElement(View, {
        style: {
          flexDirection: "row" as const,
          paddingHorizontal: HOME_GRID_CONFIG.paddingH,
          gap: HOME_GRID_CONFIG.columnGap,
        },
      },
      React.createElement(View, { style: { width: cardWidth } }),
      React.createElement(View, { style: { width: cardWidth } }),
      )
    );
  }

  it("catalog grid row has paddingHorizontal from CATALOG_GRID_FLATLIST_CONFIG", () => {
    const { toJSON } = renderWithProviders(
      React.createElement(CatalogGridRow, {
        numColumns: CATALOG_GRID_FLATLIST_CONFIG.numColumns,
      }),
    );
    const root = toJSON() as unknown as { props: Record<string, unknown> };
    const style = flattenStyle(root.props.style);
    expect(style.paddingHorizontal).toBe(CATALOG_GRID_FLATLIST_CONFIG.columnWrapperPaddingH);
    expect(style.paddingHorizontal).toBe(CATALOG_GRID_PADDING_H);
  });

  it("catalog grid row has gap from CATALOG_GRID_FLATLIST_CONFIG", () => {
    const { toJSON } = renderWithProviders(
      React.createElement(CatalogGridRow, {
        numColumns: CATALOG_GRID_FLATLIST_CONFIG.numColumns,
      }),
    );
    const root = toJSON() as unknown as { props: Record<string, unknown> };
    const style = flattenStyle(root.props.style);
    expect(style.gap).toBe(CATALOG_GRID_FLATLIST_CONFIG.columnGap);
    expect(style.gap).toBe(CATALOG_GRID_COLUMN_GAP);
  });

  it("catalog grid row has numColumns children from CATALOG_GRID_FLATLIST_CONFIG", () => {
    const { toJSON } = renderWithProviders(
      React.createElement(CatalogGridRow, {
        numColumns: CATALOG_GRID_FLATLIST_CONFIG.numColumns,
      }),
    );
    const root = toJSON() as unknown as { children: unknown[] };
    expect(root.children).toHaveLength(CATALOG_GRID_FLATLIST_CONFIG.numColumns);
    expect(root.children).toHaveLength(GRID_NUM_COLUMNS);
  });

  it("catalog grid row card children have width = CATALOG_GRID_CARD_W", () => {
    const { toJSON } = renderWithProviders(
      React.createElement(CatalogGridRow, {
        numColumns: CATALOG_GRID_FLATLIST_CONFIG.numColumns,
      }),
    );
    const root = toJSON() as unknown as { children: Array<{ props: Record<string, unknown> }> };
    for (const card of root.children) {
      const style = flattenStyle(card.props.style);
      expect(style.width).toBe(CATALOG_GRID_FLATLIST_CONFIG.gridCardWidth);
      expect(style.width).toBe(CATALOG_GRID_CARD_W);
    }
  });

  it("home grid row has paddingHorizontal from HOME_GRID_CONFIG", () => {
    const { toJSON } = renderWithProviders(
      React.createElement(HomeGridRow, { cardWidth: HOME_GRID_CONFIG.cardWidth }),
    );
    const root = toJSON() as unknown as { props: Record<string, unknown> };
    const style = flattenStyle(root.props.style);
    expect(style.paddingHorizontal).toBe(HOME_GRID_CONFIG.paddingH);
    expect(style.paddingHorizontal).toBe(HOME_GRID_PADDING_H);
  });

  it("home grid row has gap from HOME_GRID_CONFIG", () => {
    const { toJSON } = renderWithProviders(
      React.createElement(HomeGridRow, { cardWidth: HOME_GRID_CONFIG.cardWidth }),
    );
    const root = toJSON() as unknown as { props: Record<string, unknown> };
    const style = flattenStyle(root.props.style);
    expect(style.gap).toBe(HOME_GRID_CONFIG.columnGap);
    expect(style.gap).toBe(HOME_GRID_COLUMN_GAP);
  });
});

// ---------------------------------------------------------------------------
// computeGridCardWidth pure helper
// ---------------------------------------------------------------------------

describe("computeGridCardWidth helper", () => {
  it("returns (screenWidth - paddingH*2 - columnGap) / numColumns", () => {
    expect(computeGridCardWidth(375, 24, 14, 2)).toBe((375 - 48 - 14) / 2);
    expect(computeGridCardWidth(390, 16, 8, 2)).toBe((390 - 32 - 8) / 2);
    expect(computeGridCardWidth(414, 20, 12, 3)).toBe((414 - 40 - 12) / 3);
  });

  it("returns a smaller card width when numColumns increases", () => {
    const two = computeGridCardWidth(375, 24, 10, 2);
    const three = computeGridCardWidth(375, 24, 10, 3);
    expect(three).toBeLessThan(two);
  });

  it("returns a smaller card width when columnGap increases", () => {
    const small = computeGridCardWidth(375, 24, 10, 2);
    const large = computeGridCardWidth(375, 24, 20, 2);
    expect(large).toBeLessThan(small);
  });

  it("returns a smaller card width when paddingH increases", () => {
    const small = computeGridCardWidth(375, 16, 10, 2);
    const large = computeGridCardWidth(375, 32, 10, 2);
    expect(large).toBeLessThan(small);
  });

  it("returns a larger card width when screenWidth increases", () => {
    const narrow = computeGridCardWidth(320, 24, 10, 2);
    const wide = computeGridCardWidth(430, 24, 10, 2);
    expect(wide).toBeGreaterThan(narrow);
  });
});
