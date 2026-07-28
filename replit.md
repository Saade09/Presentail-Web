# Presentail — flower & gift delivery (LB / UAE / CY)

Mobile (Expo) + Web (React/Vite) + API server (Express 5) in a pnpm monorepo.

## Stack

pnpm workspaces · Node 24 · TypeScript 5.9 · Expo Router (mobile) · React + Vite (web) · Express 5 · PostgreSQL + Drizzle ORM · Zod / drizzle-zod · Orval (OpenAPI) · esbuild.

## Where things live

- Mobile: `artifacts/presentail` · Web: `artifacts/presentail-web` · API: `artifacts/api-server`
- DB schema: `lib/db/src/schema/` · Delivery rules: `lib/delivery` · Display currency: `lib/display-currency`
- Auth: `artifacts/api-server/src/routes/auth.ts`, `src/lib/auth.ts`, mobile `artifacts/presentail/src/contexts/AuthContext.tsx`
- iOS CI/CD: `.github/workflows/ios-testflight.yml`, `ios-app-store.yml`
- WooCommerce store resolver: `artifacts/api-server/src/lib/wooStore.ts`

## Commands

Core:
- `pnpm run typecheck` / `pnpm run build` — full workspace typecheck / build.
- `pnpm run typecheck:libs` — rebuild composite lib `.d.ts`. Run when `tsc -p artifacts/<x>` reports phantom missing-property errors on lib types (stale `lib/*/dist/*.d.ts`).
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks + Zod schemas from OpenAPI.
- `pnpm run check-codegen` — fails on drift in generated client/zod files; run after editing `lib/api-spec/openapi.yaml`. Pre-push hook: `cp .husky/pre-push .git/hooks/pre-push && chmod +x .git/hooks/pre-push`.
- `pnpm --filter @workspace/db run push` — push schema to **dev** DB. Prod migrations are automated: (1) API server `artifact.toml` prod build runs `push-force` before build (deploy aborts if migration fails; needs `DATABASE_URL` Replit secret); (2) GitHub Actions `db-migrate-prod.yml` runs `push-force` when `lib/db/**` lands on main (needs `PROD_DATABASE_URL` GH secret; manual trigger available). Emergency: `DATABASE_URL=<prod-url> pnpm --filter @workspace/db run push-force`.
- `pnpm --filter @workspace/api-server run dev` — run API server locally.

Repo checks (each script's header comment documents details/annotations):
- `pnpm run check-hardcoded-strings` — user-visible literals must use translations or `// i18n-ignore`. Pre-commit hook also runs `check-translations` + `check-nap-consistency`: `cp .husky/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`.
- `pnpm --filter @workspace/scripts run check-translations` — unused/missing/copy-pasted keys in mobile + web catalogues. Conventions: `// no-translate` (mobile `lib/translations.ts` header), one-commit EN+AR+FR rule (web `src/locales/index.ts` header).
- `pnpm --filter @workspace/scripts run check-occasion-coverage` — OS occasion slugs vs web `OCCASIONS` array + `shop.occ.*` keys (missing → raw hyphenated headings). OS live check skipped without `PRESENTAIL_OS_API_KEY`.
- `pnpm --filter @workspace/scripts run check-low-contrast-text` / `check-low-contrast-text-mobile` — WCAG AA contrast scans (web Tailwind opacity patterns / RN styles). Suppress with `// contrast-ok: <reason>`.
- `pnpm --filter @workspace/scripts run check-city-similarity` — same-country city pages must be <80% similar (thin-duplicate SEO guard).
- `pnpm --filter @workspace/scripts run check-legacy-domain` — fails if retired `new.presentail.com` reappears (breaks Apple sign-in / Apple Pay / link previews). Exception: `// allow-legacy-domain`.
- `pnpm --filter @workspace/scripts run check-nap-consistency` — phone/email sync between `Contact.tsx` and `locationData.mjs` (JSON-LD).

Web build checks (run after `pnpm --filter @workspace/presentail-web run build`; all also run in "Web serve checks" CI):
- `check-chunk-budget` — no JS chunk >200 kB Brotli.
- `check-public-image-budget` — per-format byte budgets for everything under `public/`; blog images ≤300 kB WebP-only. Re-encode with `cwebp -q 80`.
- `check-blog-hero-variants` / `generate-blog-hero-variants` — responsive blog hero WebP variants (480/768 widths from `blog-hero-variants.config.mjs`); generator runs automatically as first build step. New hero: drop `<slug>.webp` in `public/blog/`, build, commit variants.
- `check-stripe-isolation` — Stripe library code must not appear in app-entry or checkout-initial chunks (keep `@stripe/` imports behind lazy/dynamic imports; `vendor-stripe` manualChunks rule).
- `generate-og-image` — regenerate default OG share image after wordmark/brand-colour changes.
- `test:e2e` — Playwright; auto-detects the Nix `chromium`; override with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Ops & admin:
- `GET /api/admin/funnels` (HTML) and `/api/admin/funnels/data?days=N` (JSON, `x-push-admin-token`) — purchase + login-prompt funnels; shares `aggregateBuckets` with the Slack monitors.
- `GET /api/auth/diagnostics` (`x-push-admin-token`) — pings WC customers + WP JWT upstreams and runs the exists-classifier; use when shoppers are mis-routed to sign-up.
- `pnpm --filter @workspace/scripts run import-customers-to-clerk` — idempotent import of local customers into Clerk (needs `CLERK_SECRET_KEY`, `DATABASE_URL`).
- TestFlight → App Store promotion: GitHub Actions "iOS – Promote TestFlight build to App Store" (dry-run then submit; details in `ios-app-store.yml` + `scripts/src/promoteToAppStore.ts`).

## Environment variables

Required:
- Presentail OS (primary catalog + orders): `PRESENTAIL_OS_API_URL`, `PRESENTAIL_OS_API_KEY` (write perms for `POST /api/orders`), `PRESENTAIL_OS_WORKSPACE` (default `presentail`).
- WooCommerce (deprecated — mobile JWT auth only): `WC_CONSUMER_KEY`/`WC_CONSUMER_SECRET` (LB), `WC_DUBAI_*`, `WC_ABUDHABI_*`, `WC_CYPRUS_*`.
- Push & webhooks: `PUSH_ADMIN_TOKEN`; `PRESENTAIL_OS_WEBHOOK_SECRET` (HMAC-SHA256 over `{delivery-id}.{timestamp}.{rawBody}`, 5-min replay window; webhook 503s when unset). Optional: `WOO_SYNC_ENABLED`, `WOO_SYNC_INTERVAL_MS` (default 900000), `WOO_SYNC_PUSH_ON_CHANGE`. `BANNERS_REMOTE_URL` is retired (banners come via OS `banner.updated` webhook).
- API server auth: `GOOGLE_CLIENT_IDS` (comma-separated; iOS + Android + Web ids), `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`; `APPLE_SERVICE_IDS` (JWT audience for Apple web sign-in).
- CI/CD: `EXPO_TOKEN`, `ASC_API_KEY_ID`, `ASC_API_KEY_ISSUER_ID`, `ASC_API_KEY_P8`. Optional: `SITEMAP_URL`, `INDEXNOW_KEY` (both have safe defaults).

Payments:
- CyberSource (LB + USD card payments only, web & mobile): `CYBERSOURCE_MERCHANT_ID`, `CYBERSOURCE_API_KEY_ID`, `CYBERSOURCE_SHARED_SECRET_KEY` (base64 REST shared secret), `CYBERSOURCE_ENVIRONMENT` (`test`|`live`, default `test`). Any missing → capture-context 503s and the tile is hidden.
- CyberSource Unified Checkout (LB + USD web card flow, CyberSource-mandated migration off Microform+payer-auth): `CYBERSOURCE_UNIFIED_CHECKOUT_ENABLED=true` (API server — activates `/payment/cybersource/unified-checkout/*` and advertises `unifiedCheckoutEnabled` on `/payment/cybersource/available`) **and** `VITE_CYBERSOURCE_UNIFIED_CHECKOUT_ENABLED=true` (web build). BOTH must be true or the web checkout transparently falls back to the legacy Microform + payer-auth path (rollback: unset either flag). UC runs 3DS + capture inside its own widget (`completeMandate { type: CAPTURE, consumerAuthentication: "3DS" }`); the `/payer-auth/*` endpoints are never called on the UC path.
- Stripe web: `VITE_STRIPE_PUBLISHABLE_KEY`; `VITE_STRIPE_MERCHANT_COUNTRY` (Stripe account's country, default `US` — NOT shopper country; wrong value makes `stripe.paymentRequest()` throw).
- Stripe mobile: `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Replit secret (dev `pk_test_…`) AND EAS project secret (live `pk_live_…`, inlined into both iOS + Android binaries).
- Stripe Apple Pay domain file: `STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION` (served by `serve.mjs` at `/.well-known/apple-developer-merchantid-domain-association`; API server also auto-registers the domain with Stripe on startup).
- Tabby BNPL (AED/UAE only; off when unset): `TABBY_SECRET_KEY`, `TABBY_PUBLIC_KEY`. Webhook → `POST /api/payment/tabby/webhook`; refunds via admin token.

Web (Vite):
- `VITE_GOOGLE_WEB_CLIENT_ID`, `VITE_APPLE_SERVICE_ID` (both optional — buttons toast when unset). `VITE_CLERK_*` no longer used.
- Web OS catalog direct access: `VITE_OS_API_URL` (default `https://os.presentail.com`), `VITE_OS_API_KEY` (read-only key; product browsing bypasses the API server).
- Canonical redirect (serve.mjs): `WEB_CANONICAL_REDIRECT_FROM_HOST` (default `www.presentail.com`) → `WEB_CANONICAL_REDIRECT_TARGET_ORIGIN` (default `https://presentail.com`); set either to empty string to disable.

Mobile:
- `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_DOMAIN`; Google Sign-In: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_REVERSED_IOS_CLIENT_ID` (EAS secrets — see Gotchas).

Notifications (all optional, off when unset):
- Email: `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_NOTIFY_STATES` (default `confirmed,delivered`). Guest orders without email silently skipped; failures never block webhooks.
- SMS/WhatsApp: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (+ per-country `TWILIO_FROM_LB/_AE/_CY`, `TWILIO_WHATSAPP_FROM`), `SMS_CHANNEL` (`sms`|`whatsapp`|`both`), `SMS_NOTIFY_STATES` (default `out_for_delivery,delivered`), `SMS_TRACKING_URL_BASE`.

Monitors & alerting (all optional; Slack via `ALERTS_SLACK_WEBHOOK_URL`, WARN logs when unset; every monitor has an `*_ENABLED` var defaulting to on and thresholds with sane defaults — see each monitor file in `artifacts/api-server/src/lib/` for its exact vars):
- SEO audit (`seoAuditMonitor.ts`), Merchant Listing suggestions (`merchantListingSuggestionsMonitor.ts`, needs `GOOGLE_RICH_RESULTS_API_KEY`), FX fallback (`fx` — `FX_FALLBACK_*`), IP geo fallback (`geoCurrencyFallbackMonitor.ts`), Clerk session fallback, auth-exists lookup (`authExistsLookupMonitor.ts`), login-prompt funnel (`checkoutLoginFunnelMonitor.ts`), purchase funnel (`checkoutPurchaseFunnelMonitor.ts`), social sign-in failures, upsell funnel + revenue %, session-ID coverage (upsell + funnel events), web vitals + mobile TTID.
- Google Ads Conversions API (off unless all six set): `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CONVERSION_ACTION_ID`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`. Uploads click conversions on `order.status_updated=confirmed`; failures alert via `googleAdsConversionMonitor.ts`.

## Apple Sign In (web)

- No domain-verification file needed (Apple removed the requirement; old `APPLE_DOMAIN_VERIFICATION_TOKEN` logic deleted).
- Popup flow (Apple JS SDK, `usePopup: true`) — no server callback, no `.p8`/client secret. `SignIn.tsx` sends `${origin}/sign-in` as `redirectURI` → `https://presentail.com/sign-in` in prod.
- Apple Developer Console → Services ID `com.presentail.web1` → Sign In with Apple → Configure: Domains = `presentail.com`, Return URLs = `https://presentail.com/sign-in`. Missing return URL → `invalid_request` popup, no account picker.
- `VITE_APPLE_SERVICE_ID` (web, build-time — republish after changing) and `APPLE_SERVICE_IDS` (API server JWT audience) must both equal the Services ID.

## Architecture decisions

- **Presentail OS catalog**: all product listings/categories/occasions/brands come from `os.presentail.com`; `osProductsCache` is the sole in-memory product store. WC is used only for order submission and mobile JWT auth.
- **Multi-store WooCommerce**: store config resolved per request from `countryCode`/`cityId`, Lebanon fallback. Server caches keyed `${baseUrl}::${lang}`; client React Query keys include country/city.
- **In-app accounts**: native sign-in via `expo-secure-store` + WP JWT / WC REST. Clerk handles web auth. `/auth/exists` checks local `customers` table first.
- **WC_AUTH_ENABLED flag** (default false): gates all remaining WC/WP auth calls; when off, login returns `410 login_deprecated`, register/exists/me are local-only. Migration log: `wp_customer_id_map`; scripts `import-wc-customers` / `audit-wc-customers`.
- **Currency**: all `priceValue` stored in USD; conversion is display-only (`CurrencyContext`, `data/currencies.ts`). Mobile display-currency precedence: manual → GPS (`/api/geo/currency-by-coords`) → IP (`/api/geo/currency`) → USD.
- **Push notifications**: Expo Push; tokens scoped to user id; admin webhook triggers order-state pushes.
- **Scheduled OS sync** (`lib/wooSync.ts`): each tick refreshes banners, invalidates OS product cache, reconciles WC customers, silent `data_refresh` push on content change. On-demand: `POST /api/woo/sync/run` (admin token).
- **Checkout funnel analytics**: allowlisted events (`AnalyticsEventName` in OpenAPI — spec change required for new names) → `analytics_events` table → hourly monitors.
- **Locale-aware web URLs**: `/{lang}-{country}/{city}/...`; per-entity OG tags server-rendered in `seo-inject.mjs` for rich link previews.

## Product

Luxury flower & gift delivery across Lebanon, UAE, Cyprus. Multi-step checkout (card message, recipient details, district/city, date/slot or Express, payments: Stripe, CyberSource, Whish, Western Union, Mamo, PayPal, Tabby). Push notifications, optional accounts, OTA updates.

## User preferences

- _Populate as you build_

## Gotchas

- **Stale lib `.d.ts`**: after editing any `lib/*` source, run `pnpm run typecheck:libs` before trusting artifact typechecks.
- **WordPress JWT plugin required** on presentail.com for legacy login (else `503 jwt_not_installed`).
- **Payment return URLs**: Mamo/PayPal need HTTPS; `GET /api/payment/return` bridges to deep link `presentail://payment-return`.
- **Product detail screen must stay defensive** (`app/product/[slug].tsx`): sync render throw closes the iOS app. Coerce `slug` arrays, guard null/empty images, `Number.isFinite` price guards; every new assumption needs a safe fallback.
- **EAS secrets are project-level**: `EXPO_PUBLIC_*` values must be EAS secrets (inlined at build time) for production binaries, covering iOS + Android in one registration. Missing key → empty string in the binary, runtime failure. `eas secret:list` to audit.
- **Google Sign-In**: needs an EAS build (native module, not Expo Go). Android needs an Android OAuth client matching (package, signing SHA-1) for every keystore — mismatch symptom: `DEVELOPER_ERROR` (code 10) after account picker. Android client id must be in `GOOGLE_CLIENT_IDS`. iOS needs the Keychain Sharing entitlement (`keychain-access-groups` in app.json) — missing symptom: native `-61440` before the picker.
- **iOS `CFBundleLocalizations`** in `app.json` must mirror App Store Connect locales, and a fresh EAS build must ship the change.
- **IP-based currency**: `routes/geo.ts` walks `x-forwarded-for` for the leftmost public IP, prefers `cf-ipcountry`; ipapi.co + ipwho.is fallback. Rate-limiter `keyGenerator` must wrap through `ipKeyGenerator` (IPv6). Don't widen `trust proxy` casually.
- **Clerk dev vs prod keys**: `pk_live_…` is domain-locked to presentail.com — use `pk_test_…` on Replit dev. Each instance has its own `whsec_…`.
- **Clerk middleware is fail-closed**: mounted only when `CLERK_SECRET_KEY` matches `^sk_(test|live)_`; otherwise a signed-out shim keeps public routes at 200 (see `tests/clerkShim.test.ts`).
- **Clerk session token template** must include `email`, `first_name`, `last_name`, `public_metadata` (Dashboard → Sessions → Customize session token) on BOTH instances, else every request round-trips to the Clerk API (WARN: `session claims missing email/name`).
- **`/auth/exists` must consult WP users, not just WC customers**: falls back to a JWT-plugin probe; `lookup_failed`/`lookup_unavailable` must surface an error, never silently advance to sign-up. SignupStep renders an "I already have an account" escape hatch. Verify upstreams via `GET /api/auth/diagnostics`.
- **Web sign-in JIT-creates Clerk users** (`POST /api/auth/web-bridge`): same hard-error contract on `lookup_failed`/`lookup_unavailable` — advancing silently would create a duplicate Clerk account divorced from WP order history. Mobile signups mirror to Clerk via `mirrorAndPropagateToClerk`; catch-up worker `clerkCatchupSync.ts` gated on `CLERK_CATCHUP_SYNC_ENABLED` (default off).
- **Native Apple Pay (iOS app)**: `merchant.presentail` Merchant ID + Apple Pay capability on `com.presentail.lb` + Stripe cert upload + fresh EAS build; runtime `console.warn` names any missing step.
- **Category filtering**: homepage categories filtered by `PRODUCT_TYPE_SLUGS` allowlist; `BestSellersPreview` degrades gracefully.
- **Stripe `API_BASE`** (mobile `lib/stripe.ts`) must be `https://${EXPO_PUBLIC_DOMAIN}` so `/api/...` proxies same-origin.

## Pointers

- [Expo Router](https://docs.expo.dev/router/overview/) · [Drizzle ORM](https://orm.drizzle.team/) · [Zod](https://zod.dev/) · [Orval](https://orval.dev/)
- [WooCommerce REST API](https://woocommerce.github.io/woocommerce-rest-api-docs/) · [Stripe](https://stripe.com/docs) · [Expo Push Notifications](https://docs.expo.dev/push-notifications/overview/)
