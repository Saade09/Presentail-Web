// @vitest-environment jsdom

import React from "react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test-utils";
import { shopStrings, shopStringsFr } from "@/locales/shop";
import { SameDayDeliveryBanner } from "./SameDayDeliveryBanner";

const COPY = {
  en: "All arrangements available for same-day delivery",
  ar: "جميع الترتيبات متاحة للتوصيل في نفس اليوم",
  fr: "Toutes les compositions sont disponibles pour une livraison le jour même",
} as const;

expect(shopStrings["shop.sameDayDelivery"]).toEqual({ en: COPY.en, ar: COPY.ar });
expect(shopStringsFr["shop.sameDayDelivery"]).toBe(COPY.fr);

describe("SameDayDeliveryBanner", () => {
  it.each([
    ["en", COPY.en],
    ["ar", COPY.ar],
    ["fr", COPY.fr],
  ] as const)("renders the %s localized reassurance", (language, copy) => {
    const { getByTestId } = renderWithProviders(
      <SameDayDeliveryBanner countryCode="LB" />,
      { locale: { language, dir: language === "ar" ? "rtl" : "ltr", t: () => copy } },
    );

    expect(getByTestId("same-day-delivery-copy").textContent).toBe(copy);
    expect(getByTestId("same-day-delivery-banner").textContent).not.toContain("Beirut");
    expect(getByTestId("same-day-delivery-banner").textContent).not.toContain(">");
  });

  it.each(["AE", "LB"] as const)("renders the active %s country flag and truck icon", (countryCode) => {
    const { getByTestId } = renderWithProviders(
      <SameDayDeliveryBanner countryCode={countryCode} />,
    );

    expect(getByTestId("same-day-delivery-banner").getAttribute("data-country-code")).toBe(countryCode);
    expect(getByTestId("same-day-delivery-flag")).toBeTruthy();
    expect(getByTestId("same-day-delivery-icon")).toBeTruthy();
  });
});