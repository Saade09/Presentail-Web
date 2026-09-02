# GMC checkout deep links

Presentail's Google Merchant Center “Buy on site” links use the same
feed-facing `g:id` (the product slug) that appears in the Merchant feed.
The numeric Presentail OS product ID is also accepted for operational links.
The server resolves either identifier against the market and city in the URL;
the URL never supplies a price.

## Link templates

Replace `{item_id}` with the exact feed `g:id` or numeric OS product ID. The
`quantity` parameter is optional and is clamped to 1–99.

| Market | Template |
| --- | --- |
| AE Dubai | `https://presentail.com/en-ae/dubai/checkout?item_id={item_id}&quantity=1` |
| AE Abu Dhabi | `https://presentail.com/en-ae/abu-dhabi/checkout?item_id={item_id}&quantity=1` |
| LB Beirut | `https://presentail.com/en-lb/beirut/checkout?item_id={item_id}&quantity=1` |
| CY (locale-only) | `https://presentail.com/en-cy/checkout?item_id={item_id}&quantity=1` |

The parameter names are case-insensitive. Existing UTM and Google click
parameters may be appended; attribution is captured before `item_id` and
`quantity` are removed from the visible URL. Other query parameters remain.
The Greek Cyprus variant can use `el-cy` in place of `en-cy`.

## Runtime control

The resolver is enabled by default. Set
`GMC_CHECKOUT_DEEP_LINKS_ENABLED=0` (or `false`/`off`) on the API deployment to
make GMC parameters inert. The ordinary checkout remains unchanged while the
flag is disabled. Re-enable by removing the variable or setting it to any
other value.

## Safe failure behaviour

Catalog-unavailable, malformed, out-of-market, hidden, unpublished,
out-of-stock, or personalization-required items never enter the cart. The
shopper stays in the normal checkout flow or is sent to the market-local
shop/product destination, with no raw identifier written to diagnostics.
Refreshing or reopening a handled link does not duplicate a cart line.

Live-market verification was not run in this change; verification requires a
production catalog request and Merchant Center click-through. The API and web
build/type checks are the source-controlled verification for this integration.