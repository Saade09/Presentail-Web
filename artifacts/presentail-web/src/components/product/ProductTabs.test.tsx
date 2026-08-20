// @vitest-environment jsdom
//
// Guards the ProductTabs description-tab rendering contract:
//
// Mode 1 — description has authored bullet characters (it IS the full item list):
//   • DescriptionBlock keeps pre-bullet context as prose, then renders all items
//     as a bullet list (including content
//     in long OS-authored lists, e.g. AirPods descriptions)
//   • BOUQUET INCLUDES section is hidden to avoid duplication
//
// Mode 2 — description is plain text (a short intro paragraph):
//   • Description renders as a <p> above a separator rule
//   • BOUQUET INCLUDES section shows the parsed item list below
//
// Mode 3 — description is empty:
//   • Only BOUQUET INCLUDES section is shown

import React from "react";
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";
import { ProductTabs } from "./ProductTabs";
import { buildProductViewModel } from "./productViewModel";

const BASE = {
  description: "",
  bouquetIncludes: [],
  careGroup: "flowers",
  careIconName: "flower-tulip",
};

// ---------------------------------------------------------------------------
// Mode 2: plain intro paragraph + BOUQUET INCLUDES
// ---------------------------------------------------------------------------
describe("ProductTabs — plain intro + includes", () => {
  it("omits a standalone OS includes label while keeping the styled section and every item", () => {
    const vm = buildProductViewModel({
      id: "seasonal-bouquet",
      wcId: 1,
      name: "Seasonal Bouquet",
      price: "$50",
      priceValue: 50,
      image: null,
      category: "flowers",
      categories: [],
      inStock: true,
      occasions: [],
      description: "  BOUQUET   INCLUDES!!! \n• 50 Red Roses • Signature wrapping",
    });

    renderWithProviders(<ProductTabs {...BASE} {...vm} />);

    expect(document.querySelector("p.text-muted-foreground")).toBeNull();
    expect(screen.getByText("product.bouquetIncludes")).toBeTruthy();
    expect(screen.getByText("50 Red Roses")).toBeTruthy();
    expect(screen.getByText("Signature wrapping")).toBeTruthy();
  });

  it("keeps meaningful introductory copy before an includes list", () => {
    const vm = buildProductViewModel({
      id: "romantic-bouquet",
      wcId: 2,
      name: "Romantic Bouquet",
      price: "$60",
      priceValue: 60,
      image: null,
      category: "flowers",
      categories: [],
      inStock: true,
      occasions: [],
      description:
        "A classic romantic arrangement for a special moment.\nBouquet includes:\n• 50 Red Roses • 50 White Roses",
    });

    renderWithProviders(<ProductTabs {...BASE} {...vm} />);

    const preamble = document.querySelector("p.text-muted-foreground");
    expect(preamble?.textContent).toBe(
      "A classic romantic arrangement for a special moment.\nBouquet includes:",
    );
    expect(screen.getByText("50 Red Roses")).toBeTruthy();
    expect(screen.getByText("50 White Roses")).toBeTruthy();
  });

  it("shows the intro paragraph when there are no includes", () => {
    renderWithProviders(
      <ProductTabs {...BASE} description="A lovely bouquet." />,
    );
    expect(screen.getByText("A lovely bouquet.")).toBeTruthy();
  });

  it("shows both intro paragraph and BOUQUET INCLUDES when both are present", () => {
    renderWithProviders(
      <ProductTabs
        {...BASE}
        description="The perfect gift for any occasion."
        bouquetIncludes={["Fresh roses", "Signature wrapping", "Note card"]}
      />,
    );
    expect(screen.getByText("The perfect gift for any occasion.")).toBeTruthy();
    expect(screen.getByText("product.bouquetIncludes")).toBeTruthy();
    expect(screen.getByText("Fresh roses")).toBeTruthy();
    expect(screen.getByText("Signature wrapping")).toBeTruthy();
  });

  it("shows description with DEFAULT_INCLUDES-style fallback includes", () => {
    renderWithProviders(
      <ProductTabs
        {...BASE}
        description="Emerald Royale Gift Set — a curated selection."
        bouquetIncludes={[
          "Hand-arranged seasonal stems",
          "Signature Presentail wrapping",
          "Personal note card",
          "Curated by our Beirut atelier",
        ]}
      />,
    );
    expect(
      screen.getByText("Emerald Royale Gift Set — a curated selection."),
    ).toBeTruthy();
    expect(screen.getByText("Hand-arranged seasonal stems")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Mode 3: no description — only BOUQUET INCLUDES
// ---------------------------------------------------------------------------
describe("ProductTabs — empty description", () => {
  it("shows BOUQUET INCLUDES when description is empty", () => {
    renderWithProviders(
      <ProductTabs
        {...BASE}
        description=""
        bouquetIncludes={["Hand-arranged seasonal stems", "Personal note card"]}
      />,
    );
    // No muted-foreground intro paragraph (description is empty)
    expect(document.querySelector("p.text-muted-foreground")).toBeNull();
    expect(screen.getByText("Hand-arranged seasonal stems")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Mode 1: description IS a bullet list — show it fully, hide BOUQUET INCLUDES
// ---------------------------------------------------------------------------
describe("ProductTabs — bulleted description (full list mode)", () => {
  it("keeps an inline OS label out of the bullet list", () => {
    const raw = "Bouquet includes: • 50 Red Roses • 50 White Roses";
    renderWithProviders(
      <ProductTabs
        {...BASE}
        description={raw}
        bouquetIncludes={["50 Red Roses", "50 White Roses"]}
      />,
    );

    expect(screen.getByText("Bouquet includes:").closest("p")).toBeTruthy();
    expect(screen.getByText("50 Red Roses").closest("li")).toBeTruthy();
    expect(screen.getByText("50 White Roses").closest("li")).toBeTruthy();
    expect(screen.queryByText("product.bouquetIncludes")).toBeNull();
  });

  it("keeps multiline OS preamble text above its authored bullets", () => {
    const raw =
      "A classic romantic arrangement for a special moment.\nBouquet includes:\n• 50 Red Roses\n• 50 White Roses";
    renderWithProviders(
      <ProductTabs
        {...BASE}
        description={raw}
        bouquetIncludes={["50 Red Roses", "50 White Roses"]}
      />,
    );

    const preamble = document.querySelector("p.text-muted-foreground");
    expect(preamble?.textContent).toBe(
      "A classic romantic arrangement for a special moment.\nBouquet includes:",
    );
    expect(screen.getByText("50 Red Roses").closest("li")).toBeTruthy();
    expect(screen.getByText("50 White Roses").closest("li")).toBeTruthy();
  });

  it("keeps a plain multiline description as prose", () => {
    const description = "A thoughtful gift for any occasion.\nMade fresh to order.";
    renderWithProviders(<ProductTabs {...BASE} description={description} />);

    const paragraph = document.querySelector("p.text-muted-foreground");
    expect(paragraph?.textContent).toBe(description);
    expect(document.querySelectorAll("ul li")).toHaveLength(0);
  });

  it("renders ALL bullet segments including content beyond the 8-item cap", () => {
    // This covers long OS-authored lists with product details after the stems.
    const raw =
      "Bundle includes: • 5 Stems White Dahlia • 5 Stems White Eustoma" +
      " • 1 White Rose • 1 Stem Green Amaranthus • 1 Stem White Anthurium" +
      " • 10 Stems Green Bear Grass • 2 Stems White Matthiola • 3 Stems Solidago" +
      " • 2 Stems Asparagus • Apple AirPods 4 with Active Noise Cancellation";

    renderWithProviders(
      <ProductTabs
        {...BASE}
        description={raw}
        bouquetIncludes={[
          "5 Stems White Dahlia",
          "5 Stems White Eustoma",
          "1 White Rose",
          "1 Stem Green Amaranthus",
          "1 Stem White Anthurium",
          "10 Stems Green Bear Grass",
          "2 Stems White Matthiola",
          "3 Stems Solidago",
        ]}
      />,
    );

    // Every segment — including AirPods and items 9+ — must be visible
    expect(screen.getByText("5 Stems White Dahlia")).toBeTruthy();
    expect(screen.getByText("2 Stems Asparagus")).toBeTruthy();
    expect(
      screen.getByText("Apple AirPods 4 with Active Noise Cancellation"),
    ).toBeTruthy();

    // BOUQUET INCLUDES section must NOT appear (description already has the list)
    expect(screen.queryByText("product.bouquetIncludes")).toBeNull();
  });

  it("does NOT show BOUQUET INCLUDES when description has bullet chars", () => {
    const raw =
      "Flower box includes: • 2 Gold Anthurium • 2 White Gerbera • 5 Green Carnations";
    renderWithProviders(
      <ProductTabs
        {...BASE}
        description={raw}
        bouquetIncludes={["2 Gold Anthurium", "2 White Gerbera", "5 Green Carnations"]}
      />,
    );
    expect(screen.queryByText("product.bouquetIncludes")).toBeNull();
    // All three items still visible (from DescriptionBlock)
    expect(screen.getByText("2 Gold Anthurium")).toBeTruthy();
    expect(screen.getByText("2 White Gerbera")).toBeTruthy();
  });

  it("renders a bulleted description as a list when bouquetIncludes is empty", () => {
    const raw =
      "Bundle includes: • 5 Stems White Dahlia • 3 Stems Solidago • Blue Round Box";
    renderWithProviders(
      <ProductTabs {...BASE} description={raw} bouquetIncludes={[]} />,
    );
    expect(screen.getByText("Bundle includes:")).toBeTruthy();
    expect(screen.getByText("5 Stems White Dahlia")).toBeTruthy();
    expect(screen.getByText("Blue Round Box")).toBeTruthy();
    expect(screen.queryByText(raw)).toBeNull(); // not shown as a wall of text
  });
});
