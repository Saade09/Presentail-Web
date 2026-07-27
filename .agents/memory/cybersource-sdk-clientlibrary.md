---
name: CyberSource SDK version from JWT clientLibrary
description: Flex Microform v2 SDK URL must come from the capture-context JWT, and targetOrigins must include EVERY ancestor origin (e.g. replit.com for the workspace preview) — both failure modes present as "refused to connect".
---

## Rule

Always load the Flex SDK from the capture-context JWT's `ctx[0].data.clientLibrary` field.
Apply the SRI integrity hash from `ctx[0].data.clientLibraryIntegrity` with `crossOrigin="anonymous"`.
Never hardcode a generic `/v2/flex-microform.min.js` URL.

**Why:** The JWT specifies an exact versioned bundle (e.g. `v2.12.1`). The generic `/v2/` URL resolves to a different version, which creates iframe URLs that do not match the capture context's expected versioned path, causing the iframe to show "refused to connect".

**How to apply:**
- Decode JWT payload client-side: base64url-decode `jwt.split(".")[1]`, parse JSON.
- Extract `payload.ctx[0].data.clientLibrary` and `payload.ctx[0].data.clientLibraryIntegrity`.
- Load script with `script.integrity = clientLibraryIntegrity; script.crossOrigin = "anonymous"`.
- API server: expose these two fields in both capture-context endpoint responses so clients can use them without re-decoding.

**Files:**
- `artifacts/presentail-web/src/pages/CyberSourceSection.tsx` — `extractSdkInfo()` + `loadFlexScript(url, integrity)`
- `artifacts/presentail-web/public/cs-test.html` — same pattern
- `artifacts/presentail-web/public/cybersource-tokenise.html` — mobile WebView, same pattern
- `artifacts/api-server/src/routes/payment.ts` — `extractClientLibraryInfo()` used in both capture-context responses

## Rule 2 — targetOrigins must cover the ENTIRE ancestor chain

CyberSource serves its Microform iframes with a CSP `frame-ancestors` header built from the capture context's `targetOrigins`. The browser checks that header against **every ancestor origin**, not just the page's own origin.

**Why:** In the Replit workspace preview the page runs inside an iframe on `https://replit.com`, so the chain is `flex iframe → app page (…riker.replit.dev) → replit.com`. With only the page origin in `targetOrigins`, the iframe src is correct, `load()` succeeds, and every JS-level check passes — yet the browser blocks rendering with "refused to connect". This is invisible to code; only `window.location.ancestorOrigins` + the CSP console error reveal it.

**How to apply:**
- Server `resolveTargetOrigins()` adds `https://replit.com` whenever `REPLIT_DOMAINS` is set (dev/preview only; production `presentail.com` is not framed).
- Debug pattern: log `blockedAncestors = ancestorOrigins.filter(o => !jwtTargetOrigins.includes(o))` — non-empty means guaranteed "refused to connect" regardless of everything else being correct.
- A standalone diagnostic route `/cybersource-test` (dev-only, locale-prefixed shell so use e.g. `/en-lb/beirut/cybersource-test`) runs the pure official sequence and prints the origin-check JSON on-page.
