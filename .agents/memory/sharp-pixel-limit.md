---
name: Sharp pixel limit for catalog images
description: MAX_INPUT_PIXELS was 12MP; OS occasion/category images can be 4500×4500 (20.25MP) which sharp silently rejects as corrupt.
---

## Rule
`MAX_INPUT_PIXELS` in `imageTransform.ts` must be ≥ the largest OS catalog image. OS occasion images are 4500×4500 = 20.25MP; the limit was raised to 25MP.

**Why:** sharp's `limitInputPixels` option silently fails with an opaque "corrupt image" error when the source exceeds the pixel budget. The image URL and content-type are both valid — only sharp rejects it. The symptom looks like a fetch/auth problem but is actually a size gate.

**How to apply:** If catalog images start failing with "Catalog image is corrupt" despite valid URLs, check `MAX_INPUT_PIXELS` in `artifacts/api-server/src/lib/imageTransform.ts` against the actual pixel count of the source images (width × height). Raise the limit rather than disabling it entirely.
