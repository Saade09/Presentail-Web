// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Faqs from "./Faqs";
import { FAQ_COPY } from "@/data/faqsCopy.js";

vi.mock("@/contexts/LocaleContext", () => ({
  useLocale: () => ({
    language: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: () => ({ cityId: "ae-dubai" }),
}));

vi.mock("@/components/PageBreadcrumb", () => ({
  PageBreadcrumb: () => null,
}));

describe("Faqs", () => {
  it("default-expands every localized answer so hydrated FAQ content matches FAQPage", () => {
    render(<Faqs />);

    const items = FAQ_COPY.en.groups.flatMap((group) => group.items);
    expect(screen.getAllByRole("button")).toHaveLength(items.length);
    for (const item of items) {
      expect(
        screen.getByRole("button", { name: item.q }).getAttribute("aria-expanded"),
      ).toBe("true");
      const answer = screen.getByText(item.a);
      expect(answer.closest('[data-state="open"]')).not.toBeNull();
    }
  });
});