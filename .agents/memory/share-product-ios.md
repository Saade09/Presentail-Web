---
name: iOS product share — product name in share sheet
description: How the product share button works and why title param is insufficient on iOS 16+
---

## Rule
On iOS 16+, `Share.share({ url, title })` does NOT display `title` in the share sheet UI. The link preview card shows only OG-tag data fetched from the URL. Use `{ message: "${productName}\n${url}" }` (message-only, no separate `url` field) so the product name appears as the share preview text.

**Why:** The `title` prop maps to `UIActivityViewController.title` which Apple no longer renders visibly in the iOS 16+ share sheet. Only `message` (text preview) and fetched OG tags appear.

**How to apply:** Any share action that needs the product/item name visible in the iOS share sheet must embed the name in the `message` string. Using only `url` + `title` is unreliable. Do NOT set both `message` (containing a URL) AND `url` — that triggers iOS "2 Items" mode which pastes the URL twice.

## WEB_BASE_URL
`presentail.com` does NOT serve locale-prefixed routes (`/en-lb/beirut/product/...`) — these 404. The Replit deployment is at `new.presentail.com`. `WEB_BASE_URL` in `artifacts/presentail/app/product/[slug].tsx` must be `https://new.presentail.com`.

## SEO OG injection
The `serve.mjs` for `presentail-web` calls `http://localhost:80/api/woo/product?slug=...` (via `INTERNAL_API_BASE_URL`). The `/api/woo/product` endpoint looks up products by the OS product `id` (which is the slug-like string, e.g. `gold-chrome-balloons`), NOT by the WooCommerce `slug` field (which is empty string on OS products). The slug in the share URL comes from `useLocalSearchParams()` in the product screen, which equals the OS product id.
