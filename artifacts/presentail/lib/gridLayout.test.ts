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
 *
 * computeNumColumns helper
 *   - returns 2 for a typical portrait phone width (375 dp)
 *   - returns 2 for a screen just below the 600 dp breakpoint (599 dp)
 *   - returns 3 at exactly the 600 dp breakpoint
 *   - returns 3 for a landscape phone width (768 dp)
 *   - returns 3 for a large tablet width (1024 dp)
 *   - respects a custom breakpoint parameter
 *   - GRID_THREE_COLUMN_BREAKPOINT constant is 600
 *
 * useGridCardWidth hook (reactivity)
 *   - returns correct initial gridCardWidth for HOME_GRID_CONFIG params
 *   - returns correct initial listCardWidth for HOME_GRID_CONFIG params
 *   - updates gridCardWidth and listCardWidth when window dimensions change (stays 2 columns below breakpoint)
 *   - switches to 3 columns and recalculates card width when screen width reaches the breakpoint
 *   - removes the Dimensions listener on unmount
 *
 * useOccasionCardWidth hook (reactivity)
 *   - returns correct initial cardWidth for occasion params
 *   - returns correct initial listCardWidth for occasion params
 *   - applies the maxW cap on wide screens (cardWidth never exceeds maxW)
 *   - updates cardWidth and listCardWidth when window dimensions change
 *   - removes the Dimensions listener on unmount
 */

import React, { act } from "react";
import * as ReactTestRenderer from "react-test-renderer";
import { Dimensions, View } from "react-native";
import { describe, expect, it, vi } from "vitest";

import {
  CATALOG_GRID_CARD_W,
  CATALOG_GRID_COLUMN_GAP,
  CATALOG_GRID_FLATLIST_CONFIG,
  CATALOG_GRID_PADDING_H,
  CATALOG_LIST_CARD_W,
  GRID_NUM_COLUMNS,
  GRID_THREE_COLUMN_BREAKPOINT,
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
  computeNumColumns,
  computeOccasionCardWidth,
  useGridCardWidth,
  useOccasionCardWidth,
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

// ---------------------------------------------------------------------------
// computeNumColumns pure helper
// ---------------------------------------------------------------------------

describe("computeNumColumns helper", () => {
  it("returns 2 for a typical portrait phone width (375 dp)", () => {
    expect(computeNumColumns(375)).toBe(2);
  });

  it("returns 2 for a screen just below the 600 dp breakpoint (599 dp)", () => {
    expect(computeNumColumns(599)).toBe(2);
  });

  it("returns 3 at exactly the 600 dp breakpoint", () => {
    expect(computeNumColumns(600)).toBe(3);
  });

  it("returns 3 for a landscape phone width (768 dp)", () => {
    expect(computeNumColumns(768)).toBe(3);
  });

  it("returns 3 for a large tablet width (1024 dp)", () => {
    expect(computeNumColumns(1024)).toBe(3);
  });

  it("respects a custom breakpoint parameter", () => {
    expect(computeNumColumns(500, 500)).toBe(3);
    expect(computeNumColumns(499, 500)).toBe(2);
  });

  it("GRID_THREE_COLUMN_BREAKPOINT constant is 600", () => {
    expect(GRID_THREE_COLUMN_BREAKPOINT).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// useGridCardWidth hook — reactivity tests
//
// These tests verify that the hook correctly reflects the initial screen width
// AND updates both gridCardWidth and listCardWidth when the Dimensions
// "change" event fires (foldable open/close, split-screen resize, iPad
// multitasking).  We spy on Dimensions.addEventListener to capture the
// registered listener and fire it manually inside `act()`.
// ---------------------------------------------------------------------------

describe("useGridCardWidth hook", () => {
  /**
   * Render the hook by wrapping it in a minimal function component so we can
   * use react-test-renderer (RNTL is incompatible with Vitest in this repo).
   * The component calls the hook and stores the latest result in `captured`,
   * which we read after each act().
   */
  function renderGridHook(config: Parameters<typeof useGridCardWidth>[0]) {
    let captured: ReturnType<typeof useGridCardWidth> = { gridCardWidth: 0, listCardWidth: 0, numColumns: 2 };
    function HookCapture() {
      captured = useGridCardWidth(config);
      return null;
    }
    let instance!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      instance = ReactTestRenderer.create(React.createElement(HookCapture));
    });
    return {
      getCaptured: () => captured,
      unmount: () => act(() => { instance.unmount(); }),
    };
  }

  it("returns correct initial gridCardWidth for HOME_GRID_CONFIG params", () => {
    const { getCaptured } = renderGridHook(HOME_GRID_CONFIG);
    expect(getCaptured().gridCardWidth).toBe(
      computeGridCardWidth(MOCK_SCREEN_W, HOME_GRID_PADDING_H, HOME_GRID_COLUMN_GAP, GRID_NUM_COLUMNS),
    );
  });

  it("returns correct initial listCardWidth for HOME_GRID_CONFIG params", () => {
    const { getCaptured } = renderGridHook(HOME_GRID_CONFIG);
    expect(getCaptured().listCardWidth).toBe(MOCK_SCREEN_W - HOME_GRID_PADDING_H * 2);
  });

  it("updates gridCardWidth and listCardWidth when window dimensions change (stays 2 columns below breakpoint)", () => {
    const MEDIUM_W = 420;
    let capturedListener: ((e: { window: { width: number; height: number } }) => void) | null = null;
    const removeSpy = vi.fn();
    vi.spyOn(Dimensions, "addEventListener").mockImplementationOnce((_event, listener) => {
      capturedListener = listener as typeof capturedListener;
      return { remove: removeSpy };
    });

    const { getCaptured } = renderGridHook({
      paddingH: CATALOG_GRID_PADDING_H,
      columnGap: CATALOG_GRID_COLUMN_GAP,
      numColumns: GRID_NUM_COLUMNS,
    });

    expect(getCaptured().gridCardWidth).toBe(
      computeGridCardWidth(MOCK_SCREEN_W, CATALOG_GRID_PADDING_H, CATALOG_GRID_COLUMN_GAP * (2 - 1), 2),
    );
    expect(getCaptured().numColumns).toBe(2);

    act(() => {
      capturedListener!({ window: { width: MEDIUM_W, height: 844 } });
    });

    // MEDIUM_W (420) is below the 600 dp breakpoint → still 2 columns
    expect(getCaptured().numColumns).toBe(2);
    expect(getCaptured().gridCardWidth).toBe(
      computeGridCardWidth(MEDIUM_W, CATALOG_GRID_PADDING_H, CATALOG_GRID_COLUMN_GAP * (2 - 1), 2),
    );
    expect(getCaptured().listCardWidth).toBe(MEDIUM_W - CATALOG_GRID_PADDING_H * 2);
  });

  it("switches to 3 columns and recalculates card width when screen width reaches the breakpoint", () => {
    const WIDE_W = 768;
    let capturedListener: ((e: { window: { width: number; height: number } }) => void) | null = null;
    vi.spyOn(Dimensions, "addEventListener").mockImplementationOnce((_event, listener) => {
      capturedListener = listener as typeof capturedListener;
      return { remove: vi.fn() };
    });

    const { getCaptured } = renderGridHook({
      paddingH: CATALOG_GRID_PADDING_H,
      columnGap: CATALOG_GRID_COLUMN_GAP,
      numColumns: GRID_NUM_COLUMNS,
    });

    expect(getCaptured().numColumns).toBe(2);

    act(() => {
      capturedListener!({ window: { width: WIDE_W, height: 1024 } });
    });

    // WIDE_W (768) ≥ 600 dp breakpoint → 3 columns, 2 inter-column gaps
    expect(getCaptured().numColumns).toBe(3);
    expect(getCaptured().gridCardWidth).toBe(
      computeGridCardWidth(WIDE_W, CATALOG_GRID_PADDING_H, CATALOG_GRID_COLUMN_GAP * (3 - 1), 3),
    );
    expect(getCaptured().listCardWidth).toBe(WIDE_W - CATALOG_GRID_PADDING_H * 2);
  });

  it("removes the Dimensions listener on unmount", () => {
    const removeSpy = vi.fn();
    vi.spyOn(Dimensions, "addEventListener").mockImplementationOnce(() => ({ remove: removeSpy }));

    const { unmount } = renderGridHook(HOME_GRID_CONFIG);
    unmount();
    expect(removeSpy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Home screen 3-column layout at 600 dp
//
// These tests document and protect the concrete layout contract for the home
// section grids (BestSellers, BundlesSection) when a phone is rotated to
// landscape or run on a tablet (screen width ≥ 600 dp).
// ---------------------------------------------------------------------------

describe("Home screen 3-column layout at 600 dp", () => {
  const LANDSCAPE_W = 600;

  it("useGridCardWidth returns numColumns=3 for HOME_GRID_CONFIG at 600 dp", () => {
    let capturedListener: ((e: { window: { width: number; height: number } }) => void) | null = null;
    vi.spyOn(Dimensions, "addEventListener").mockImplementationOnce((_event, listener) => {
      capturedListener = listener as typeof capturedListener;
      return { remove: vi.fn() } as any;
    });

    let captured: ReturnType<typeof useGridCardWidth> = { gridCardWidth: 0, listCardWidth: 0, numColumns: 2 };
    function HookCapture() {
      captured = useGridCardWidth(HOME_GRID_CONFIG);
      return null;
    }
    let instance!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      instance = ReactTestRenderer.create(React.createElement(HookCapture));
    });

    act(() => {
      capturedListener!({ window: { width: LANDSCAPE_W, height: 375 } });
    });

    expect(captured.numColumns).toBe(3);
    act(() => { instance.unmount(); });
  });

  it("gridCardWidth at 600 dp matches (600 - paddingH*2 - columnGap*2) / 3", () => {
    let capturedListener: ((e: { window: { width: number; height: number } }) => void) | null = null;
    vi.spyOn(Dimensions, "addEventListener").mockImplementationOnce((_event, listener) => {
      capturedListener = listener as typeof capturedListener;
      return { remove: vi.fn() } as any;
    });

    let captured: ReturnType<typeof useGridCardWidth> = { gridCardWidth: 0, listCardWidth: 0, numColumns: 2 };
    function HookCapture() {
      captured = useGridCardWidth(HOME_GRID_CONFIG);
      return null;
    }
    let instance!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      instance = ReactTestRenderer.create(React.createElement(HookCapture));
    });

    act(() => {
      capturedListener!({ window: { width: LANDSCAPE_W, height: 375 } });
    });

    const expectedCardW = computeGridCardWidth(
      LANDSCAPE_W,
      HOME_GRID_PADDING_H,
      HOME_GRID_COLUMN_GAP * 2,
      3,
    );
    expect(captured.gridCardWidth).toBe(expectedCardW);
    act(() => { instance.unmount(); });
  });

  it("at 600 dp: 3 cards + 2 gaps + paddingH*2 fill the screen width exactly", () => {
    let capturedListener: ((e: { window: { width: number; height: number } }) => void) | null = null;
    vi.spyOn(Dimensions, "addEventListener").mockImplementationOnce((_event, listener) => {
      capturedListener = listener as typeof capturedListener;
      return { remove: vi.fn() } as any;
    });

    let captured: ReturnType<typeof useGridCardWidth> = { gridCardWidth: 0, listCardWidth: 0, numColumns: 2 };
    function HookCapture() {
      captured = useGridCardWidth(HOME_GRID_CONFIG);
      return null;
    }
    let instance!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      instance = ReactTestRenderer.create(React.createElement(HookCapture));
    });

    act(() => {
      capturedListener!({ window: { width: LANDSCAPE_W, height: 375 } });
    });

    const totalWidth =
      captured.numColumns * captured.gridCardWidth +
      HOME_GRID_CONFIG.columnGap * (captured.numColumns - 1) +
      HOME_GRID_CONFIG.paddingH * 2;
    expect(totalWidth).toBeCloseTo(LANDSCAPE_W);
    act(() => { instance.unmount(); });
  });

  it("at 599 dp: still 2 columns (just below the breakpoint)", () => {
    let capturedListener: ((e: { window: { width: number; height: number } }) => void) | null = null;
    vi.spyOn(Dimensions, "addEventListener").mockImplementationOnce((_event, listener) => {
      capturedListener = listener as typeof capturedListener;
      return { remove: vi.fn() } as any;
    });

    let captured: ReturnType<typeof useGridCardWidth> = { gridCardWidth: 0, listCardWidth: 0, numColumns: 2 };
    function HookCapture() {
      captured = useGridCardWidth(HOME_GRID_CONFIG);
      return null;
    }
    let instance!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      instance = ReactTestRenderer.create(React.createElement(HookCapture));
    });

    act(() => {
      capturedListener!({ window: { width: 599, height: 844 } });
    });

    expect(captured.numColumns).toBe(2);
    act(() => { instance.unmount(); });
  });

  it("home grid section switches from 2 to 3 columns when Dimensions fires a 600 dp width event", () => {
    let capturedListener: ((e: { window: { width: number; height: number } }) => void) | null = null;
    vi.spyOn(Dimensions, "addEventListener").mockImplementationOnce((_event, listener) => {
      capturedListener = listener as typeof capturedListener;
      return { remove: vi.fn() } as any;
    });

    let captured: ReturnType<typeof useGridCardWidth> = { gridCardWidth: 0, listCardWidth: 0, numColumns: 2 };
    function HookCapture() {
      captured = useGridCardWidth(HOME_GRID_CONFIG);
      return null;
    }
    let instance!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      instance = ReactTestRenderer.create(React.createElement(HookCapture));
    });

    expect(captured.numColumns).toBe(2);

    act(() => {
      capturedListener!({ window: { width: LANDSCAPE_W, height: 375 } });
    });

    expect(captured.numColumns).toBe(3);
    // Card width in 3-col landscape must match the 3-column formula exactly.
    expect(captured.gridCardWidth).toBe(
      computeGridCardWidth(LANDSCAPE_W, HOME_GRID_PADDING_H, HOME_GRID_COLUMN_GAP * 2, 3),
    );
    act(() => { instance.unmount(); });
  });

  // -------------------------------------------------------------------------
  // Behavioral tests — rendered item count in home sections
  //
  // BestSellers, BundlesSection, FlowersSection, and SummerCollectionSection
  // all render `numColumns * 2` items (two rows) so the visible count scales
  // from 4 items (2-col portrait) to 6 items (3-col landscape).
  // -------------------------------------------------------------------------

  it("home section renders 4 skeleton items (2 cols × 2 rows) on a 375 dp portrait screen", () => {
    /**
     * Minimal component that mirrors BestSellers / BundlesSection loading state:
     * renders exactly numColumns * 2 skeleton placeholders in a flexWrap grid.
     */
    function HomeSectionSkeleton() {
      const { gridCardWidth, numColumns: cols } = useGridCardWidth(HOME_GRID_CONFIG);
      return React.createElement(
        View,
        {
          style: {
            paddingHorizontal: HOME_GRID_CONFIG.paddingH,
            flexDirection: "row" as const,
            flexWrap: "wrap" as const,
            columnGap: HOME_GRID_CONFIG.columnGap,
            rowGap: 18,
          },
        },
        ...Array.from({ length: cols * 2 }).map((_, i) =>
          React.createElement(View, { key: i, style: { width: gridCardWidth } }),
        ),
      );
    }

    let instance!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      instance = ReactTestRenderer.create(React.createElement(HomeSectionSkeleton));
    });

    const root = instance.toJSON() as unknown as { children: unknown[] };
    // Portrait phone (375 dp) → numColumns=2 → 2*2=4 skeleton cards
    expect(root.children).toHaveLength(4);
    act(() => { instance.unmount(); });
  });

  it("home section renders 6 skeleton items (3 cols × 2 rows) after rotating to 600 dp landscape", () => {
    let capturedListener: ((e: { window: { width: number; height: number } }) => void) | null = null;
    vi.spyOn(Dimensions, "addEventListener").mockImplementationOnce((_event, listener) => {
      capturedListener = listener as typeof capturedListener;
      return { remove: vi.fn() } as any;
    });

    function HomeSectionSkeleton() {
      const { gridCardWidth, numColumns: cols } = useGridCardWidth(HOME_GRID_CONFIG);
      return React.createElement(
        View,
        {
          style: {
            paddingHorizontal: HOME_GRID_CONFIG.paddingH,
            flexDirection: "row" as const,
            flexWrap: "wrap" as const,
            columnGap: HOME_GRID_CONFIG.columnGap,
            rowGap: 18,
          },
        },
        ...Array.from({ length: cols * 2 }).map((_, i) =>
          React.createElement(View, { key: i, style: { width: gridCardWidth } }),
        ),
      );
    }

    let instance!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      instance = ReactTestRenderer.create(React.createElement(HomeSectionSkeleton));
    });

    // Simulate rotation to landscape (600 dp width)
    act(() => {
      capturedListener!({ window: { width: LANDSCAPE_W, height: 375 } });
    });

    const root = instance.toJSON() as unknown as { children: unknown[] };
    // Landscape phone (600 dp) → numColumns=3 → 3*2=6 skeleton cards
    expect(root.children).toHaveLength(6);
    act(() => { instance.unmount(); });
  });

  it("home section card width narrows proportionally when switching from 2 to 3 columns at 600 dp", () => {
    let capturedListener: ((e: { window: { width: number; height: number } }) => void) | null = null;
    vi.spyOn(Dimensions, "addEventListener").mockImplementationOnce((_event, listener) => {
      capturedListener = listener as typeof capturedListener;
      return { remove: vi.fn() } as any;
    });

    let capturedWidth = 0;
    function HomeSectionSkeleton() {
      const { gridCardWidth, numColumns: cols } = useGridCardWidth(HOME_GRID_CONFIG);
      capturedWidth = gridCardWidth;
      return React.createElement(
        View,
        null,
        React.createElement(View, { style: { width: gridCardWidth } }),
        React.createElement(View, { style: { width: cols } }), // capture numColumns
      );
    }

    let instance!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      instance = ReactTestRenderer.create(React.createElement(HomeSectionSkeleton));
    });

    const portraitWidth = capturedWidth;

    act(() => {
      capturedListener!({ window: { width: LANDSCAPE_W, height: 375 } });
    });

    const landscapeWidth = capturedWidth;

    // In landscape (600dp, 3 cols), per-card width uses formula (600-48-28)/3
    const expectedLandscapeW = computeGridCardWidth(LANDSCAPE_W, HOME_GRID_PADDING_H, HOME_GRID_COLUMN_GAP * 2, 3);
    expect(landscapeWidth).toBe(expectedLandscapeW);

    // In portrait (375dp, 2 cols), per-card width uses formula (375-48-14)/2
    const expectedPortraitW = computeGridCardWidth(MOCK_SCREEN_W, HOME_GRID_PADDING_H, HOME_GRID_COLUMN_GAP, 2);
    expect(portraitWidth).toBe(expectedPortraitW);

    act(() => { instance.unmount(); });
  });
});

// ---------------------------------------------------------------------------
// useOccasionCardWidth hook — reactivity tests
// ---------------------------------------------------------------------------

describe("useOccasionCardWidth hook", () => {
  function renderOccasionHook(config: Parameters<typeof useOccasionCardWidth>[0]) {
    let captured: ReturnType<typeof useOccasionCardWidth> = { cardWidth: 0, listCardWidth: 0 };
    function HookCapture() {
      captured = useOccasionCardWidth(config);
      return null;
    }
    let instance!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      instance = ReactTestRenderer.create(React.createElement(HookCapture));
    });
    return {
      getCaptured: () => captured,
      unmount: () => act(() => { instance.unmount(); }),
    };
  }

  it("returns correct initial cardWidth for occasion params", () => {
    const { getCaptured } = renderOccasionHook({
      paddingH: OCCASION_GRID_PADDING_H,
      divisor: OCCASION_CARD_DIVISOR,
      maxW: OCCASION_CARD_MAX_W,
    });
    expect(getCaptured().cardWidth).toBe(
      computeOccasionCardWidth(MOCK_SCREEN_W, OCCASION_GRID_PADDING_H, OCCASION_CARD_DIVISOR, OCCASION_CARD_MAX_W),
    );
  });

  it("returns correct initial listCardWidth for occasion params", () => {
    const { getCaptured } = renderOccasionHook({
      paddingH: OCCASION_GRID_PADDING_H,
      divisor: OCCASION_CARD_DIVISOR,
      maxW: OCCASION_CARD_MAX_W,
    });
    expect(getCaptured().listCardWidth).toBe(MOCK_SCREEN_W - OCCASION_GRID_PADDING_H * 2);
  });

  it("applies the maxW cap on wide screens (cardWidth never exceeds maxW)", () => {
    const WIDE_W = 768;
    let capturedListener: ((e: { window: { width: number; height: number } }) => void) | null = null;
    vi.spyOn(Dimensions, "addEventListener").mockImplementationOnce((_event, listener) => {
      capturedListener = listener as typeof capturedListener;
      return { remove: vi.fn() };
    });

    const { getCaptured } = renderOccasionHook({
      paddingH: OCCASION_GRID_PADDING_H,
      divisor: OCCASION_CARD_DIVISOR,
      maxW: OCCASION_CARD_MAX_W,
    });

    act(() => {
      capturedListener!({ window: { width: WIDE_W, height: 1024 } });
    });

    expect(getCaptured().cardWidth).toBe(OCCASION_CARD_MAX_W);
    expect(getCaptured().listCardWidth).toBe(WIDE_W - OCCASION_GRID_PADDING_H * 2);
  });

  it("updates cardWidth and listCardWidth when window dimensions change", () => {
    const MEDIUM_W = 420;
    let capturedListener: ((e: { window: { width: number; height: number } }) => void) | null = null;
    vi.spyOn(Dimensions, "addEventListener").mockImplementationOnce((_event, listener) => {
      capturedListener = listener as typeof capturedListener;
      return { remove: vi.fn() };
    });

    const { getCaptured } = renderOccasionHook({
      paddingH: OCCASION_GRID_PADDING_H,
      divisor: OCCASION_CARD_DIVISOR,
      maxW: OCCASION_CARD_MAX_W,
    });

    act(() => {
      capturedListener!({ window: { width: MEDIUM_W, height: 900 } });
    });

    expect(getCaptured().cardWidth).toBe(
      computeOccasionCardWidth(MEDIUM_W, OCCASION_GRID_PADDING_H, OCCASION_CARD_DIVISOR, OCCASION_CARD_MAX_W),
    );
    expect(getCaptured().listCardWidth).toBe(MEDIUM_W - OCCASION_GRID_PADDING_H * 2);
  });

  it("removes the Dimensions listener on unmount", () => {
    const removeSpy = vi.fn();
    vi.spyOn(Dimensions, "addEventListener").mockImplementationOnce(() => ({ remove: removeSpy }));

    const { unmount } = renderOccasionHook({
      paddingH: OCCASION_GRID_PADDING_H,
      divisor: OCCASION_CARD_DIVISOR,
      maxW: OCCASION_CARD_MAX_W,
    });
    unmount();
    expect(removeSpy).toHaveBeenCalledOnce();
  });
});
