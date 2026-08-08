import { lazy, Suspense } from "react";

/**
 * Lazy-loaded wrapper around SearchOverlay.
 *
 * Importing this instead of SearchOverlay directly breaks the static import
 * chain to cmdk / ui/command.tsx. The dynamic import() boundary means Rollup
 * never promotes cmdk into the instant vendor chunk — the library (and
 * everything under SearchOverlay) only loads when the user first opens search,
 * not on every page visit.
 *
 * The parent is responsible for gating rendering: only mount this component
 * once the user has triggered search (e.g. `hasOpenedSearch` flag in the
 * parent) so the network request for the chunk isn't issued until needed.
 * After the first open the chunk is cached by the browser, so subsequent
 * opens are instant.
 *
 * Props are identical to SearchOverlay.
 */
const SearchOverlayLazy = lazy(() =>
  import("./SearchOverlay").then((m) => ({ default: m.SearchOverlay })),
);

interface Props {
  open: boolean;
  onClose: () => void;
  brandSlug?: string;
  brandName?: string;
}

export function LazySearchOverlay(props: Props) {
  // Suspense fallback is invisible — the overlay manages its own open/close
  // animation internally, so there's nothing meaningful to show while the
  // chunk loads (~first open only, sub-second on fast connections).
  return (
    <Suspense fallback={null}>
      <SearchOverlayLazy {...props} />
    </Suspense>
  );
}
