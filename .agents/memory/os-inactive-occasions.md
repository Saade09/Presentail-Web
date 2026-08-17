---
name: OS API omits inactive occasions
description: No OS endpoint returns inactive occasions or an is_active field — presence in the catalog list is the only active signal
---

**Rule:** The Presentail OS API omits INACTIVE occasions entirely: neither `/api/public/catalog/occasions` nor `/api/catalog-attributes/occasions` returns them, rows carry no `is_active`/`status` field, and no query param (`include_inactive`, `status=all`, etc.) exposes them (verified live Aug 2026). Same shape holds for brands.

**Why:** Inactive occasions (children/colleague/friend) leaked onto the website because "no OS counterpart visible" was treated as active — they resurfaced via product tags and hardcoded lists even though OS admins had deactivated them.

**How to apply:** Any occasion-surfacing server code must treat a warm, non-empty OS occasions catalog list as an authoritative allowlist (absence = inactive), failing open to static/product-tag fallbacks only when the list is null/empty (cold start / fetch failure). The `isActive`/`status` field checks are belt-and-braces only — those fields never arrive in practice. Search's cold-cache static fallback is a deliberate accepted fail-open.
