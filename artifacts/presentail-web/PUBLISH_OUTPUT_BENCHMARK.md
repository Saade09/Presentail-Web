# Web publish output benchmark

Measured on the same Replit workspace on 2026-08-28. Sizes cover emitted
JavaScript and CSS. Clean build duration is Vite's reported production build
time; full publish time additionally includes generators, precompression,
integrity checks, and provenance generation.

| Metric | Before | After |
| --- | ---: | ---: |
| Vite clean build | 14.01 s | 13.43 s |
| Full publish pipeline | not recorded | 21.15 s |
| Main entry, raw | 642.1 KB | 627.1 KB |
| Main entry, Brotli | 128.9 KB | 126.2 KB |
| Generic vendor, raw | 248.1 KB | 241.9 KB |
| Generic vendor, Brotli | 72.0 KB | 71.2 KB |
| Shared blog corpus chunk, raw | 243.7 KB | removed |
| Shared blog corpus chunk, Brotli | 55.8 KB | removed |
| Compact Blog listing route, raw | 9.3 KB + shared corpus | 21.4 KB |
| Full BlogPost route, raw | 21.1 KB + shared corpus | 258.0 KB |
| Total JS/CSS, raw | 3,100,695 bytes | 3,112,281 bytes |
| Total JS/CSS, Brotli | 733,086 bytes (23.6%) | 744,273 bytes (23.9%) |
| Total JS/CSS, gzip | 876,591 bytes (28.3%) | 883,737 bytes (28.4%) |

The full article corpus is now exclusive to the already-lazy BlogPost route.
The Blog listing uses a generated 13.5 KB source index containing only card
metadata. Non-blog routes do not statically load either route.

The 0.4% increase in total raw output is the compact listing index; it replaces
the 55.8 KB Brotli corpus download on the Journal listing rather than adding to
that route's transfer. Main-entry and generic-vendor transfers both decreased.

## Compression policy

Baseline benchmark over 3,100,695 raw JS/CSS bytes:

| Brotli | Gzip | Time | Brotli bytes | Gzip bytes |
| ---: | ---: | ---: | ---: | ---: |
| q11 | 9 | 1.593 s | 733,086 | 876,591 |
| q10 | 9 | 0.944 s | 741,246 | 876,591 |
| q9 | 6 | 0.370 s | 795,570 | 880,478 |
| q8 | 6 | 0.156 s | 798,420 | 880,478 |

Brotli q10 was selected because it cut the measured Brotli work by about 41%
while increasing Brotli transfer size by only 1.1%. Gzip level 6 was selected
because it reduced gzip work with a 0.4% transfer-size increase. The production
server continues to use the same `.br` and `.gz` sidecar filenames and content
negotiation.

## Production safeguards

- Source maps remain disabled explicitly.
- Runtime error overlay, Cartographer, and the development banner are excluded
  from production builds.
- The integrity check rejects source maps, tests, development plugins, Node
  builtins, and `pg` in browser output.
- The server-only `pg` dependency remains available to `serve.mjs` and tests;
  the browser-output guard confirms it is not bundled into shipped assets.
- Bundle visualization remains opt-in with `VITE_VISUALIZE=1` and is written
  outside `dist/public`.