# Presentail Lebanon — Expo Mobile App

A luxury flower and gift delivery app for Lebanon, UAE, and Cyprus, offering a seamless shopping experience for users to send gifts, with an accompanying web application.

## Run & Operate

- `pnpm run typecheck`: Full typecheck across all packages.
- `pnpm run build`: Typecheck and build all packages.
- `pnpm --filter @workspace/api-spec run codegen`: Regenerate API hooks and Zod schemas from OpenAPI spec.
- `pnpm --filter @workspace/db run push`: Push DB schema changes (development only).
- `pnpm --filter @workspace/api-server run dev`: Run API server locally.
- **Promote a TestFlight build to the App Store**: GitHub → Actions → "iOS – Promote TestFlight build to App Store" → Run workflow. Inputs: `mode` (`dry-run` prepares the version and previews release notes and subtitle without sending for App Review; `submit` actually sends for App Review), `build_number` (the TestFlight build number to promote, or `latest` for the most recent VALID iOS build) and `release_notes` (the "What's New" text shown on the App Store; replace the `TODO:` default before triggering). The workflow creates/updates the App Store version matching `expo.version` in `artifacts/presentail/app.json`, attaches the chosen build, mirrors the previous release's release type (defaults to `AFTER_APPROVAL` if there is no prior release), writes the release notes AND the App Store **subtitle** (the line shown under the app name on the store) to every existing localization, declares export compliance (`usesNonExemptEncryption=false`), and — only in `submit` mode — submits for App Review. The subtitle is **not** a workflow input; it lives in the repo at `artifacts/presentail/app-store-metadata.json` (`subtitle` field, currently `Same Day Gift Delivery`) so changes go through normal PR review and a subsequent promote run is what actually ships them to the store. The script enforces the App Store hard limit of 30 characters at load time, so a too-long or empty value fails fast both locally and in CI; if App Store Connect rejects the subtitle for any reason (length, disallowed characters, unknown locale) the run fails with a message naming the offending locale and the underlying ASC error instead of silently shipping a bad value. The job logs the rendered release notes and subtitle per locale and writes a step summary (with collapsible per-locale notes previews and a per-locale subtitle table) including the resulting version, build number, subtitle, review state, submission id, and a link to App Store Connect. **Recommended two-step flow**: (1) run with `mode=dry-run` and inspect the per-locale rendered notes and subtitle in the job summary; (2) re-run with the same `build_number` / `release_notes` and `mode=submit` to send the version for App Review. After a successful `submit`-mode promotion (skipped on dry-run), the workflow automatically runs `pnpm --filter @workspace/scripts run bump-app-version` (which bumps the patch component of `expo.version` in `artifacts/presentail/app.json`) and opens a PR titled `chore(ios): bump expo.version to <next>` for the team to review and merge before the next TestFlight build — without that bump, the next promotion would collide with the version that's already in App Review or Ready For Sale. You can also run the bump locally (`pnpm --filter @workspace/scripts run bump-app-version`) if you ever need to do it by hand.

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
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (Google "Web application" OAuth client id; required on both iOS and Android Expo builds — must be an EAS secret so it is inlined into the binary)
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (Google "iOS" OAuth client id; iOS builds only)
- `EXPO_PUBLIC_GOOGLE_REVERSED_IOS_CLIENT_ID` (reversed form of the iOS client id, e.g. `com.googleusercontent.apps.123-abc`; iOS builds only — derived automatically from `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` if unset)
- `GOOGLE_CLIENT_IDS` (API server only; comma-separated list of every Google OAuth client id whose `idToken` should be accepted by `POST /api/auth/social/google` — must include the iOS client id, the Android client id, AND the Web client id)
- `CLERK_SECRET_KEY` (API server only; Clerk backend secret used by `@clerk/express` middleware and by the webhook handler at `POST /api/clerk/webhook` to call `clerk.users.updateUserMetadata`)
- `CLERK_WEBHOOK_SECRET` (API server only; svix signing secret for the Clerk webhook configured in the Clerk dashboard at Configure → Webhooks → endpoint `https://<domain>/api/clerk/webhook`, subscribed to at least `user.created`. Without it, `POST /api/clerk/webhook` returns 503 and new sign-ups only get `publicMetadata.userType="customer"` lazily on their first authenticated API call via `authenticate()` in `artifacts/api-server/src/lib/auth.ts`. Each Clerk instance — development and production — has its own `whsec_…` value, so set the production secret in production and, if you also want the dev Clerk instance to fire webhooks at the Replit dev URL, add a separate dev endpoint and value)

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
- **CI/CD Workflow (iOS – TestFlight build & submit)**: `.github/workflows/ios-testflight.yml`
- **CI/CD Workflow (iOS – Promote to App Store)**: `.github/workflows/ios-app-store.yml` (uses `scripts/src/promoteToAppStore.ts`)
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
- **Display Currency Auto-Detection (mobile)**: The Expo app picks the user's display currency with a fixed precedence — manual selection (persisted) → device GPS country → IP-geolocated country → USD. The device-GPS path is implemented in `artifacts/presentail/services/locationCurrencyService.ts` (`detectGeoFromDeviceLocation`) using `expo-location` with `Accuracy.Lowest` and a 4-second timeout, then resolves coords to a country/currency via `GET /api/geo/currency-by-coords` (BigDataCloud reverse-geocode, keyless, 0.1° rounded cache, 1 h TTL, 60 req / 15 min rate limit). The foreground-location prompt is shown only on the first run (tracked by AsyncStorage key `@presentail/location-permission-asked-v1`) so denial is sticky and silent; users can re-trigger detection any time from the **Currency** sheet in Account → "Detect from my location" (passes `force: true`). The IP-based path (`/api/geo/currency`) remains the silent fallback for declined / unavailable / web cases. Requires `NSLocationWhenInUseUsageDescription` (iOS) and `ACCESS_COARSE_LOCATION` (Android), already declared in `artifacts/presentail/app.json`; a fresh EAS build is required to pick up the new permission strings.
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
- **Product detail screen must stay defensive against malformed data**: The product route (`artifacts/presentail/app/product/[slug].tsx`) is on the critical purchase path and is reached from the home screen, categories, occasions, brands, and the cart. A synchronous throw during its render closes the app on iOS before any JS error boundary can catch it (see Task #180). Three fragile spots have already bitten us: (1) `useLocalSearchParams` returning `slug` as an array on certain navigations — always coerce before string compare; (2) `product.image` being `null`/`{ uri: "" }` — only render `<Image>` when the source is a real require'd asset or a non-empty `{ uri }`; (3) `product.priceValue` arriving as `NaN`/`undefined` from a stale cart row — coerce with `Number.isFinite` before passing to `Math.round` / `formatNative` / `<Price>`. Any further assumption added to this screen (delivery country, time zone, day list) must have a safe fallback so first render cannot crash.
- **Google Sign-In needs a real iOS build**: `@react-native-google-signin/google-signin` is a native module, so "Continue with Google" only works in an EAS dev build, TestFlight build, or App Store build. It will not work in Expo Go or in the Expo web preview. After changing any of `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, or `EXPO_PUBLIC_GOOGLE_REVERSED_IOS_CLIENT_ID`, a fresh dev build is required so the iOS `Info.plist` URL types pick up the new reversed client id. `app.config.js` auto-derives the reversed iOS client id from `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` if `EXPO_PUBLIC_GOOGLE_REVERSED_IOS_CLIENT_ID` is missing or in the wrong format. The API server's `GOOGLE_CLIENT_IDS` must be a comma-separated list that contains the iOS client id, the Android client id, AND the Web client id, since any of them may appear as `aud` on the returned `idToken` depending on platform.
- **Google Sign-In on Android requires an Android OAuth client + signing SHA-1**: Unlike iOS, Android does NOT pass a client id at runtime — `GoogleSignin.configure({ webClientId })` is enough on the JS side. Instead, Google's Android SDK matches the installed APK against an **Android-type** OAuth client in Google Cloud by `(package name, signing SHA-1)`. The package name must be `com.presentail.lb` (matches `expo.android.package` in `artifacts/presentail/app.json`) and the SHA-1 must come from the actual signing key the build is signed with — for every signing key the binary may be signed with: the local debug keystore (for `eas build --profile development`), the EAS internal/preview upload keystore (`eas credentials -p android` → "Keystore: Download" → run `keytool -list -v -keystore <file>`), and the Play Store **app signing** key (Play Console → Setup → App integrity → App signing key certificate). After adding/rotating the Android client, no env vars need to change — `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is still what gets exchanged for the `idToken` — but the API server's `GOOGLE_CLIENT_IDS` must include the new Android client id so `aud` verification accepts tokens minted on Android. A symptom of "Android OAuth client missing or SHA-1 mismatch" is `signIn()` resolving with `DEVELOPER_ERROR` (status code 10) immediately after the account picker; the `serverMessage` surfaced by `signInWithGoogle` will contain `DEVELOPER_ERROR` in that case. No changes to `app.json`/`app.config.js` are needed beyond having the `@react-native-google-signin/google-signin` plugin (already present), and a fresh EAS build is still required after adding the Android OAuth client so the new SHA-1 binding takes effect.
- **`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is iOS-only**: do not set it as a hard requirement on Android builds. `app.config.js` only fails the build when the reversed iOS scheme placeholder would ship; Android builds without an iOS client id still work as long as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is present.
- **iOS bundle localizations must mirror App Store Connect**: The list of locales declared in `expo.ios.infoPlist.CFBundleLocalizations` in `artifacts/presentail/app.json` (currently `en`, `ar`, `fr`) must match the localizations enabled for the app in App Store Connect. Adding a localization on App Store Connect alone is not enough — the next EAS build must also declare it here, otherwise App Review will flag a mismatch between the store page's advertised languages and the binary's `Info.plist`. This only declares the languages on the bundle; it does not translate any in-app strings.
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
