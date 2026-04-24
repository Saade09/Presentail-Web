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
3. Step 2 — Payment method (Card via Stripe, Whish Money, Western Union)
- On confirm: WooCommerce order created immediately (fire-and-forget)
- Card path: Stripe Checkout session opened in browser
- Order metadata uses WFACP custom field IDs: `card_message`, `wfacp_card_message`, `to_text`, `from`, `delivery`, `secret_id`, `qr-code`, `qr-label` + visible delivery fields for ops.

### Delivery Fee Logic
- `districtFee = subtotal >= $130 ? FREE : district.fee` ($8–$39)
- `expressFee = deliveryMode === "express" ? $15 : 0`

### Frontend State
- **CartContext** persists `items[]` to `AsyncStorage` under key `@presentail/cart-v1` (web → localStorage, native → SQLite). Hydration is gated by an `isHydrated` ref and merges with any in-flight items so adds during initial load are not lost.
- **WooProductsContext** keeps `INITIAL_CATALOG` (deduped by id, since the static catalog has 8 duplicate slugs). After WC sync, `mergeProducts` overrides price/name/image when WC matches and preserves static `occasions`, `tag`, `description` when present.
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
