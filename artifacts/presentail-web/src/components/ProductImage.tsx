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
 * Proxy failures never fall back to the original OS object-storage URL: doing so
 * would turn a transient proxy failure into an unbounded multi-megabyte download.
 */

import { useState, useLayoutEffect, useEffect, useRef, type ReactNode } from "react";
import { buildProductImageAlt, type ProductAltInput } from "@/lib/imageAlt";
import { buildOsImageSrcset, buildCatalogImageSrcset } from "@/lib/imageUtils";

const loadedUrls = new Set<string>();

/**
 * Failsafe: maximum time an image may stay hidden behind the shimmer.  If
 * neither onLoad nor the complete-check has flipped `loaded` by then, we
 * resolve from the element's actual state — reveal when data is present,
 * fall through to error/fallback when the load definitively failed, or
 * reveal anyway so a slow load fades in as data arrives instead of leaving
 * the card permanently gray.
 */
const LOAD_FAILSAFE_MS = 4000;

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
  const imgRef = useRef<HTMLImageElement>(null);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;

  // Browsers may not fire onLoad for already-cached images — the image is
  // decoded synchronously before React attaches the handler.  Check img.complete
  // after mount AND whenever the rendered src changes (the proxy→raw retry
  // path swaps the element/src, which can also complete before handlers
  // attach).  useLayoutEffect runs before paint, avoiding any flicker.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0 && !loadedRef.current) {
      loadedUrls.add(src);
      setLoaded(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Bounded failsafe: no card may stay on the gray shimmer indefinitely.
  // After LOAD_FAILSAFE_MS, resolve from the element's actual state:
  // - data available → reveal
  // - definitively failed (complete but no data) → error/fallback path
  // - still in flight → reveal anyway so the image fades in when it arrives
  //   instead of staying invisible if the load event is never delivered.
  useEffect(() => {
    if (loaded || failed) return;
    const timer = window.setTimeout(() => {
      if (loadedRef.current) return;
      const img = imgRef.current;
      if (img && img.complete && img.naturalWidth === 0) {
        // Load finished with no data — a genuine failure the error handler
        // missed. Route through the same retry/fallback logic as onError.
        setFailed(true);
        return;
      }
      loadedUrls.add(src);
      setLoaded(true);
    }, LOAD_FAILSAFE_MS);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, loaded, failed]);

  const alt = buildProductImageAlt(product, locale, cityName, { decorative });
  const resolvedFallback = fallback ?? (
    <div
      className="h-full w-full bg-muted"
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": alt })}
    />
  );

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
    return <>{resolvedFallback}</>;
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
          ref={imgRef}
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
            setFailed(true);
          }}
        />
      </picture>
    </div>
  );
}
