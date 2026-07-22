# Presentail

Presentail is a luxury flower and gift delivery platform serving Lebanon, the UAE, and Cyprus. It combines a React/Vite web storefront, an Expo mobile app, and an Express API server in a pnpm monorepo. Product catalog data is sourced from the Presentail OS API; orders are submitted through the same system. The platform supports English, Arabic, and French and automatically adapts pricing currency based on the shopper's detected country.

## Overview

Presentail lets shoppers browse curated floral arrangements, gift boxes, chocolates, balloons, and bespoke hampers, then place a same-day or scheduled delivery order to a recipient in Beirut, Dubai, Abu Dhabi, Nicosia, or other supported cities. Key characteristics:

- **Locations and languages**: Lebanon (`en-lb`, `ar-lb`, `fr-lb`), UAE (`en-ae`, `ar-ae`, `fr-ae`), Cyprus (`en-cy`, `ar-cy`, `fr-cy`). Each country has one or more canonical cities; the URL structure encodes both locale and city (e.g. `/en-lb/beirut/shop`).
- **Currency**: Display currency is resolved from the shopper's IP-detected country. Lebanon shoppers see USD; UAE shoppers see AED; Cyprus shoppers see EUR. Shoppers can override via a currency selector. Prices are always stored and submitted in USD internally.
- **Product data**: The Presentail OS API (`os.presentail.com`) is the primary source of truth for product listings, categories, occasions, and brands. The API server caches catalog data in-process and refreshes it on a configurable interval.
- **Delivery**: Availability and time slots are country- and city-specific. The storefront fetches live delivery options from the API server which proxies Presentail OS delivery-location data.

## Installation

> This is a private monorepo and is not intended for third-party installation. The instructions below are for Presentail contributors.

**Prerequisites**

- Node.js 20 or later
- pnpm 9 or later (`npm install -g pnpm`)
- Access to the required environment variables (see Configuration)

**Setup**

```bash
pnpm install
```

**Required environment variables** (set as Replit secrets or in a local `.env`):

```
PRESENTAIL_OS_API_URL=<os-api-base-url>
PRESENTAIL_OS_API_KEY=<os-api-key-with-write-access>
PRESENTAIL_OS_WORKSPACE=presentail
DATABASE_URL=<postgres-connection-string>
```

**Run the web storefront (development)**

```bash
pnpm --filter @workspace/presentail-web run dev
```

**Run the API server (development)**

```bash
pnpm --filter @workspace/api-server run dev
```

**Run the mobile app (development)**

```bash
pnpm --filter @workspace/presentail run start
```

**Typecheck the whole workspace**

```bash
pnpm run typecheck
```

**Regenerate API client hooks and Zod schemas** (run whenever `lib/api-spec/openapi.yaml` changes):

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Configuration

| Setting | Description | Default |
|---|---|---|
| `PRESENTAIL_OS_API_URL` | Base URL for the Presentail OS catalog and order API | — |
| `PRESENTAIL_OS_WORKSPACE` | OS workspace slug | `presentail` |
| `DATABASE_URL` | PostgreSQL connection string for push tokens, orders, analytics | — |
| Supported locales | `en`, `ar`, `fr` | — |
| Supported countries | `lb` (Lebanon), `ae` (UAE), `cy` (Cyprus) | — |
| Canonical cities (LB) | beirut, tripoli, sidon, tyre, jounieh, byblos, zahle, baabda | — |
| Canonical cities (AE) | dubai, abu-dhabi, sharjah, ajman | — |
| Canonical cities (CY) | nicosia, limassol, larnaca, paphos | — |
| Canonical site URL | `https://presentail.com` | — |
| Sitemap | Auto-generated at `/sitemap.xml`; covers all locale × city × entity combinations | — |

All API keys, database credentials, admin tokens, and private URLs must be supplied via environment variables or Replit secrets and must never be committed to the repository.

## Usage

**Country and city selection**

When a shopper lands on `presentail.com`, their country is detected from their IP address. The site redirects them to the matching locale-city home page (e.g. `/en-lb/beirut/`). Shoppers can change their city or country via the location picker in the header.

**Product browsing**

- **Home page** (`/en-{country}/{city}/`): featured collections, banners, and best sellers.
- **Shop** (`/en-{country}/{city}/shop`): full product catalog with filter and sort controls.
- **Category pages** (`/en-{country}/{city}/category/{slug}`): products filtered to a single category (e.g. `hand-bouquets`, `chocolates`).
- **Occasion pages** (`/en-{country}/{city}/occasion/{slug}`): products curated for an occasion (e.g. `birthday`, `wedding`).
- **Brand pages** (`/en-{country}/{city}/brand/{slug}`): products from a specific brand.
- **Product detail** (`/en-{country}/{city}/product/{slug}`): full product description, size/color options, and add-to-cart.

**Language and currency selection**

Language and currency selectors are available in the site header. Changing language updates the URL locale prefix (e.g. `ar-lb`) and reloads translated content. Currency changes only affect the displayed price; the order is always submitted in USD.

**Delivery availability**

Not all products are available in all cities. The delivery slot picker on the product and checkout pages reflects live availability for the selected delivery city.

## Examples

```
# Beirut landing page (English)
https://presentail.com/en-lb/beirut/

# Beirut shop (all products)
https://presentail.com/en-lb/beirut/shop

# Category page — hand bouquets, Beirut
https://presentail.com/en-lb/beirut/category/hand-bouquets

# Occasion page — birthday, Dubai
https://presentail.com/en-ae/dubai/occasion/birthday

# Brand page — example brand, Nicosia
https://presentail.com/en-cy/nicosia/brand/example-brand

# Product detail page — example product, Beirut
https://presentail.com/en-lb/beirut/product/example-product-name
```
