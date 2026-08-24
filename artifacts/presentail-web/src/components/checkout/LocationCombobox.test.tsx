// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationCombobox, type LocationOption } from "./LocationCombobox";
import { renderWithProviders } from "@/test-utils";

// cmdk scrolls the highlighted item into view; jsdom has no layout.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const OPTIONS: LocationOption[] = [
  { id: "beirut", name: "Beirut", isActive: true },
  { id: "akkar", name: "Akkar", isActive: true },
  { id: "batroun", name: "Batroun", isActive: false },
  { id: "hasbaya", name: "Hasbaya", isActive: false },
];

const DEFAULT_PROPS = {
  value: "",
  options: OPTIONS,
  placeholder: "Select a governorate",
  searchPlaceholder: "Search governorates",
  emptyText: "No governorates found",
  unavailableLabel: "Currently unavailable",
};

function renderCombobox(overrides: Partial<React.ComponentProps<typeof LocationCombobox>> = {}) {
  const onSelect = vi.fn();
  const utils = renderWithProviders(
    <LocationCombobox {...DEFAULT_PROPS} onSelect={onSelect} {...overrides} />,
  );
  return { onSelect, ...utils };
}

describe("LocationCombobox", () => {
  it("shows the placeholder when nothing is selected and opens on click", async () => {
    const user = userEvent.setup();
    renderCombobox();

    const trigger = screen.getByTestId("select-district");
    expect(trigger.textContent).toContain("Select a governorate");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    // All rows visible, available first, unavailable grouped once at the end.
    expect(screen.getByTestId("option-district-beirut")).toBeTruthy();
    expect(screen.getByTestId("option-district-akkar")).toBeTruthy();
    expect(screen.getByTestId("option-district-batroun")).toBeTruthy();
    expect(screen.getByTestId("option-district-hasbaya")).toBeTruthy();
    expect(screen.getByTestId("group-district-unavailable").textContent).toContain(
      "Currently unavailable",
    );
    expect(screen.getAllByText("Currently unavailable")).toHaveLength(1);
  });

  it("marks unavailable rows disabled with a lock icon and never selects them", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onSelect } = renderCombobox();

    await user.click(screen.getByTestId("select-district"));

    const batroun = screen.getByTestId("option-district-batroun");
    expect(batroun.getAttribute("aria-disabled")).toBe("true");
    expect(within(batroun).getByTestId("icon-district-lock-batroun")).toBeTruthy();
    // No per-row "not available" suffix — the group heading covers it once.
    expect(batroun.textContent).toBe("Batroun");

    await user.click(batroun);
    expect(onSelect).not.toHaveBeenCalled();
    // Menu stays open after clicking a disabled row.
    expect(screen.getByTestId("input-district-search")).toBeTruthy();
  });

  it("hides the unavailable group when every area is available", async () => {
    const user = userEvent.setup();
    renderCombobox({
      options: OPTIONS.map((o) => ({ ...o, isActive: true })),
    });

    await user.click(screen.getByTestId("select-district"));
    expect(screen.queryByTestId("group-district-unavailable")).toBeNull();
  });

  it("filters case-insensitively with trimmed whitespace across both groups", async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByTestId("select-district"));
    const input = screen.getByTestId("input-district-search");

    await user.type(input, "  bAtR  ");
    expect(screen.queryByTestId("option-district-beirut")).toBeNull();
    expect(screen.queryByTestId("option-district-akkar")).toBeNull();
    expect(screen.getByTestId("option-district-batroun")).toBeTruthy();
    // Unavailable-only matches still carry the group heading.
    expect(screen.getByTestId("group-district-unavailable")).toBeTruthy();

    await user.clear(input);
    // Clearing restores the full list.
    expect(screen.getByTestId("option-district-beirut")).toBeTruthy();
    expect(screen.getByTestId("option-district-akkar")).toBeTruthy();
    expect(screen.getByTestId("option-district-hasbaya")).toBeTruthy();
  });

  it("shows a compact empty state when nothing matches", async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByTestId("select-district"));
    await user.type(screen.getByTestId("input-district-search"), "zzz");

    expect(screen.getByTestId("text-district-empty").textContent).toBe(
      "No governorates found",
    );
    expect(screen.queryByTestId("option-district-beirut")).toBeNull();
  });

  it("selects an available row, closes the menu, and shows the check on reopen", async () => {
    const user = userEvent.setup();
    const { onSelect, rerender } = renderCombobox();

    await user.click(screen.getByTestId("select-district"));
    await user.click(screen.getByTestId("option-district-akkar"));

    expect(onSelect).toHaveBeenCalledWith("Akkar");
    // Menu is closed.
    expect(screen.queryByTestId("input-district-search")).toBeNull();

    // Parent commits the selection (controlled component).
    rerender(
      <LocationCombobox {...DEFAULT_PROPS} onSelect={onSelect} value="Akkar" />,
    );
    expect(screen.getByTestId("select-district").textContent).toContain("Akkar");

    await user.click(screen.getByTestId("select-district"));
    const akkar = screen.getByTestId("option-district-akkar");
    expect(within(akkar).getByTestId("icon-district-check")).toBeTruthy();
    // Only the selected row shows the check.
    expect(screen.getAllByTestId("icon-district-check")).toHaveLength(1);
  });

  it("keeps the current selection when closed with Escape", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderCombobox({ value: "Beirut" });

    const trigger = screen.getByTestId("select-district");
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(onSelect).not.toHaveBeenCalled();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("Beirut");
    // Focus returns to the trigger.
    expect(document.activeElement).toBe(trigger);
  });

  it("supports keyboard navigation that skips disabled options", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderCombobox();

    const trigger = screen.getByTestId("select-district");
    trigger.focus();
    await user.keyboard("{Enter}");

    // First enabled option is highlighted by default.
    expect(
      screen.getByTestId("option-district-beirut").getAttribute("data-selected"),
    ).toBe("true");

    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByTestId("option-district-akkar").getAttribute("data-selected"),
    ).toBe("true");

    // Further ArrowDown must not land on the disabled rows.
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByTestId("option-district-batroun").getAttribute("data-selected"),
    ).not.toBe("true");
    expect(
      screen.getByTestId("option-district-hasbaya").getAttribute("data-selected"),
    ).not.toBe("true");

    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("Akkar");
  });

  it("highlights the committed selection when reopened", async () => {
    const user = userEvent.setup();
    renderCombobox({ value: "Akkar" });

    await user.click(screen.getByTestId("select-district"));
    expect(
      screen.getByTestId("option-district-akkar").getAttribute("data-selected"),
    ).toBe("true");
  });

  it("uses localized display names for trigger, rows, and filtering", async () => {
    const user = userEvent.setup();
    const cityName = (id: string, fallback: string) =>
      id === "beirut" ? "بيروت" : fallback;
    renderWithProviders(
      <LocationCombobox
        {...DEFAULT_PROPS}
        value="Beirut"
        onSelect={vi.fn()}
        options={OPTIONS}
      />,
      { locale: { cityName } },
    );

    expect(screen.getByTestId("select-district").textContent).toContain("بيروت");

    await user.click(screen.getByTestId("select-district"));
    await user.type(screen.getByTestId("input-district-search"), "بيرو");
    expect(screen.getByTestId("option-district-beirut").textContent).toContain(
      "بيروت",
    );
    expect(screen.queryByTestId("option-district-akkar")).toBeNull();
  });
});
