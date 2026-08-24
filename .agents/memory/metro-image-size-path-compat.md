---
name: Metro image-size path compatibility
description: Why the security-maintained image-size replacement needs a pnpm patch for Expo static builds.
---

Metro calls its image-dimension dependency with an image file path. The `image-size-next` security replacement accepts byte input only, so it must be patched to read string paths before inspecting bytes.

**Why:** Without the compatibility layer, Expo static publishing fails during Metro bundling with an HTTP 500 while processing Expo Router's bundled sitemap image.

**How to apply:** Keep the pnpm patched dependency alongside the workspace's `image-size` alias override. If the alias is changed or upgraded, run the complete static Expo build and confirm both platform bundles complete before publishing.