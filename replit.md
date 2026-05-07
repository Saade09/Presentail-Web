# Presentail Lebanon — Expo Mobile App

A luxury flower and gift delivery app for Lebanon, UAE, and Cyprus, offering a seamless shopping experience for users to send gifts, with an accompanying web application.

## Run & Operate

- `pnpm run typecheck`: Full typecheck across all packages.
- `pnpm run build`: Typecheck and build all packages.
- `pnpm --filter @workspace/api-spec run codegen`: Regenerate API hooks and Zod schemas from OpenAPI spec.
- `pnpm --filter @workspace/db run push`: Push DB schema changes (development only).
- `pnpm --filter @workspace/api-server run dev`: Run API server locally.

**Required Environment Variables**:
- `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET` (for Lebanon WooCommerce)
- `WC_DUBAI_CONSUMER_KEY`, `WC_DUBAI_CONSUMER_SECRET` (for UAE Dubai WooCommerce)
- `WC_ABUDHABI_CONSUMER_KEY`, `WC_ABUDHABI_CONSUMER_SECRET` (for UAE Abu Dhabi WooCommerce)
- `WC_CYPRUS_CONSUMER_KEY`, `WC_CYPRUS_CONSUMER_SECRET` (for Cyprus WooCommerce)
- `PUSH_ADMIN_TOKEN` (for `POST /api/push/order-event`)
- `EXPO_TOKEN`, `ASC_API_KEY_ID`, `ASC_API_KEY_ISSUER_ID`, `ASC_API_KEY_P8` (for CI/CD, EAS access, and TestFlight submissions)
- `EXPO_PUBLIC_API_BASE_URL` (for OTA updates and `lib/stripe.ts` API base)
- `EXPO_PUBLIC_DOMAIN` (for Stripe API_BASE)
- `WOO_SYNC_ENABLED` (`1`/`true` to enable the scheduled WooCommerce sync worker; default off)
- `WOO_SYNC_INTERVAL_MS` (poll interval for the sync worker; default 900000 = 15 min, minimum 60000)
- `WOO_SYNC_PUSH_ON_CHANGE` (`0`/`false` to suppress silent `data_refresh` pushes when the sync detects content changes; default on)
- `BANNERS_REMOTE_URL` (optional JSON URL re-loaded by the sync worker; falls back to `HOMEPAGE_BANNERS` when unset or unreachable)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Mobile App**: React Native (Expo Router)
- **Web App**: React, Vite
- **API framework**: Express 5
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod, `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build tool**: esbuild (CJS bundle)

## Where things live

- **Mobile App**: `artifacts/presentail`
- **API Server**: `artifacts/api-server`
- **Web App**: `artifacts/presentail-web`
- **DB Schema**: `lib/db/src/schema/`
- **WooCommerce Store Resolver**: `artifacts/api-server/src/lib/wooStore.ts`
- **Authentication Routes**: `artifacts/api-server/src/routes/auth.ts`
- **Auth Context (Client)**: `artifacts/presentail/src/contexts/AuthContext.tsx`
- **Push Notification Schema**: `lib/db/src/schema/pushTokens.ts`, `lib/db/src/schema/appOrders.ts`
- **CI/CD Workflow (iOS)**: `.github/workflows/ios-testflight.yml`
- **Product Categories (WC slug → app slug)**: _Implicitly defined in various places by usage (e.g., `PRODUCT_TYPE_SLUGS` allowlist)_
- **Stripe API Base URL Configuration**: `lib/stripe.ts`
- **Country Codes for Phone Fields**: `data/countryCodes.ts`
- **Currency Definitions**: `data/currencies.ts`
- **API Contracts (OpenAPI spec)**: _Populate as you build_
- **Theme/Styling**: _Populate as you build_

## Architecture decisions

- **Multi-Store WooCommerce Integration**: The API server dynamically resolves WooCommerce store configurations (URL, credentials, currency, country) based on `countryCode`/`cityId` from query parameters or headers, with Lebanon as a fallback. This supports distinct product catalogs, pricing, and delivery logistics per region.
- **Cache Isolation**: Product and homepage caches are isolated per store and language (`${store.baseUrl}::${lang}`) on the server, and client-side React Query keys include `countryCode`/`cityId` to ensure cache invalidation upon store switching.
- **Hybrid Product Catalog Management**: WooCommerce is the primary source of truth for product price, name, and images. A static local catalog supplements with occasion tags, detailed descriptions, and fallback images, allowing for richer product data while maintaining WC for core commerce.
- **In-App Account System**: Implemented a fully native sign-in/sign-up/delete flow using `expo-secure-store` for token management and direct WordPress JWT/WC REST API calls, avoiding web redirects for a smoother user experience and Apple guideline compliance.
- **Robust Push Notification System**: Utilizes Expo Push Notifications, with server-side logic to register/unregister tokens (securely linking to user IDs), track order states, and trigger notifications for key events (confirmed, out for delivery, delivered) via an admin-only webhook.
- **Client-side Currency Conversion**: All product `priceValue` is stored in USD (WooCommerce base currency) and converted only at the point of display in the UI, using exchange rates and symbols defined in `data/currencies.ts`. This simplifies backend currency management and ensures consistent pricing logic.
- **Dynamic Content per Store**: Categories and occasions are fetched dynamically from WooCommerce per store, ensuring localized and relevant product offerings without hardcoding.
- **Scheduled WooCommerce Sync (Lebanon, Dubai, Abu Dhabi)**: `lib/wooSync.ts` polls each configured store on `WOO_SYNC_INTERVAL_MS`, force-refreshes the `allProductsCache` / `occasionIdCache` / homepage `collectionCache` per store, reloads banners from `BANNERS_REMOTE_URL` (with the static fallback), reconciles WooCommerce customers into local rows (and backfills `app_orders.user_id`), then sends a silent Expo `data_refresh` push (`_contentAvailable: true`, `priority: high`, `sound: null`) to tokens whose persisted `countryCode`/`cityId` map to that store. The mobile app's foreground listener invalidates the matching React Query keys. A `POST /api/woo/sync/run` admin endpoint (gated by `PUSH_ADMIN_TOKEN`) triggers a run on demand.

## Product

- **Luxury Flower & Gift Delivery**: Core service for ordering and delivering gifts across Lebanon, UAE, and Cyprus.
- **Multi-Country Support**: Services available in Lebanon, UAE (Dubai, Abu Dhabi, etc.), and Cyprus, each with localized pricing and delivery options.
- **Dynamic Product Catalog**: Categories and occasions are fetched dynamically from WooCommerce, with intelligent filtering to present relevant product types.
- **Comprehensive Checkout Flow**: Multi-step checkout including card message, recipient details, country-aware district/city selection, delivery date/slot selection, and various payment methods (Stripe, Whish Money, Western Union, Mamo, PayPal).
- **Order Tracking & Notifications**: Users receive push notifications for key order status updates (confirmed, out for delivery, delivered).
- **User Accounts**: Optional in-app account creation, login, and management (profile view, account deletion) integrated with WordPress.
- **Over-the-Air (OTA) Updates**: Seamless updates for the mobile app without requiring a new app store download.
- **Locale-Aware Web Experience**: The web application supports `/{lang}-{country}/{city}/...` URL routing, allowing users to browse and shop in their preferred language and location.

## User preferences

- _Populate as you build_

## Gotchas

- **WooCommerce JWT Plugin**: The "JWT Authentication for WP REST API" plugin is *required* on `presentail.com` for user login to function. Without it, login will return a `503 jwt_not_installed` error. Registration works, but signing in will fail.
- **Payment Return URLs**: Mamo/PayPal require HTTPS return URLs. The API server provides a `GET /api/payment/return` endpoint that bridges the external payment gateway's HTTPS redirect to the app's deep link (`presentail://payment-return`).
- **Currency Handling**: All product `priceValue` is stored in USD internally, with conversion happening only at display time based on the active display currency (`CurrencyContext`). The WooCommerce payload for orders also sends USD `priceValue`.
- **Category Filtering**: Homepage categories are filtered by a `PRODUCT_TYPE_SLUGS` allowlist to exclude non-product categories (occasions, colors, recipients). `BestSellersPreview` has a fallback for empty categories.
- **Expo Push Token Rotation**: The app includes `PushTokenRotationListener` to re-register push tokens, ensuring notifications continue to be delivered even if tokens change.
- **API_BASE for Stripe**: The `API_BASE` in `lib/stripe.ts` must point to `https://${EXPO_PUBLIC_DOMAIN}` to correctly proxy `/api/...` calls to the API server from the same origin.
- **No hardcoded category IDs**: All category lookups for occasions are done by slug and cached, ensuring flexibility with WooCommerce category changes.
- **Google Sign-In needs a real iOS build**: `@react-native-google-signin/google-signin` is a native module, so "Continue with Google" only works in an EAS dev build, TestFlight build, or App Store build. It will not work in Expo Go or in the Expo web preview. After changing any of `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, or `EXPO_PUBLIC_GOOGLE_REVERSED_IOS_CLIENT_ID`, a fresh dev build is required so the iOS `Info.plist` URL types pick up the new reversed client id. `app.config.js` auto-derives the reversed iOS client id from `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` if `EXPO_PUBLIC_GOOGLE_REVERSED_IOS_CLIENT_ID` is missing or in the wrong format. The API server's `GOOGLE_CLIENT_IDS` must be a comma-separated list that contains BOTH the iOS client id and the Web client id, since either may appear as `aud` on the returned `idToken`.
- **`EXPO_PUBLIC_GOOGLE_*` must be EAS build-time secrets, not just Replit secrets**: any value prefixed with `EXPO_PUBLIC_` is inlined into the JS bundle when EAS builds the binary, so setting `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, and `EXPO_PUBLIC_GOOGLE_REVERSED_IOS_CLIENT_ID` only on Replit means the TestFlight/App Store binary ships with `undefined` and Google sign-in fails instantly without ever opening the native sheet. Add all three via `eas secret:create` (or the EAS dashboard, project-level) and trigger a fresh build whenever any of them change. `app.config.js` will throw during a non-development EAS build if the reversed iOS client id falls back to the `com.googleusercontent.apps.unconfigured` placeholder, so a misconfigured build fails loudly instead of silently shipping. The iOS OAuth client in Google Cloud must also be created against the app's actual `expo.ios.bundleIdentifier` (currently `presentail`) — a bundle-id mismatch causes Google's iOS SDK to refuse to open the picker with no usable error to the JS layer.

## Pointers

- [pnpm-workspace skill](https://www.google.com/search?q=pnpm+workspace+documentation)
- [Expo Router documentation](https://docs.expo.dev/router/overview/)
- [Drizzle ORM documentation](https://orm.drizzle.team/)
- [Zod documentation](https://zod.dev/)
- [Orval documentation](https://orval.dev/)
- [WooCommerce REST API documentation](https://woocommerce.github.io/woocommerce-rest-api-docs/)
- [Stripe documentation](https://stripe.com/docs)
- [Expo Push Notifications documentation](https://docs.expo.dev/push-notifications/overview/)
- [Mamo/PayPal API Documentation](https://www.google.com/search?q=mamo+paypal+api+documentation)
