// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test-utils";
import { screen } from "@testing-library/react";

const { mockUseCatalogOccasions, mockUseLocationSelection } = vi.hoisted(() => ({
  mockUseCatalogOccasions: vi.fn(),
  mockUseLocationSelection: vi.fn(),
}));

vi.mock("@/lib/queries", () => ({
  useCatalogOccasions: mockUseCatalogOccasions,
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: mockUseLocationSelection,
}));

vi.mock("wouter", () => ({
  Link: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { ShopByOccasion } from "../ShopByOccasion";

describe("ShopByOccasion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocationSelection.mockReturnValue({ countryCode: "LB", cityId: "beirut" });
  });

  it("uses the shared location- and language-scoped catalog occasions query", () => {
    mockUseCatalogOccasions.mockReturnValue({
      data: {
        occasions: [
          { slug: "birthday", name: "Birthday", image: null, count: 1, featured: true },
          { slug: "wedding", name: "Wedding", image: null, count: 1, featured: false },
        ],
      },
      isPending: false,
    });

    renderWithProviders(<ShopByOccasion />, { locale: { language: "fr" } });

    expect(mockUseCatalogOccasions).toHaveBeenCalledWith("LB", "beirut", "fr");
    expect(screen.getByTestId("link-occasion-birthday")).not.toBeNull();
    expect(screen.queryByTestId("link-occasion-wedding")).toBeNull();
  });
});