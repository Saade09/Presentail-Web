---
name: OS brand image auth
description: Why OS brand images can't be loaded server-side and what would fix it
---

The OS catalog-attributes brands API returns `image_url: "/objects/user_X/uploads/Y"` — this is a SPA route, NOT a direct file path.

The actual file is served at `GET /api/storage/objects/{user_id}/uploads/{file_id}` which returns `{"error":"Missing or invalid image token"}` for any request without a Clerk session JWT from the OS's own Clerk instance.

No workaround with our API key exists. Confirmed:
- `x-api-key` header → 401
- `Authorization: Bearer {api_key}` → 401
- `apiKey` query param → 401
- Google service account token → 401
- Google IAP attempts → irrelevant (it's OS's own auth, not Google IAP)

`image_public_url` field does NOT exist in the API response — confirmed from live API call.

**Fix requires OS team to:**
A. Add `image_public_url` to catalog-attributes brands API with a public CDN URL, OR
B. Allow `x-api-key` auth on `/api/storage/objects/` endpoint

**Why:** OS uses Clerk for user auth on all storage endpoints (Clerk JWT = "image token"). API key is for data endpoints only, storage is separate.
