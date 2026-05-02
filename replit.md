# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Presentail Lebanon — Expo Mobile App

Luxury flower & gift delivery app for Lebanon. Built with Expo Router (iOS/Android/Web).

### Architecture
- **artifacts/presentail** — Expo mobile app (React Native + Expo Router)
- **artifacts/api-server** — Express API server (port 8080)

### WooCommerce Integration
- **Store**: `https://presentail.com/lebanon/wp-json/wc/v3`
- **Secrets**: `WC_CONSUMER_KEY` (ck_…), `WC_CONSUMER_SECRET` (cs_…)
- **GET /api/woo/products** — Fetches all published/in-stock products (paginated, 100/page), merges with static catalog. Returns ~345 products with categories mapped to app slugs.
- **POST /api/woo/order** — Creates a WooCommerce order on every checkout. Items with `wcId` → `line_items`; static-only items → `fee_lines`. All delivery/card meta stored as order metadata.
- **WooProductsContext** — fetches WC products on app startup, merges with static catalog (WC data wins on price/image/name). Static catalog provides occasion tags, fallback images.

### Product Categories (WC slug → app slug)
hand-bouquets, flower-boxes, flower-vases, lux-arrangements, dried-flowers, preserved-flowers, plants, balloons, board-games, cakes, chocolate, bundles, electronics, arabic-sweets, stuffed-animals

### Checkout Flow
1. Step 0 — Card message + QR link (live preview from `api.qrserver.com` when URL typed), recipient name, quantity
2. Step 1 — District (26 Lebanese districts with fees), delivery date/slot, sender details
3. Step 2 — Payment method (Card via Stripe, Whish Money, Western Union, Mamo, PayPal)
- On confirm: WooCommerce order created immediately (fire-and-forget)
- Hosted-checkout payments (Stripe / Mamo / PayPal): opened with `WebBrowser.openAuthSessionAsync` so the in-app browser blocks until the user is redirected back via the `presentail://payment-return` deep link. The success screen is **only** shown when the return URL contains `status=success` — cancel/dismiss returns to checkout with an alert.
- Return URL bridge: `GET /api/payment/return?deeplink=presentail://payment-return?...&status=...` → 302/HTML-redirect to the deep link. Necessary because Mamo/PayPal require HTTPS return URLs.
- Order metadata uses WFACP custom field IDs: `card_message`, `wfacp_card_message`, `to_text`, `from`, `delivery`, `secret_id`, `qr-code`, `qr-label` + visible delivery fields for ops.

### In-App Account (Apple Guideline 2.1.0 / 5.1.1)
Optional sign-in / sign-up / delete, fully native — no web redirect (replaces the old `WebBrowser.openBrowserAsync` to `/lebanon/login`).
- **Server**: `routes/auth.ts`
  - `POST /api/auth/login` → WordPress JWT Auth plugin's `/jwt-auth/v1/token`
  - `POST /api/auth/register` → WC REST `/customers` (then auto-issues JWT)
  - `GET / PUT / DELETE /api/auth/me` → require `Authorization: Bearer <jwt>`. Token is validated against WP's `/jwt-auth/v1/token/validate`, then the customer id is read from the validated JWT payload (never trust client-supplied id).
- **Client**: `contexts/AuthContext.tsx` stores `{ token, user }` in `expo-secure-store` (Keychain/Keystore). Screens: `app/login.tsx`, `app/register.tsx`, `app/(tabs)/account.tsx` (signed-out and signed-in views with profile + delete).
- **WordPress requirement**: install **JWT Authentication for WP REST API** plugin on `presentail.com`. While the plugin is missing, login responds `503 jwt_not_installed` with a friendly message; registration still works (uses WC REST keys), but the new account can't sign in until the plugin is enabled.

### Push Notifications (real Expo pushes on order events)
- **DB**: `lib/db/src/schema/pushTokens.ts` (token unique, platform, userId, deviceId) and `appOrders.ts` (appOrderId unique, wcOrderId, userId, deviceId, recipientName, deliveryDate/slot, state).
- **API**:
  - `POST /api/push/register` — upserts the Expo token; if `Authorization: Bearer <jwt>` is present, the userId comes from the validated JWT (never the client). Also claims any guest tokens previously stored against the same `deviceId`.
  - `POST /api/push/unregister` — deletes by token and/or deviceId. Called on sign-out and account deletion.
  - `POST /api/push/order-event` — admin-only (header `x-push-admin-token: $PUSH_ADMIN_TOKEN`), looks up the app order and pushes a copy-mapped notification for state `confirmed | out_for_delivery | delivered`. Persists the new state on the order row. Use this from a Woo/CRM webhook to trigger pushes when ops change order status.
  - On `POST /api/woo/order` success the server inserts the app↔WC mapping (`appOrders`) and fire-and-forgets a `confirmed` push, both wrapped in try/catch so checkout never fails on push errors.
- **Push delivery**: `lib/expoPush.ts` posts to `https://exp.host/--/api/v2/push/send` and prunes any token returned with `DeviceNotRegistered`.
- **Mobile**:
  - `services/notifications.ts` — `getDeviceId` (stable per-install id in AsyncStorage), `registerPushToken` / `unregisterPushToken`, sets up the Android default channel, fetches the Expo token via `Notifications.getExpoPushTokenAsync({ projectId })`. No-ops on web.
  - `app/_layout.tsx` — global `Notifications.setNotificationHandler` (banner/sound/badge in foreground) plus `PushTokenRotationListener` re-registering on `addPushTokenListener`.
  - `app/(tabs)/index.tsx` — registers after `requestPermission()` returns `granted`, and re-syncs on cold start when status is already `granted`.
  - `contexts/AuthContext.tsx` — login/register call `registerPushToken({ authToken, userId })` to claim the token; logout/deleteAccount call `unregisterPushToken()`.
  - `app/checkout.tsx` + `lib/woo.ts` — checkout payload now sends `appUserId` and `appDeviceId` so the server-side `confirmed` push routes back to the buyer's tokens.

### OTA Updates (`expo-updates`)
- `app.json`: `updates.url`, `runtimeVersion: { policy: "appVersion" }`, `expo-updates` plugin.
- `app/_layout.tsx` `useAutoUpdate()` runs on cold start in production builds: `checkForUpdateAsync` → `fetchUpdateAsync` → `reloadAsync`. Result: a single cold start applies the latest OTA (no more "open twice to see changes").
- Push: `cd artifacts/presentail && EXPO_PUBLIC_API_BASE_URL=<api-base> eas update --branch production --message "…"`. Requires being logged into EAS (`eas login`) or `EXPO_TOKEN` env var.

### Delivery Fee Logic
- `districtFee = subtotal >= $130 ? FREE : district.fee` ($8–$39)
- `expressFee = deliveryMode === "express" ? $15 : 0`

### Frontend State
- **CartContext** persists `items[]` to `AsyncStorage` under key `@presentail/cart-v1` (web → localStorage, native → SQLite). Hydration is gated by an `isHydrated` ref and merges with any in-flight items so adds during initial load are not lost.
- **WooProductsContext** keeps `INITIAL_CATALOG` (deduped by id, since the static catalog has 8 duplicate slugs). After WC sync, `mergeProducts` overrides price/name/image when WC matches and preserves static `occasions`, `tag`, `description` when present.
- **CurrencyContext** (`@presentail/currency-v1` AsyncStorage) holds the active display currency. All product `priceValue` is stored in USD (the WC base currency). Conversion happens only at display via `formatPrice(usd)` / `<Price usd={…} />`. The WC payload still sends USD `priceValue` to keep WC books in base currency. Rates and symbols live in `data/currencies.ts` (USD/AED/EUR/GBP/CAD/AUD/QAR/SAR/KWD/OMR/CHF/SEK/DKK; KWD & OMR use 2 decimals). AED renders with a custom inline SVG dirham glyph (`components/DirhamSymbol.tsx`) since Unicode coverage is unreliable. The `total` URL param sent to `/order-confirmed` stays USD-base; the page re-formats with the active currency.
- **PhoneField** (`components/PhoneField.tsx`) — reusable country-code selector for recipient phone & sender WhatsApp (default Lebanon). Bottom-sheet modal with search; `data/countryCodes.ts` is the source list and **excludes Israel**. The WC payload sends `${country.dial} ${phone}` for both billing & recipient.
- **API_BASE** in `lib/stripe.ts`: `https://${EXPO_PUBLIC_DOMAIN}` so `/api/...` hits the api-server proxied at the same origin. No `/api-server` path suffix.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
