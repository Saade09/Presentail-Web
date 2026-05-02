import React from "react";

// The Cart tab's `tabPress` listener (in app/(tabs)/_layout.tsx) calls
// `e.preventDefault()` and opens the cart drawer, so this screen never
// actually renders. We keep a no-op component to satisfy Expo Router's
// file-based routing without triggering a redirect loop.
export default function CartTab() {
  return null;
}
