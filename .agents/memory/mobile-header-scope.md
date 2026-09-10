---
name: Mobile header scope
description: Clarifies which storefront owns the compact mobile header reference.
---

The compact mobile header reference for this product applies to the responsive web storefront navbar, not automatically to the native Expo app.

**Why:** A visual reference that looks like a mobile viewport can be mistaken for a native screen; changing the native header when the issue is in the web storefront creates unrelated product changes.

**How to apply:** Inspect and update the web storefront MainNavbar for this reference. Only modify the native Expo homepage header when the user explicitly identifies the native app as the target.