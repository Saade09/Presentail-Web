// Layout-level lazy loaders (HomepageHeader, Footer).
//
// These are intentionally kept in a separate file from pageLoaders.ts to break
// the HMR circular-import cycle that would otherwise exist:
//
//   MainNavbar.tsx → pageLoaders.ts → (dynamic) HomepageHeader.tsx → MainNavbar.tsx
//
// MainNavbar imports pageLoaders.ts for prefetch triggers (cart, checkout, …).
// HomepageHeader imports MainNavbar statically.
// If loadHomepageHeader lived in pageLoaders.ts, Vite would detect a cycle
// through the dynamic import factory reference and refuse to apply HMR to
// MainNavbar ("failed to apply HMR as it's within a circular import").
//
// App.tsx imports from both layoutLoaders.ts and pageLoaders.ts freely because
// it does NOT import HomepageHeader or MainNavbar statically.
export const loadHomepageHeader = () =>
  import("@/components/homepage/HomepageHeader");
export const loadFooter = () => import("@/components/Footer");
