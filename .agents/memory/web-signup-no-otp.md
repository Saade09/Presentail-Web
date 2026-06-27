---
name: Web sign-up has no OTP gate
description: The web SignUp page deliberately has no phone-OTP step; OTP endpoints exist only for the backend/mobile.
---

The web sign-up flow (`artifacts/presentail-web/src/pages/SignUp.tsx`) has exactly two steps: `name-password` and `phone`. Clicking "Create Account" on the phone step calls `/api/auth/register` **directly** — there is intentionally NO OTP code step, no `input-signup-code`, and `/api/auth/otp/send` is never called from web.

**Why:** The OTP gate was removed from web sign-up. `src/pages/SignUp.test.tsx` is the authoritative unit-test source confirming this (it asserts `input-signup-code` is null and `otp/send` is not called). The `/auth/otp/send` + `/auth/otp/verify` endpoints in the OpenAPI spec and api-server still exist, but they serve the backend/mobile, not web sign-up.

**How to apply:** If an e2e/unit test or task assumes a web OTP verification step, it is stale — trust SignUp.test.tsx. The old `e2e/signup-phone-otp.spec.ts` was rewritten to validate the real phone-gate behavior (register called directly, no OTP). Don't re-add OTP expectations to web sign-up without an actual SignUp.tsx feature change.
