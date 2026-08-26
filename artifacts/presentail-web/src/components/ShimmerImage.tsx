import { useState, type ReactNode } from "react";
import { buildOsImageSrcset, buildCatalogImageSrcset } from "@/lib/imageUtils";

const loadedUrls = new Set<string>();

interface ShimmerImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  fallback?: ReactNode;
  priority?: boolean;
  srcset?: string;
  sizes?: string;
  width?: number;
  height?: number;
}

/**
 * Image with a sweeping shimmer placeholder while loading.
 * Mirrors the mobile ShimmerPlaceholder approach — shimmer is layered
 * beneath the image and removed once the image has fully loaded.
 * Already-visited URLs skip the shimmer entirely (cached in module scope).
 *
 * Pass `priority={true}` for above-the-fold images: sets loading="eager" and
 * fetchpriority="high" so the browser fetches them immediately, and skips the
 * opacity fade so there is no render delay on top of the eager fetch.
 *
 * When `src` is an OS storage URL and no explicit `srcset` prop is provided,
 * srcset/sizes are auto-derived via `/api/img/proxy` so all existing usages
 * benefit from WebP + responsive sizing without any call-site changes.
 *
 * When `src` is a catalog image proxy URL (`/api/catalog/*-image/…`) and no
 * explicit `srcset` prop is provided, srcset/sizes are auto-derived at 144w,
 * 288w, and 480w so catalog cards benefit automatically without call-site changes.
 */
export function ShimmerImage({
  src,
  alt,
  className = "",
  containerClassName = "",
  fallback,
  priority = false,
  srcset,
  sizes,
  width,
  height,
}: ShimmerImageProps) {
  const [loaded, setLoaded] = useState(() => priority || loadedUrls.has(src));
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Auto-apply srcset when the caller did not supply one.
  // Priority: explicit prop > OS storage srcset > catalog proxy srcset.
  const osProps = !srcset ? buildOsImageSrcset(src) : null;
  const catalogProps = !srcset && !osProps ? buildCatalogImageSrcset(src) : null;
  const proxiedSrc = osProps?.src ?? catalogProps?.src ?? src;
  const resolvedSrc = retrying ? src : proxiedSrc;
  const resolvedSrcset = retrying ? undefined : (srcset ?? osProps?.srcset ?? catalogProps?.srcset);
  const resolvedSizes = retrying ? undefined : (sizes ?? osProps?.sizes ?? catalogProps?.sizes);

  if (failed) {
    return fallback ? <>{fallback}</> : (
      <div className={`h-full w-full bg-muted ${containerClassName}`} role="img" aria-label={alt} />
    );
  }

  return (
    <div className={`relative w-full h-full ${containerClassName}`}>
      {!loaded && (
        <div className="absolute inset-0 animate-shimmer rounded-[inherit]" />
      )}
      <img
        src={resolvedSrc}
        alt={alt}
        className={[
          "w-full h-full",
          priority ? "" : "transition-opacity duration-500",
          loaded ? "opacity-100" : "opacity-0",
          className,
        ].join(" ")}
        loading={priority ? "eager" : "lazy"}
        {...(priority ? { fetchPriority: "high" } : {})}
        {...(resolvedSrcset ? { srcSet: resolvedSrcset } : {})}
        {...(resolvedSizes ? { sizes: resolvedSizes } : {})}
        {...(width != null ? { width } : {})}
        {...(height != null ? { height } : {})}
        onLoad={() => {
          loadedUrls.add(src);
          setLoaded(true);
        }}
        onError={() => {
          if (!retrying && proxiedSrc !== src) {
            setRetrying(true);
          } else {
            setFailed(true);
          }
        }}
      />
    </div>
  );
}
