import { useState, type ReactNode } from "react";

const loadedUrls = new Set<string>();

interface ShimmerImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  fallback?: ReactNode;
}

/**
 * Image with a sweeping shimmer placeholder while loading.
 * Mirrors the mobile ShimmerPlaceholder approach — shimmer is layered
 * beneath the image and removed once the image has fully loaded.
 * Already-visited URLs skip the shimmer entirely (cached in module scope).
 */
export function ShimmerImage({
  src,
  alt,
  className = "",
  containerClassName = "",
  fallback,
}: ShimmerImageProps) {
  const [loaded, setLoaded] = useState(() => loadedUrls.has(src));
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
          "w-full h-full transition-opacity duration-500",
          loaded ? "opacity-100" : "opacity-0",
          className,
        ].join(" ")}
        loading="lazy"
        onLoad={() => {
          loadedUrls.add(src);
          setLoaded(true);
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
