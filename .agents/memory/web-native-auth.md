---
name: Web native auth
description: Clerk replaced by localStorage JWT auth on the web app; key storage contract, context shape, and known constraints.
---

# Web Native Auth

## The rule
The web app uses localStorage-backed JWT auth. No ClerkProvider, no Clerk SDK on the frontend.

**Why:** Clerk was removed from the web app to match the mobile native auth pattern and eliminate a third-party auth dependency.

## Storage contract
- JWT token: `localStorage.presentail_web_token`
- Provider: `localStorage.presentail_web_provider` (`"password"`, `"google"`, `"apple"`)

## AuthContextValue shape
`user`, `isSignedIn`, `isLoaded`, `provider: string | null`, `login(token, user, provider?)`, `logout()`, `getToken()` (async, for API compat).

## How to apply
- `apiFetch` in `lib/api.ts` reads `presentail_web_token` from localStorage and injects `Authorization: Bearer` on every request.
- Google sign-in requires `VITE_GOOGLE_WEB_CLIENT_ID`; Apple requires `VITE_APPLE_SERVICE_ID`. Both optional — buttons render but toast on click when unset.
- PasswordCard in PersonalInformation.tsx only renders when `provider === "password"`.
- Tests using localStorage must have `// @vitest-environment jsdom` at the top of the file.
- `requireUserType` middleware on the API server accepts WP JWT tokens (non-Clerk path), so native auth tokens work with all protected endpoints.

## Removed files / exports
- `lib/clerkAuthPath.ts` — deleted
- `ClerkAuthBridge`, `mapClerkUserToShimUser` — removed from AuthContext.tsx
- `ClerkProvider`, `ClerkErrorBoundary`, `ClerkRouterBridge` — removed from App.tsx
- `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PROXY_URL` — no longer needed for web
