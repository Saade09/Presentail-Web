import { useEffect } from "react";
import { buildOsImageSrcset } from "@/lib/imageUtils";

const LCP_ATTR = "data-lcp-preload";

/**
 * Injects a `<link rel="preload" as="image" fetchpriority="high">` into
 * `<head>` as soon as the first product's OS image URL is known, so the
 * browser's preload scanner can start fetching the LCP image in parallel
 * with JS execution and the OS API fetch — resolving the PageSpeed
 * "LCP request discovery" warning on listing pages.
 *
 * The link uses the same proxy URL and srcset produced by buildOsImageSrcset,
 * matching exactly what ShimmerImage renders for the first product card.
 *
 * Cleans up by removing the link on unmount or when the URL changes (e.g.
 * navigating from one brand page to another without a full reload). A stable
 * `data-lcp-preload` attribute is used as the cleanup selector so multiple
 * navigations never leave stale links behind.
 *
 * No-op when `imageUrl` is null (data still loading) or when the URL is not
 * an OS storage path (non-proxy images don't benefit from this hint).
 */
export function useLcpImagePreload(imageUrl: string | null): void {
  useEffect(() => {
    if (typeof document === "undefined" || !imageUrl) return;

    const osProps = buildOsImageSrcset(imageUrl);
    if (!osProps) return;

    // Remove any previously injected preload link before adding a new one.
    document.head.querySelectorAll(`link[${LCP_ATTR}]`).forEach((el) => el.remove());

    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.setAttribute("fetchpriority", "high");
    link.setAttribute("imagesrcset", osProps.srcset);
    link.setAttribute("imagesizes", osProps.sizes);
    link.href = osProps.src;
    link.setAttribute(LCP_ATTR, "true");
    document.head.appendChild(link);

    return () => {
      link.remove();
    };
  }, [imageUrl]);
}
