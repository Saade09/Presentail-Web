// @vitest-environment jsdom
/**
 * LanguageSwitcher — Greek (el) visibility rules.
 *
 * Greek is offered only on the landing page (no country context) and on
 * Cyprus pages; UAE/Lebanon storefronts keep EN/AR/FR only. The switcher
 * derives the available languages from the current URL via langsForCountry().
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// The switcher reads window.location.pathname (wouter's path is stripped of
// the locale prefix inside the based city router), so tests drive the real
// jsdom URL and keep the wouter mock as a plain subscription source.
function setPath(path: string) {
  window.history.pushState({}, "", path);
}

vi.mock("wouter", () => ({
  useLocation: () => [window.location.pathname, vi.fn()],
}));

vi.mock("@/contexts/LocaleContext", () => ({
  useLocale: () => ({
    language: "en",
    setLanguage: vi.fn(),
    t: (k: string) => k,
    dir: "ltr",
  }),
}));

// Render dropdown structure inline so menu items are always in the DOM.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, ...p }: React.ComponentProps<"button">) => (
    <button {...p}>{children}</button>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, ...p }: React.ComponentProps<"div"> & { onSelect?: () => void }) => (
    <div data-testid={(p as Record<string, unknown>)["data-testid"] as string}>{children}</div>
  ),
}));

import { LanguageSwitcher } from "./LanguageSwitcher";

describe("LanguageSwitcher — Greek visibility", () => {
  beforeEach(() => {
    setPath("/");
  });

  it("shows Greek on the landing page (no country context)", () => {
    setPath("/");
    render(<LanguageSwitcher />);
    expect(screen.getByTestId("button-lang-el")).toBeTruthy();
    expect(screen.getByTestId("button-lang-en")).toBeTruthy();
    expect(screen.getByTestId("button-lang-ar")).toBeTruthy();
    expect(screen.getByTestId("button-lang-fr")).toBeTruthy();
  });

  it("shows Greek on Cyprus city pages", () => {
    setPath("/en-cy/nicosia/shop");
    render(<LanguageSwitcher />);
    expect(screen.getByTestId("button-lang-el")).toBeTruthy();
  });

  it("hides Greek on UAE pages", () => {
    setPath("/en-ae/dubai");
    render(<LanguageSwitcher />);
    expect(screen.queryByTestId("button-lang-el")).toBeNull();
    expect(screen.getByTestId("button-lang-fr")).toBeTruthy();
  });

  it("hides Greek on Lebanon pages", () => {
    setPath("/ar-lb/beirut/shop");
    render(<LanguageSwitcher />);
    expect(screen.queryByTestId("button-lang-el")).toBeNull();
  });
});
