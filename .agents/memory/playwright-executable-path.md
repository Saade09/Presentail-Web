---
name: Playwright executablePath in config
description: Why test:e2e silently fell back to the bundled headless-shell in the Nix container and how to point it at the system chromium
---

# Playwright `executablePath` must live under `use.launchOptions`

In a Playwright config, `use.executablePath` is NOT a valid option — it is silently ignored. The browser executable override belongs under `use.launchOptions.executablePath`.

**Why:** When the project set `use: { executablePath }` directly, the test runner ignored it and always launched the bundled `chromium-headless-shell`, which fails in the Replit Nix container with `libglib-2.0.so.0: cannot open shared object file` (missing system libs). A direct `chromium.launch({ executablePath })` worked, which masked the config bug. The fix was to wrap it: `...(executablePath ? { launchOptions: { executablePath } } : {})`.

**How to apply:** Run e2e with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)"` so the Nix system chromium is used. In CI (GitHub Actions) the env var is empty, no `launchOptions` is added, and Playwright's own downloaded browser is used — so the wrap is harmless there.

# Seeding the web checkout in an e2e test (presentail-web)

To reach checkout step 1 hermetically:
- Cart key: `presentail_cart_v1`. Location key: `presentail_delivery_location_v1` (NOT `presentail_location_v1`).
- The app router is mounted under a locale base, so navigate to the prefixed URL, e.g. `/en-lb/beirut/checkout`, not bare `/checkout` (bare path falls through to the homepage once a location is set).
- Append `?guest=1` to pre-acknowledge guest checkout so the sign-in dialog (`CheckoutLoginDialog`, guest button testid `button-checkout-as-guest`) never blocks the flow.

**Note:** The older `e2e/checkout-phone-validation.spec.ts` uses the wrong location key (`presentail_location_v1`), a bare `/checkout` URL, and a 3s race on the guest dialog — so it would also fail when actually run against a real browser.
