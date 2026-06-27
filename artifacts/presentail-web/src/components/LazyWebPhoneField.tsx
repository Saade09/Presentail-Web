import { lazy, Suspense } from "react";
import type { Props } from "./WebPhoneField";

/**
 * Lazy-loaded wrapper around WebPhoneField.
 *
 * Importing this component instead of WebPhoneField directly breaks the static
 * import chain to react-phone-number-input / libphonenumber-js / country-flag-icons
 * (~42 kB brotli). The dynamic import() inside React.lazy() means Rollup treats
 * the phone library as a code-split boundary and never promotes it into the
 * instant vendor chunk. The library loads on first render of a page that
 * contains a phone field — not before any page is visited.
 *
 * Props are identical to WebPhoneField. Use `onValidityChange` instead of
 * importing `isValidPhoneNumber` in the parent so the phone library stays
 * inside this module's dynamic boundary.
 */
const WebPhoneFieldLazy = lazy(() =>
  import("./WebPhoneField").then((m) => ({ default: m.WebPhoneField })),
);

export function LazyWebPhoneField(props: Props) {
  return (
    <Suspense
      fallback={
        <div>
          <div className="text-sm font-medium block mb-1.5 invisible" aria-hidden>
            {props.label}
          </div>
          <div className="h-12 rounded-sm bg-muted/60 animate-pulse" aria-hidden />
        </div>
      }
    >
      <WebPhoneFieldLazy {...props} />
    </Suspense>
  );
}
