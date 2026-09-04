import { describe, expect, it } from "vitest";
import { getCrawlerProductCurrencyOverride } from "./crawler-product-currency.mjs";

describe("getCrawlerProductCurrencyOverride", () => {
  const aePath = "/en-ae/dubai/product/rose";
  const lbPath = "/en-lb/beirut/product/rose";

  for (const token of [
    "Googlebot",
    "Googlebot-Image",
    "Storebot-Google",
    "AdsBot-Google",
    "AdsBot-Google-Mobile",
  ]) {
    it(`allows ${token}`, () => {
      expect(getCrawlerProductCurrencyOverride(`Mozilla/5.0 (${token}/1.0)`, aePath)).toBe("AED");
      expect(getCrawlerProductCurrencyOverride(`${token}/2.1`, lbPath)).toBe("USD");
    });
  }

  for (const ua of [
    "Mozilla/5.0",
    "GPTBot/1.0",
    "ChatGPT-User/1.0",
    "ClaudeBot/1.0",
    "bingbot/2.0",
    "Googlebot-News/2.0",
    "NotGooglebot/1.0",
    "AdsBot-Googlex/1.0",
  ]) {
    it(`rejects unrelated/human UA ${ua}`, () => {
      expect(getCrawlerProductCurrencyOverride(ua, aePath)).toBeUndefined();
      expect(getCrawlerProductCurrencyOverride(ua, lbPath)).toBeUndefined();
    });
  }

  it("does not override unsupported country routes", () => {
    expect(getCrawlerProductCurrencyOverride("Googlebot/2.1", "/en-cy/nicosia/product/rose")).toBeUndefined();
  });

  it("requires a locale product path and rejects token suffix tricks", () => {
    expect(getCrawlerProductCurrencyOverride("Googlebot/2.1", "/en-ae/dubai/shop")).toBeUndefined();
    expect(getCrawlerProductCurrencyOverride("Googlebot/2.1", "/en-ae/dubai/product")).toBeUndefined();
    expect(getCrawlerProductCurrencyOverride("Googlebot_News/2.1", aePath)).toBeUndefined();
    expect(getCrawlerProductCurrencyOverride("Googlebot.evil/2.1", aePath)).toBeUndefined();
  });
});