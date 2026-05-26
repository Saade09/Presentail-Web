---
name: Google Sign-In audience mismatch
description: Why GOOGLE_CLIENT_IDS must include the iOS OAuth client ID on the API server
---

# Google Sign-In — iOS token audience

## The rule
`GOOGLE_CLIENT_IDS` on the API server must be comma-separated and include **all** OAuth client IDs:
- Web client ID (used by web auth and as `webClientId` in the mobile configure call)
- iOS client ID (the `aud` claim in every iOS-originated Google token)
- Android client ID (if Android Google Sign-In is in use)

**Why:** `@react-native-google-signin/google-signin` on iOS issues an ID token whose `aud` (audience) is the iOS OAuth client ID, NOT the web client ID. The server's `jwtVerify` check must include every possible audience value — if the iOS client ID is missing from `GOOGLE_CLIENT_IDS`, every iOS Google sign-in returns 401 "unexpected aud claim value".

**How to apply:** When enabling Google Sign-In or rotating keys, always verify `GOOGLE_CLIENT_IDS` contains the iOS client ID from Google Cloud Console → APIs & Services → Credentials (look for the iOS-type OAuth 2.0 client). Symptom of regression: server log `auth.social.google: token invalid err="unexpected \"aud\" claim value"`.
