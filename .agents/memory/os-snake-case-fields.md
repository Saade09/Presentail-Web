---
name: OS snake_case / legacy-shape normalisation
description: OS API responses may be snake_case or legacy shapes; never pass raw payloads through unnormalised
---

The OS API returns fields in snake_case on many endpoints (`has_letter_field`, `image_public_url`, `is_featured`, `is_active`) and ids may be numbers, not strings.

**Rule:** every fetch helper in `lib/presentail-os/src/client.ts` must normalise *all* response shapes it accepts — including "legacy" shapes. A legacy `{occasions}` (vs paginated `{items}`) shape can still carry snake_case fields and numeric ids.

**Why:** `fetchOsOccasions` short-circuited `if (raw.occasions) return raw` unnormalised. Result: `imagePublicUrl` was always undefined (field was `image_public_url`), so the occasion-image proxy 404'd for every occasion, and numeric `id` broke Zod string-id schemas downstream (homepage occasions route 500'd) and strict `o.id === req.params.id` comparisons.

**How to apply:**
- Normalise snake_case → camelCase with `raw.snake ?? raw.camel ?? default` in every branch.
- Coerce ids with `String(id)` at the normalisation boundary.
- When comparing an entity id to a route param, use `String(o.id) === id`.
- Both `lib/presentail-os` and the web `osClient` normalisers need the same treatment.
