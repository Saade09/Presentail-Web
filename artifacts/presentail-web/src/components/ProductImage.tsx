/**
 * ProductImage — canonical component for OS product images.
 *
 * Renders a <picture> element with:
 * - A WebP <source> carrying a responsive srcset (OS proxy at 400 w / 800 w /
 *   1 200 w, or catalog proxy at 144 w / 288 w / 480 w) for browsers that
 *   support WebP.
 * - A plain <img> fallback so every browser gets an image.
 * - A sweeping shimmer placeholder while loading, matching the mobile
 *   ShimmerPlaceholder pattern.
 *
 * Alt text is auto-generated via buildProductImageAlt so every product call
 * site gets consistent, localised SEO copy without repeating the builder inline.
 *
 * Dimensions: pass `width` and `height` from OS image metadata when available
 * (e.g. product.imageWidth / product.imageHeight); defaults to 400 × 400 so
 * the browser reserves layout space and avoids CLS even without explicit data.
 *
 * Proxy retry: when the proxy URL fails to load, the component silently retries
 * with the original (non-proxied) OS image URL before showing any fallback.
 * The shimmer stays visible during the retry — no flash of grey between attempts.
 */

import { useState, type ReactNode } from "react";
import { buildProductImageAlt, type ProductAltInput } from "@/lib/imageAlt";
import { buildOsImageSrcset, buildCatalogImageSrcset } from "@/lib/imageUtils";

const loadedUrls = new Set<string>();

export interface ProductImageProps {
  src: string;
  product: ProductAltInput;
  locale?: string;
  cityName?: string;
  priority?: boolean;
  className?: string;
  containerClassName?: string;
  /** Width in px — supply from OS image metadata when available; defaults to 400. */
  width?: number;
  /** Height in px — supply from OS image metadata when available; defaults to 400. */
  height?: number;
  sizes?: string;
  fallback?: ReactNode;
  decorative?: boolean;
}

export function ProductImage({
  src,
  product,
  locale = "en",
  cityName = "",
  priority = false,
  className,
  containerClassName,
  width = 400,
  height = 400,
  sizes,
  fallback,
  decorative = false,
}: ProductImageProps) {
  const [loaded, setLoaded] = useState(() => priority || loadedUrls.has(src));
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const alt = buildProductImageAlt(product, locale, cityName, { decorative });

  // Resolve the WebP srcset from the OS proxy or catalog proxy.
  // buildOsImageSrcset produces URLs served by /api/img/proxy with f=webp.
  // buildCatalogImageSrcset produces catalog proxy URLs with ?f=webp.
  // Both are semantically WebP and belong inside <source type="image/webp">.
  const osProps = buildOsImageSrcset(src, sizes);
  const catalogProps = !osProps ? buildCatalogImageSrcset(src, sizes) : null;
  const resolvedSrc = osProps?.src ?? catalogProps?.src ?? src;
  const resolvedSrcset = osProps?.srcset ?? catalogProps?.srcset;
  const resolvedSizes = sizes ?? osProps?.sizes ?? catalogProps?.sizes;

  if (failed) {
    return fallback ? <>{fallback}</> : null;
  }

  // Retry path: proxy URL failed but the raw OS URL may still be reachable.
  // Render a plain <img> pointing directly at `src` (no <picture>/<source>
  // wrapper) while keeping the shimmer visible until the raw URL loads or also
  // fails.
  if (retrying) {
    return (
      <div className={`relative w-full h-full ${containerClassName ?? ""}`}>
        {!loaded && (
          <div className="absolute inset-0 animate-shimmer rounded-[inherit]" />
        )}
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          {...(priority ? { fetchPriority: "high" } : {})}
          className={[
            "w-full h-full",
            priority ? "" : "transition-opacity duration-500",
            loaded ? "opacity-100" : "opacity-0",
            className ?? "",
          ].join(" ")}
          onLoad={() => {
            loadedUrls.add(src);
            setLoaded(true);
          }}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full ${containerClassName ?? ""}`}>
      {!loaded && (
        <div className="absolute inset-0 animate-shimmer rounded-[inherit]" />
      )}
      <picture>
        {resolvedSrcset && (
          <source
            type="image/webp"
            srcSet={resolvedSrcset}
            {...(resolvedSizes ? { sizes: resolvedSizes } : {})}
          />
        )}
        <img
          src={resolvedSrc}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          {...(priority ? { fetchPriority: "high" } : {})}
          className={[
            "w-full h-full",
            priority ? "" : "transition-opacity duration-500",
            loaded ? "opacity-100" : "opacity-0",
            className ?? "",
          ].join(" ")}
          onLoad={() => {
            loadedUrls.add(src);
            setLoaded(true);
          }}
          onError={() => {
            // When the proxy URL differs from the raw src, silently retry with
            // the original URL before giving up and showing the fallback.
            if (resolvedSrc !== src) {
              setRetrying(true);
            } else {
              setFailed(true);
            }
          }}
        />
      </picture>
    </div>
  );
}
