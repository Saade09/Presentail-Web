---
name: Category slug aliases
description: Public category route aliases must stay aligned with Presentail OS taxonomy slugs.
---

When a public category route uses a friendlier alias than the OS category slug, add the OS-to-public mapping to the shared category slug remap. The same mapping is consumed by product normalization and navigation filtering, so the route can show products while the menu still checks live OS inventory.

**Why:** A menu tile can appear empty or disappear entirely when metadata uses one slug (for example, `room-decoration`) but the public URL uses another (`room-deco`). Fixing only the navigation label leaves the category page with zero products.

**How to apply:** Verify the actual OS category and product `categories` values before adding a new tile. Use the shared remap rather than separate component-only exceptions.