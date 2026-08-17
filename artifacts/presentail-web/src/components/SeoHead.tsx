import { useEffect } from "react";
import { useLocation } from "wouter";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import {
  isSupportedCity,
  parseLocalePath,
  type Lang,
} from "@/lib/locale-route";
import { NONINDEX_ROUTE_KEYS } from "@/lib/seo";
import { buildHreflangSet, HUB_CITY } from "@/lib/hreflang";

const ROUTE_KEYS: Array<{ test: (rest: string) => boolean; key: string }> = [
  { test: (r) => r === "" || r === "/", key: "home" },
  { test: (r) => r === "/shop", key: "shop" },
  // Entity pages: server injects entity-specific title/image; skip client rewrite.
  { test: (r) => r.startsWith("/product/"), key: "entityPage" },
  { test: (r) => r.startsWith("/brand/"), key: "entityPage" },
  { test: (r) => r.startsWith("/category/"), key: "entityPage" },
  { test: (r) => r.startsWith("/occasion/"), key: "entityPage" },
  { test: (r) => r === "/occasions", key: "allOccasions" },
  { test: (r) => r === "/brands", key: "brands" },
  { test: (r) => r === "/cart", key: "cart" },
  { test: (r) => r === "/checkout", key: "checkout" },
  { test: (r) => r === "/order-confirmed", key: "orderConfirmed" },
  { test: (r) => r === "/auth", key: "auth" },
  { test: (r) => r === "/account", key: "account" },
  { test: (r) => r === "/careers", key: "careers" },
  { test: (r) => r === "/blog", key: "blog" },
  // Blog post detail pages manage their own metadata via useEffect in BlogPost.tsx.
  // Return a sentinel so SeoHead skips the write entirely for those routes.
  { test: (r) => r.startsWith("/blog/"), key: "blogPost" },
  { test: (r) => r === "/partner", key: "partner" },
  { test: (r) => r === "/weddings", key: "weddings" },
  { test: (r) => r === "/corporate", key: "corporate" },
  { test: (r) => r === "/contact", key: "contact" },
  { test: (r) => r === "/faqs", key: "faqs" },
  { test: (r) => r === "/terms", key: "terms" },
  { test: (r) => r === "/privacy", key: "privacy" },
  { test: (r) => r === "/account-deletion", key: "account-deletion" },
];

function detectRouteKey(rest: string): string {
  for (const r of ROUTE_KEYS) if (r.test(rest)) return r.key;
  return "home";
}

const OG_LOCALE: Record<Lang, string> = {
  en: "en_US",
  ar: "ar_AE",
  fr: "fr_FR",
  el: "el_GR",
};

const SEO_ATTR = "data-seo-managed";

function setMeta(
  selector: string,
  attrs: Record<string, string>,
  parent: HTMLElement,
) {
  // Prefer an already-managed element (post-cleanup on re-renders). If none
  // exists, claim an existing server-injected element so we don't append a
  // duplicate alongside the server-rendered tag on the initial page load.
  let el = parent.querySelector<HTMLElement>(`${selector}[${SEO_ATTR}]`);
  if (!el) {
    el = parent.querySelector<HTMLElement>(selector);
  }
  if (!el) {
    el = document.createElement(selector.split("[")[0]);
    parent.appendChild(el);
  }
  el.setAttribute(SEO_ATTR, "true");
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
    const hasValidCity =
      parsed.hasLocalePrefix &&
      parsed.country &&
      parsed.city &&
      isSupportedCity(parsed.country, parsed.city);
    const inLocale = parsed.hasLocalePrefix && parsed.country && (!parsed.city || hasValidCity);
    const routeKey = inLocale ? detectRouteKey(parsed.rest) : "landing";

    // Blog post pages manage their own metadata in BlogPost.tsx — do not overwrite.
    // Entity pages (product/:slug, brand/:slug, category/:slug, occasion/:slug) and
    // wishlist share pages receive entity-specific server-injected metadata. Skipping
    // here prevents the client from clobbering entity names/images with generic copy.
    if (routeKey === "blogPost" || routeKey === "entityPage") return;
    if (path.startsWith("/favorites/share/")) return;

    const cityLabel = city
      ? cityName(city.id, city.name)
      : hasValidCity && parsed.city
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

    // Landing and locale-prefixed home pages use distinct, shorter OG and
    // Twitter copy. Other routes reuse the page title/description.
    // Mirror the server's isUnknownSubRoute guard so soft-404 locale URLs
    // (routeKey falls back to "home" with a non-empty rest) don't pick up the
    // dedicated home copy and drift from the server-rendered metadata.
    const isUnknownSubRoute =
      Boolean(inLocale) &&
      routeKey === "home" &&
      parsed.rest !== "" &&
      parsed.rest !== "/";
    const isLanding = routeKey === "landing";
    const isHome = routeKey === "home" && Boolean(inLocale) && !isUnknownSubRoute;
    // Generic browse routes (Shop, Brands, All Occasions) also get dedicated,
    // shorter share copy. Only applies within a locale prefix.
    // Category (/category/:slug) is intentionally excluded here: it is an
    // `entityPage` and bails out above (server injection supplies sharp,
    // entity-specific metadata). Its generic fallback copy lives server-side in
    // seo-inject.mjs (GENERIC_OG/GENERIC_TWITTER.category) with the matching
    // seo.category.* strings kept in the catalogue for parity.
    const hasGenericShareCopy =
      Boolean(inLocale) &&
      (routeKey === "shop" ||
        routeKey === "brands" ||
        routeKey === "allOccasions");
    let ogTitle = title;
    let ogDescription = description;
    let twitterTitle = title;
    let twitterDescription = description;
    if (isLanding) {
      ogTitle = t("seo.landing.ogTitle");
      ogDescription = t("seo.landing.ogDescription");
      twitterTitle = t("seo.landing.twitterTitle");
      twitterDescription = t("seo.landing.twitterDescription");
    } else if (isHome) {
      ogTitle = t("seo.home.ogTitle", params);
      ogDescription = t("seo.home.ogDescription", params);
      twitterTitle = t("seo.home.twitterTitle", params);
      twitterDescription = t("seo.home.twitterDescription", params);
    } else if (hasGenericShareCopy) {
      ogTitle = t(`seo.${routeKey}.ogTitle`, params);
      ogDescription = t(`seo.${routeKey}.ogDescription`, params);
      twitterTitle = t(`seo.${routeKey}.twitterTitle`, params);
      twitterDescription = t(`seo.${routeKey}.twitterDescription`, params);
    }

    document.title = title;
    if (import.meta.env.DEV && title.length > 65) {
      console.warn(
        `SEO title exceeds 65 chars (${title.length}) [${routeKey}]: "${title}"`,
      );
    }

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
      { property: "og:title", content: ogTitle },
      head,
    );
    setMeta(
      'meta[property="og:description"]',
      { property: "og:description", content: ogDescription },
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
      { name: "twitter:title", content: twitterTitle },
      head,
    );
    setMeta(
      'meta[name="twitter:description"]',
      { name: "twitter:description", content: twitterDescription },
      head,
    );

    // Non-public routes (cart, checkout, account, auth, favorites, order
    // confirmation) must not be indexed; mirror the server-injected directive.
    if (NONINDEX_ROUTE_KEYS.has(routeKey)) {
      setMeta(
        'meta[name="robots"]',
        { name: "robots", content: "noindex, follow" },
        head,
      );
    }

    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const basePrefix = (
      (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/"
    ).replace(/\/$/, "");

    // For the root landing page the server injects canonical using CANONICAL_ORIGIN
    // (which may differ from window.location.origin in production). Skip the
    // client-side rewrite so we don't accidentally revert the canonical to the
    // deployment hostname after hydration. The server-rendered value is correct.
    if (!isLanding) {
      // Mirror the server's isUnknownSubRoute guard: soft-404 locale URLs
      // (routeKey fell back to "home" with a non-empty unrecognised rest)
      // must canonicalize to the locale home, not self-canonicalize the
      // unknown URL. This prevents these pages from producing self-canonicals
      // that conflict with the server-rendered canonical pointing at locale home.
      let canonicalPath: string;
      if (!inLocale) {
        canonicalPath = "/";
      } else if (isUnknownSubRoute) {
        // Strip the unrecognised subroute suffix to get the locale home path.
        const restLen = parsed.rest?.length ?? 0;
        canonicalPath =
          restLen > 0 ? path.slice(0, path.length - restLen) || "/" : path;
      } else {
        canonicalPath = path;
      }
      // Canonical / og:url must never carry a query string — they always point
      // at the clean, indexable URL (mirrors the server-side injector).
      const canonicalHref = origin + basePrefix + canonicalPath;
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
    }

    const defaultOgImage = `${origin}${basePrefix}/opengraph.jpg?v=2`;
    const defaultOgImageAlt = "Presentail — Luxury Flower & Gift Delivery";
    setMeta(
      'meta[property="og:image"]',
      { property: "og:image", content: defaultOgImage },
      head,
    );
    setMeta(
      'meta[property="og:image:secure_url"]',
      { property: "og:image:secure_url", content: defaultOgImage },
      head,
    );
    setMeta(
      'meta[property="og:image:type"]',
      { property: "og:image:type", content: "image/jpeg" },
      head,
    );
    setMeta(
      'meta[property="og:image:width"]',
      { property: "og:image:width", content: "1200" },
      head,
    );
    setMeta(
      'meta[property="og:image:height"]',
      { property: "og:image:height", content: "630" },
      head,
    );
    setMeta(
      'meta[property="og:image:alt"]',
      { property: "og:image:alt", content: defaultOgImageAlt },
      head,
    );
    setMeta(
      'meta[name="twitter:image"]',
      { name: "twitter:image", content: defaultOgImage },
      head,
    );
    setMeta(
      'meta[name="twitter:image:alt"]',
      { name: "twitter:image:alt", content: defaultOgImageAlt },
      head,
    );

    // Emit the intra-city hreflang cluster (matching the server injector):
    // en/ar/fr variants of the SAME city plus x-default pointing at the en
    // variant of that city — no cross-country links. Only for indexable
    // locale routes. Entity pages bail out early above — their hreflang is
    // already server-injected and must not be overwritten here. Noindex
    // routes (cart, checkout, auth, etc.) also skip hreflang.
    if (inLocale && !NONINDEX_ROUTE_KEYS.has(routeKey)) {
      // Mirror the server's isUnknownSubRoute guard so soft-404 alternates
      // point at locale homes rather than the unknown path.
      const entityPathForHreflang = isUnknownSubRoute
        ? ""
        : (parsed.rest || "").replace(/^\//, "").replace(/\/$/, "");

      const hreflangEntries = buildHreflangSet(
        entityPathForHreflang,
        {
          country: parsed.country,
          city:
            parsed.city ||
            (parsed.country ? HUB_CITY[parsed.country as keyof typeof HUB_CITY] : undefined),
        },
        origin + basePrefix,
      );

      for (const { hreflang, href } of hreflangEntries) {
        // Claim an existing server-injected alternate before creating a new one
        // to avoid duplicate <link rel="alternate"> elements in the DOM.
        const existing = head.querySelector<HTMLElement>(
          `link[rel="alternate"][hreflang="${hreflang}"]`,
        );
        const link = existing ?? document.createElement("link");
        if (!existing) head.appendChild(link);
        link.setAttribute(SEO_ATTR, "true");
        link.setAttribute("rel", "alternate");
        link.setAttribute("hreflang", hreflang);
        link.setAttribute("href", href);
      }
    }
  }, [path, language, country, city, t, countryName, cityName]);

  return null;
}
