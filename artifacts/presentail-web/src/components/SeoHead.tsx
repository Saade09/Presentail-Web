import { useEffect } from "react";
import { useLocation } from "wouter";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import {
  buildLanguageAlternates,
  hreflangCode,
  parseLocalePath,
  type Lang,
} from "@/lib/locale-route";

const ROUTE_KEYS: Array<{ test: (rest: string) => boolean; key: string }> = [
  { test: (r) => r === "" || r === "/", key: "home" },
  { test: (r) => r === "/shop", key: "shop" },
  { test: (r) => r.startsWith("/product"), key: "product" },
  { test: (r) => r === "/brands", key: "brands" },
  { test: (r) => r.startsWith("/brand/"), key: "brand" },
  { test: (r) => r === "/cart", key: "cart" },
  { test: (r) => r === "/checkout", key: "checkout" },
  { test: (r) => r === "/order-confirmed", key: "orderConfirmed" },
  { test: (r) => r === "/auth", key: "auth" },
  { test: (r) => r === "/account", key: "account" },
];

function detectRouteKey(rest: string): string {
  for (const r of ROUTE_KEYS) if (r.test(rest)) return r.key;
  return "home";
}

const OG_LOCALE: Record<Lang, string> = {
  en: "en_US",
  ar: "ar_AE",
  fr: "fr_FR",
};

const SEO_ATTR = "data-seo-managed";

function setMeta(
  selector: string,
  attrs: Record<string, string>,
  parent: HTMLElement,
) {
  let el = parent.querySelector<HTMLElement>(`${selector}[${SEO_ATTR}]`);
  if (!el) {
    el = document.createElement(selector.split("[")[0]);
    el.setAttribute(SEO_ATTR, "true");
    parent.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

export function SeoHead() {
  const [path] = useLocation();
  const { language, t, countryName, cityName } = useLocale();
  const { country, city } = useLocationSelection();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const head = document.head;

    const parsed = parseLocalePath(path);
    const inLocale = parsed.hasLocalePrefix && parsed.country;
    const routeKey = inLocale ? detectRouteKey(parsed.rest) : "landing";

    const cityLabel = city
      ? cityName(city.id, city.name)
      : parsed.city
        ? parsed.city
            .split("-")
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join(" ")
        : "";
    const countryLabel = country
      ? countryName(country.code, country.name)
      : "";

    const params = { city: cityLabel, country: countryLabel };
    const title = t(`seo.${routeKey}.title`, params);
    const description = t(`seo.${routeKey}.description`, params);
    const siteName = t("seo.siteName");

    document.title = title;

    // Clean up previously managed tags before re-adding.
    head
      .querySelectorAll(`[${SEO_ATTR}]`)
      .forEach((el) => el.parentElement?.removeChild(el));

    setMeta(
      'meta[name="description"]',
      { name: "description", content: description },
      head,
    );
    setMeta(
      'meta[property="og:title"]',
      { property: "og:title", content: title },
      head,
    );
    setMeta(
      'meta[property="og:description"]',
      { property: "og:description", content: description },
      head,
    );
    setMeta(
      'meta[property="og:type"]',
      { property: "og:type", content: "website" },
      head,
    );
    setMeta(
      'meta[property="og:site_name"]',
      { property: "og:site_name", content: siteName },
      head,
    );
    setMeta(
      'meta[property="og:locale"]',
      { property: "og:locale", content: OG_LOCALE[language] },
      head,
    );
    setMeta(
      'meta[name="twitter:card"]',
      { name: "twitter:card", content: "summary_large_image" },
      head,
    );
    setMeta(
      'meta[name="twitter:title"]',
      { name: "twitter:title", content: title },
      head,
    );
    setMeta(
      'meta[name="twitter:description"]',
      { name: "twitter:description", content: description },
      head,
    );

    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const basePrefix = (
      (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/"
    ).replace(/\/$/, "");
    const search = typeof window !== "undefined" ? window.location.search : "";

    const canonicalPath = inLocale ? path : "/";
    const canonicalHref = origin + basePrefix + canonicalPath + search;
    setMeta(
      'link[rel="canonical"]',
      { rel: "canonical", href: canonicalHref },
      head,
    );
    setMeta(
      'meta[property="og:url"]',
      { property: "og:url", content: canonicalHref },
      head,
    );

    const alternates = buildLanguageAlternates(path);
    if (alternates.length && parsed.country) {
      for (const alt of alternates) {
        const href = origin + basePrefix + alt.path + search;
        const link = document.createElement("link");
        link.setAttribute(SEO_ATTR, "true");
        link.setAttribute("rel", "alternate");
        link.setAttribute("hreflang", hreflangCode(alt.lang, parsed.country));
        link.setAttribute("href", href);
        head.appendChild(link);
      }
      // x-default points at the English variant.
      const en = alternates.find((a) => a.lang === "en") ?? alternates[0];
      const xDefault = document.createElement("link");
      xDefault.setAttribute(SEO_ATTR, "true");
      xDefault.setAttribute("rel", "alternate");
      xDefault.setAttribute("hreflang", "x-default");
      xDefault.setAttribute("href", origin + basePrefix + en.path + search);
      head.appendChild(xDefault);
    }
  }, [path, language, country, city, t, countryName, cityName]);

  return null;
}
