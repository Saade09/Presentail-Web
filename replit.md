# Presentail Lebanon — Expo Mobile App

A luxury flower and gift delivery app for Lebanon, UAE, and Cyprus, with an accompanying web storefront. Mobile (Expo) + Web (React/Vite) + API server (Express) in a pnpm monorepo.

## Run & Operate

- `pnpm run typecheck` / `pnpm run build`: full workspace typecheck / build.
- `pnpm run typecheck:libs`: rebuild composite lib `.d.ts` files. Run this if `tsc -p artifacts/<x>` reports phantom errors about missing properties on schema/lib types — it almost always means the cached `lib/*/dist/*.d.ts` is stale.
- `pnpm --filter @workspace/api-spec run codegen`: regenerate API hooks and Zod schemas from the OpenAPI spec.
- `pnpm --filter @workspace/db run push`: push DB schema changes (development only).
- `pnpm --filter @workspace/api-server run dev`: run API server locally.
- `pnpm --filter @workspace/scripts run import-customers-to-clerk`: import existing local customer rows into Clerk so returning shoppers signing in via Clerk are matched to their existing customer row by email. See script header for flags. Idempotent. Requires `CLERK_SECRET_KEY`, `DATABASE_URL`.
- **Promote a TestFlight build to the App Store**: GitHub → Actions → "iOS – Promote TestFlight build to App Store". Two-step flow recommended (`mode=dry-run` to preview the per-locale notes & subtitle in the job summary, then re-run with `mode=submit`). Subtitle lives in `artifacts/presentail/app-store-metadata.json` (≤30 chars). On successful `submit` the workflow auto-bumps `expo.version` via `pnpm --filter @workspace/scripts run bump-app-version` and opens a PR. Full behaviour and inputs documented in `.github/workflows/ios-app-store.yml` and `scripts/src/promoteToAppStore.ts`.

**Required Environment Variables**:
- WooCommerce: `WC_CONSUMER_KEY`/`WC_CONSUMER_SECRET` (LB), `WC_DUBAI_*`, `WC_ABUDHABI_*`, `WC_CYPRUS_*`.
- Push & sync: `PUSH_ADMIN_TOKEN`; optional `WOO_SYNC_ENABLED`, `WOO_SYNC_INTERVAL_MS` (default 900000, min 60000), `WOO_SYNC_PUSH_ON_CHANGE`, `BANNERS_REMOTE_URL`.
- CI/CD: `EXPO_TOKEN`, `ASC_API_KEY_ID`, `ASC_API_KEY_ISSUER_ID`, `ASC_API_KEY_P8`.
- Mobile: `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_DOMAIN`.
- Google Sign-In (mobile, EAS-secret only — see Gotchas): `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_REVERSED_IOS_CLIENT_ID` (auto-derived from the iOS id).
- API server auth: `GOOGLE_CLIENT_IDS` (comma-separated, must include iOS + Android + Web client ids), `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` (svix `whsec_…`, separate value per Clerk instance).
- Web (Vite): `VITE_CLERK_PUBLISHABLE_KEY`, optional `VITE_CLERK_PROXY_URL`.

## Stack

pnpm workspaces · Node 24 · TypeScript 5.9 · Expo Router (mobile) · React + Vite (web) · Express 5 · PostgreSQL + Drizzle ORM · Zod / drizzle-zod · Orval (OpenAPI) · esbuild.

## Where things live

- Mobile: `artifacts/presentail` · Web: `artifacts/presentail-web` · API: `artifacts/api-server`
- DB schema: `lib/db/src/schema/` (push tokens & app orders in `pushTokens.ts`, `appOrders.ts`)
- Shared delivery rules (express surcharge, slot tables, recipient-country windows): `lib/delivery`
- Display currency rules: `lib/display-currency`
- WooCommerce store resolver: `artifacts/api-server/src/lib/wooStore.ts`
- Auth: `artifacts/api-server/src/routes/auth.ts`, `artifacts/api-server/src/lib/auth.ts`, mobile `artifacts/presentail/contexts/AuthContext.tsx`
- iOS CI/CD: `.github/workflows/ios-testflight.yml`, `.github/workflows/ios-app-store.yml`
- Stripe API base: `artifacts/presentail/lib/stripe.ts` · Country codes: `artifacts/presentail/data/countryCodes.ts` · Currencies: `artifacts/presentail/data/currencies.ts`

## Architecture decisions

- **Multi-store WooCommerce**: API server resolves store config (URL, credentials, currency, country) per request from `countryCode`/`cityId`, with Lebanon as fallback. Server caches are keyed `${baseUrl}::${lang}`; client React Query keys include `countryCode`/`cityId`.
- **Hybrid catalog**: WooCommerce is source of truth for price / name / images. A static local catalog supplements with occasion tags, descriptions, and fallback images.
- **In-app accounts**: Native sign-in / sign-up / delete using `expo-secure-store` + WordPress JWT / WC REST. Avoids web redirects (smoother UX, Apple-compliant). Clerk handles web auth and is being migrated to mobile.
- **Push notifications**: Expo Push, server registers/unregisters tokens scoped to user id, an admin-only webhook triggers order-state pushes.
- **Currency**: All `priceValue` is stored in USD (WC base) and converted only at display time via `CurrencyContext` and `data/currencies.ts`.
- **Display currency auto-detection (mobile)**: precedence is manual pick → device GPS → IP → USD. GPS path uses `expo-location` (Lowest accuracy, 4 s timeout) → `GET /api/geo/currency-by-coords` (BigDataCloud, keyless, 0.1° rounded cache, 1 h TTL, 60 req / 15 min). Permission prompt is shown only on the first run (AsyncStorage `@presentail/location-permission-asked-v1`); re-triggerable from the Currency sheet. IP-based `/api/geo/currency` is the silent fallback.
- **Scheduled WC sync**: `lib/wooSync.ts` polls each store on `WOO_SYNC_INTERVAL_MS`, force-refreshes product / occasion / homepage caches, reloads banners, reconciles WC customers into local rows, then sends a silent Expo `data_refresh` push to tokens whose persisted `countryCode`/`cityId` map to that store. The mobile foreground listener invalidates the matching React Query keys. `POST /api/woo/sync/run` triggers on demand (gated by `PUSH_ADMIN_TOKEN`).
- **Locale-aware web URLs**: `/{lang}-{country}/{city}/...` for browse and shop. SEO-injected per-entity OG tags (product / brand / category / occasion) are rendered server-side so WhatsApp / iMessage / Slack get rich previews; see `artifacts/presentail-web/seo-inject.mjs`.

## Product

Luxury flower & gift delivery across Lebanon, UAE, and Cyprus. Multi-step checkout (card message, recipient details, country-aware district/city, date/slot or Express, multiple payment methods: Stripe, Whish, Western Union, Mamo, PayPal). Push notifications for order state. Optional accounts. OTA updates.

## User preferences

- _Populate as you build_

## Gotchas

- **Stale lib `.d.ts`**: composite project references read each lib's emitted `.d.ts`, not its source. After editing `lib/db/src/schema/*` (or any other lib), run `pnpm run typecheck:libs` before trusting `pnpm --filter @workspace/<artifact> run typecheck` — phantom "Property does not exist on type X" errors against schema/lib types are almost always stale dist files.
- **WordPress JWT plugin required**: "JWT Authentication for WP REST API" must be installed on `presentail.com` for login. Without it, login returns `503 jwt_not_installed` (registration still works).
- **Payment return URLs**: Mamo / PayPal need HTTPS, so `GET /api/payment/return` bridges the gateway redirect to the app's deep link `presentail://payment-return`.
- **Currency on the wire**: Order payloads sent to WC also use USD `priceValue`; conversion is display-only.
- **Category filtering**: Homepage categories are filtered by the `PRODUCT_TYPE_SLUGS` allowlist to exclude occasion / colour / recipient categories. `BestSellersPreview` falls back gracefully on empty categories.
- **Stripe `API_BASE`**: `lib/stripe.ts`'s `API_BASE` must be `https://${EXPO_PUBLIC_DOMAIN}` so `/api/...` calls proxy through the same origin.
- **Product detail screen must stay defensive**: `artifacts/presentail/app/product/[slug].tsx` is on the critical purchase path. A synchronous throw during render closes the iOS app before any error boundary catches it (Task #180). Three known fragile spots: (1) `useLocalSearchParams` may return `slug` as an array — coerce before string compare; (2) `product.image` may be `null` / `{ uri: "" }` — only render `<Image>` for a real require'd asset or non-empty `{ uri }`; (3) `product.priceValue` may arrive `NaN` / `undefined` from a stale cart row — gate with `Number.isFinite` before `Math.round` / `formatNative` / `<Price>`. Any new assumption (delivery country, time zone, day list) must have a safe fallback so first render cannot crash.
- **Google Sign-In needs an EAS build, not Expo Go**: `@react-native-google-signin/google-signin` is a native module. Required env values must be EAS build-time secrets (`EXPO_PUBLIC_*` are inlined into the binary at build time), not just Replit secrets. After changing any Google client id, trigger a fresh build. `app.config.js` auto-derives the reversed iOS scheme and fails the build if the placeholder would ship.
- **Google Sign-In on Android needs an Android OAuth client + signing SHA-1**: Google's Android SDK matches `(package name = com.presentail.lb, signing SHA-1)` against an Android-type OAuth client. Add SHA-1s for every signing key the binary may carry: local debug keystore, EAS upload keystore, Play Store app-signing key. Add the Android client id to the API server's `GOOGLE_CLIENT_IDS` so `aud` verification accepts those tokens. Symptom of mismatch: `signIn()` resolves with `DEVELOPER_ERROR` (status code 10) immediately after the account picker.
- **iOS bundle localizations must mirror App Store Connect**: `expo.ios.infoPlist.CFBundleLocalizations` in `artifacts/presentail/app.json` (currently `en`, `ar`, `fr`) must equal the localizations enabled on App Store Connect, otherwise App Review flags a mismatch. Adding a locale on ASC alone is not enough — the next EAS build must also declare it.
- **IP-based currency detection**: Replit puts requests through multiple proxy hops, so `req.ip` ≠ the real client IP. `routes/geo.ts` walks `x-forwarded-for` for the leftmost public address (`pickClientIp`) and prefers `cf-ipcountry` when present. Upstream lookup is ipapi.co with ipwho.is as a keyless fallback (without it, ipapi.co's 1000/day quota silently pins everyone to USD). Negative cache is 60 s, positive 1 h. The rate-limiter's `keyGenerator` must wrap the resolved IP through `ipKeyGenerator` (express-rate-limit v8) or IPv6 visitors silently bypass the limit. Don't widen `app.set("trust proxy", 1)` casually — other limiters key off `req.ip`.
- **Clerk dev vs prod keys**: production Clerk keys (`pk_live_…`/`sk_live_…`) are domain-locked to `presentail.com` and won't work on Replit dev preview URLs. Use the development Clerk instance keys (`pk_test_…`) for local/dev, prod keys only for the deployed app. Each Clerk instance also has its own `whsec_…` webhook secret.

## Pointers

- [Expo Router](https://docs.expo.dev/router/overview/) · [Drizzle ORM](https://orm.drizzle.team/) · [Zod](https://zod.dev/) · [Orval](https://orval.dev/)
- [WooCommerce REST API](https://woocommerce.github.io/woocommerce-rest-api-docs/) · [Stripe](https://stripe.com/docs) · [Expo Push Notifications](https://docs.expo.dev/push-notifications/overview/)
