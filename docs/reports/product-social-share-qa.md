# Product social-sharing image QA

## Automated checks

- Renderer unit tests cover source priority, generic fallback, transparent PNG,
  portrait, square, lifestyle crop with focal and X/Y position controls,
  low-resolution and under-40%-occupancy diagnostics, long-name
  independence, JPEG dimensions, and version changes.
- Route tests validate `image/jpeg`, 1200×630 output, CDN cache headers,
  generic fallback, and cache invalidation.
- `pnpm --filter @workspace/presentail-web run test -- src/lib/seo-inject.test.ts`
  validates complete product metadata (OG/Twitter title, description, image,
  dimensions, MIME and alt).
- `pnpm --filter @workspace/presentail-web run check-social-share-previews`
  validates live crawler-facing markup and each advertised JPEG.
- The configured `check-social-share-previews` workflow completed with
  **200 passed / 0 failed**, including product pages in Lebanon and Dubai.
- Browser verification on the development product page confirmed absolute,
  versioned `og:image` and `twitter:image` URLs with the expected JPEG
  response, 1200×630 dimensions, and public cache headers.
- Renderer regression coverage composites a saturated source photograph and
  asserts that the center of the product panel retains source-colored pixels,
  preventing the ivory template layer from obscuring catalog photography.
- A live Ivory Rose Vase endpoint check confirmed the real bouquet appears in
  the rendered left panel (rather than the generic fallback), alongside the
  branded right-side artwork.
- Maximum editorial scale (2×) is exercised for both square and portrait
  custom-image overrides; each case remains a valid 1200×630 JPEG rather than
  failing composition.

## Photography matrix

| Case | Expected result |
| --- | --- |
| Bouquet | `product` contain-first layout preserves the arrangement. |
| Cake | `product` contain-first layout preserves the full round form. |
| Gift box | Square source remains unstretched and centered. |
| Hamper | Wide source remains contained within the safe area. |
| Transparent PNG | PNG alpha composites cleanly against warm ivory; diagnostic reports transparent source. |
| Lifestyle | `photo` uses controlled focal-point crop; diagnostic reports lifestyle crop. |
| Missing/unusable | Generic Presentail JPEG is returned; no broken response. |
| Custom | Private object or HTTPS custom source wins over every catalog image. |

## Production share-platform validation

After deployment, paste a versioned product URL into WhatsApp, Facebook Sharing
Debugger, LinkedIn Post Inspector, X Card Validator, and iMessage. Confirm the
same 1200×630 card, product-appropriate photo, title/description/alt, and
updated URL after a forced regenerate. Record the date, URL, and screenshots
here; this repository cannot truthfully perform authenticated third-party UI
checks from CI.