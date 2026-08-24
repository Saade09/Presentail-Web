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

# Hermetic API stubs that crash the checkout page

When stubbing `**/api/**` with a `{ok:true}` catch-all (a11y-spec style), two endpoints need real shapes or checkout hits the error boundary ("Something went wrong") AFTER first paint — early selectors pass, later ones (e.g. the lazy phone field) never appear:
- `/api/delivery-config` — an `{ok:true}` body makes `FreeDeliveryBanner.parseThresholdAmount` call `.match` on undefined. Fulfill it with **404** so `useDeliveryConfig` falls back to built-in defaults.
- `/api/geo/currency` — must include `currencyCode` (e.g. `{ countryCode: "LB", currencyCode: "USD" }`) or the display-currency hook crashes in CartProvider.
Register the catch-all FIRST: Playwright matches routes newest-first, so specific stubs must come after it.

**Also:** the `playwright test` runner (bg or fg) repeatedly stalled/died without a summary in this container; a plain-node `chromium.launch()` script (sequential pages, same stubs) ran the identical captures reliably. And never `pkill -f "playwright test"` from ShellExec — the pattern matches your own shell's command line and kills it (use a `[p]` bracket pattern).

# Pre-existing 320px horizontal overflow on checkout step 1

At a 320px viewport the checkout page has ~39px of horizontal overflow (document scrollWidth ≈ 359) caused by the sign-in card's `whitespace-nowrap` provider buttons in a 2-col grid — NOT by whatever you just changed. Viewport-fit assertions at 320px must compare against the element's own card content box, not the viewport width, or they fail for this unrelated pre-existing reason.

# Hermetic card-payment checkout e2e — two more required stubs

The card submit path has two server calls beyond payment-intent/woo-order that
break hermetic runs when the API workflow is down:
- `POST /api/checkout/klarna-pending` (pre-charge order-payload persistence) is
  **fail-closed**: without a 2xx the card flow stops with "Card payments aren't
  available right now." Stub it with `{ok:true}`.
- `POST /api/checkout/fees` (pre-payment fee verification) is best-effort, but a
  live server pricing a fake catalog item can pop the price-changed confirm
  dialog mid-flow. Stub it as 404 so the client skips the comparison.

Also: stubbed `timeSlots` need explicit daytime `startHour` values — the fee
logic falls back to `cutoffHour` when `startHour` is missing, and a fallback
≥ 21 adds the $5 same-day night surcharge, silently skewing total assertions.
