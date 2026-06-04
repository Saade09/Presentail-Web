import { useState, type ReactNode } from "react";

const loadedUrls = new Set<string>();

interface ShimmerImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  fallback?: ReactNode;
  priority?: boolean;
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
 */
export function ShimmerImage({
  src,
  alt,
  className = "",
  containerClassName = "",
  fallback,
  priority = false,
}: ShimmerImageProps) {
  const [loaded, setLoaded] = useState(() => priority || loadedUrls.has(src));
  const [failed, setFailed] = useState(false);

  if (failed) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <div className={`relative w-full h-full ${containerClassName}`}>
      {!loaded && (
        <div className="absolute inset-0 animate-shimmer rounded-[inherit]" />
      )}
      <img
        src={src}
        alt={alt}
        className={[
          "w-full h-full",
          priority ? "" : "transition-opacity duration-500",
          loaded ? "opacity-100" : "opacity-0",
          className,
        ].join(" ")}
        loading={priority ? "eager" : "lazy"}
        {...(priority ? { fetchPriority: "high" } : {})}
        onLoad={() => {
          loadedUrls.add(src);
          setLoaded(true);
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
