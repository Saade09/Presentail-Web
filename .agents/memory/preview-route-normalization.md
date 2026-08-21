---
name: Preview route normalization
description: Keeping route normalization consistent between the production server and Vite preview.
---

When a URL is normalized in `serve.mjs`, add the equivalent client-side guard when the same malformed path can be reached through a Vite preview or client-side navigation.

**Why:** The development preview serves the SPA directly and bypasses the production server's redirects. A server-only redirect can therefore look fixed in production checks while still hydrating into an in-app 404 during preview and browser navigation.

**How to apply:** For canonical prefix or locale normalizations, test a direct browser load as well as the production server response. Keep the client redirect single-hop and before generic fallback routing.