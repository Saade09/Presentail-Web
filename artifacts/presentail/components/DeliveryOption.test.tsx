/**
 * Unit tests for <DeliveryOption /> — fee label single-line constraint
 *
 * The fee column is capped at maxWidth:110 with numberOfLines={1} and
 * adjustsFontSizeToFit so the OS can shrink the text before it ever
 * wraps.  This test pins those three props so a future layout change
 * (e.g. widening the column, removing adjustsFontSizeToFit, bumping
 * numberOfLines to 2) is caught before shipping.
 *
 * Covered scenarios
 * -----------------
 * DeliveryOption — fee label layout constraints
 *   - fee container View has maxWidth: 110
 *   - fee label Text has numberOfLines={1}
 *   - fee label Text has adjustsFontSizeToFit={true}
 *
 * DeliveryOption — fee label currency formats
 *   - USD  fee string ("$5")      stays within the maxWidth column
 *   - AED  fee string ("AED 20")  stays within the maxWidth column
 *   - KWD  fee string ("KWD 1.500") stays within the maxWidth column
 *   - OMR  fee string ("OMR 2.000") stays within the maxWidth column
 *
 * "Within the maxWidth column" is verified by confirming the Text node
 * carries numberOfLines={1} and adjustsFontSizeToFit — the combination
 * that prevents wrapping in React Native regardless of string length.
 *
 * Mocking strategy
 * ----------------
 * react-native       → minimal host-component stub via vitest alias + setup.ts
 * @expo/vector-icons → null stubs (icons are not under test); overrides the
 *                      setup.ts mock to add MaterialCommunityIcons
 * @/components/AppText → forwards to the "Text" host component so toJSON()
 *                        includes a "Text" node we can query
 * @/hooks/useTypography → minimal stub required by AppText
 */

import React from "react";
import * as RTR from "react-test-renderer";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { DeliveryOption } from "@/components/DeliveryOption";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@expo/vector-icons", () => {
  const iconStub = vi.fn(() => null);
  return {
    Feather: iconStub,
    MaterialCommunityIcons: iconStub,
    AntDesign: iconStub,
    Ionicons: iconStub,
    MaterialIcons: iconStub,
    FontAwesome: iconStub,
  };
});

vi.mock("@/hooks/useTypography", () => ({
  useTypography: () => ({
    body: {
      regular: "Inter_400Regular",
      medium: "Inter_500Medium",
      semibold: "Inter_600SemiBold",
      bold: "Inter_700Bold",
    },
    display: {
      regular: "PlayfairDisplay_400Regular",
      medium: "PlayfairDisplay_500Medium",
      semibold: "PlayfairDisplay_600SemiBold",
      bold: "PlayfairDisplay_700Bold",
    },
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AnyNode = {
  type?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
} | string | null;

function findAllNodes(node: unknown, type: string): AnyNode[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap((c) => findAllNodes(c, type));
  const n = node as AnyNode;
  if (typeof n === "string" || n === null) return [];
  const here = n.type === type ? [n] : [];
  if (n.children) return [...here, ...(n.children as unknown[]).flatMap((c) => findAllNodes(c, type))];
  return here;
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...(style as unknown[]).map(flattenStyle));
  if (typeof style === "object") return style as Record<string, unknown>;
  return {};
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COLORS = {
  primary: "#0a5663",
  border: "#e0d6cc",
  muted: "#f5f0eb",
  mutedForeground: "#9e8977",
  background: "#faf8f5",
  gold: "#b8860b",
  goldSoft: "#d4a843",
  text: "#1a1a1a",
};

/**
 * Render a <DeliveryOption> with the given feeLabel (and optional
 * feeSubLabel) and return the react-test-renderer JSON tree.
 */
function renderOption(feeLabel: string, feeSubLabel?: string) {
  let tree!: RTR.ReactTestRenderer;
  act(() => {
    tree = RTR.create(
      <DeliveryOption
        colors={COLORS}
        active={false}
        onPress={() => {}}
        icon="flash-outline"
        title="Express delivery"
        subtitle="Arrives in 90 min"
        feeLabel={feeLabel}
        feeSubLabel={feeSubLabel}
      />,
    );
  });
  return tree.toJSON();
}

// ---------------------------------------------------------------------------
// Tests — layout constraints
// ---------------------------------------------------------------------------

describe("DeliveryOption — fee label layout constraints", () => {
  it("fee container View has maxWidth: 110", () => {
    const tree = renderOption("$5");
    const views = findAllNodes(tree, "View") as { props: Record<string, unknown> }[];
    const feeContainers = views.filter(
      (v) => flattenStyle(v.props.style).maxWidth === 110,
    );
    expect(feeContainers.length).toBeGreaterThan(0);
  });

  it("fee label Text has numberOfLines={1}", () => {
    const tree = renderOption("$5");
    const texts = findAllNodes(tree, "Text") as { props: Record<string, unknown> }[];
    // At least one Text node must have numberOfLines={1}.
    const hasSingleLine = texts.some((t) => t.props.numberOfLines === 1);
    expect(hasSingleLine).toBe(true);
  });

  it("fee label Text has adjustsFontSizeToFit={true}", () => {
    const tree = renderOption("$5");
    const texts = findAllNodes(tree, "Text") as { props: Record<string, unknown> }[];
    // The same Text node that has numberOfLines={1} must also have adjustsFontSizeToFit.
    const hasAdjust = texts.some(
      (t) => t.props.numberOfLines === 1 && t.props.adjustsFontSizeToFit === true,
    );
    expect(hasAdjust).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — currency formats
// ---------------------------------------------------------------------------

describe("DeliveryOption — fee label currency formats", () => {
  /**
   * For each currency format, verify the fee label Text node has both
   * numberOfLines={1} and adjustsFontSizeToFit={true} — the pairing that
   * prevents wrapping in React Native regardless of content length.
   */
  const cases: Array<{ currency: string; feeLabel: string }> = [
    { currency: "USD",  feeLabel: "$5" },
    { currency: "AED",  feeLabel: "AED 20" },
    { currency: "KWD",  feeLabel: "KWD 1.500" },
    { currency: "OMR",  feeLabel: "OMR 2.000" },
  ];

  for (const { currency, feeLabel } of cases) {
    it(`${currency} fee label ("${feeLabel}") is confined by numberOfLines={1} + adjustsFontSizeToFit`, () => {
      const tree = renderOption(feeLabel);

      // Container must have maxWidth: 110.
      const views = findAllNodes(tree, "View") as { props: Record<string, unknown> }[];
      expect(
        views.some((v) => flattenStyle(v.props.style).maxWidth === 110),
        `maxWidth: 110 must exist in the fee container for ${currency}`,
      ).toBe(true);

      // Fee label Text must carry both single-line guards.
      const texts = findAllNodes(tree, "Text") as { props: Record<string, unknown> }[];
      const feeText = texts.find(
        (t) => t.props.numberOfLines === 1 && t.props.adjustsFontSizeToFit === true,
      );
      expect(
        feeText,
        `Text with numberOfLines={1} and adjustsFontSizeToFit must exist for ${currency}`,
      ).toBeDefined();

      // The fee label string must appear inside that Text node.
      const feeTextNode = feeText as { children?: unknown[] };
      const textContent = (feeTextNode.children ?? []).join("");
      expect(textContent).toContain(feeLabel);
    });
  }
});

// ---------------------------------------------------------------------------
// Tests — sub-label layout constraints
// ---------------------------------------------------------------------------

describe("DeliveryOption — fee sub-label layout constraints", () => {
  it("fee sub-label Text has numberOfLines={1}", () => {
    const tree = renderOption("KWD 1.500", "Free + KWD 0.750 express fee");
    const texts = findAllNodes(tree, "Text") as { props: Record<string, unknown> }[];
    // At least two Text nodes must have numberOfLines={1}: the fee label and the sub-label.
    const singleLineTexts = texts.filter((t) => t.props.numberOfLines === 1);
    expect(singleLineTexts.length).toBeGreaterThanOrEqual(2);
  });

  it("fee sub-label Text has adjustsFontSizeToFit={true}", () => {
    const tree = renderOption("KWD 1.500", "Free + KWD 0.750 express fee");
    const texts = findAllNodes(tree, "Text") as { props: Record<string, unknown> }[];
    // At least two Text nodes must have both guards: fee label + sub-label.
    const guardedTexts = texts.filter(
      (t) => t.props.numberOfLines === 1 && t.props.adjustsFontSizeToFit === true,
    );
    expect(guardedTexts.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Tests — sub-label currency formats (KWD / OMR)
// ---------------------------------------------------------------------------

describe("DeliveryOption — fee sub-label currency formats", () => {
  const subLabelCases: Array<{ label: string; feeLabel: string; feeSubLabel: string }> = [
    {
      label: "KWD free+express",
      feeLabel: "KWD 1.500",
      feeSubLabel: "Free + KWD 0.750 express fee",
    },
    {
      label: "KWD std+express",
      feeLabel: "KWD 1.500",
      feeSubLabel: "KWD 0.750 std + KWD 0.750 express",
    },
    {
      label: "OMR free+express",
      feeLabel: "OMR 2.000",
      feeSubLabel: "Free + OMR 1.000 express fee",
    },
    {
      label: "OMR std+express",
      feeLabel: "OMR 2.000",
      feeSubLabel: "OMR 1.000 std + OMR 1.000 express",
    },
  ];

  for (const { label, feeLabel, feeSubLabel } of subLabelCases) {
    it(`${label} sub-label is confined by numberOfLines={1} + adjustsFontSizeToFit`, () => {
      const tree = renderOption(feeLabel, feeSubLabel);

      // Both the fee label and sub-label Text nodes must carry the single-line guards.
      const texts = findAllNodes(tree, "Text") as { props: Record<string, unknown> }[];
      const guardedTexts = texts.filter(
        (t) => t.props.numberOfLines === 1 && t.props.adjustsFontSizeToFit === true,
      );
      expect(
        guardedTexts.length,
        `Expected at least 2 guarded Text nodes (feeLabel + feeSubLabel) for "${label}"`,
      ).toBeGreaterThanOrEqual(2);

      // The sub-label string must appear in one of the guarded Text nodes.
      const subLabelNode = guardedTexts.find((t) => {
        const content = ((t as { children?: unknown[] }).children ?? []).join("");
        return content.includes(feeSubLabel);
      });
      expect(
        subLabelNode,
        `feeSubLabel text must appear in a guarded Text node for "${label}"`,
      ).toBeDefined();
    });
  }
});
