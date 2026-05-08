# Task #197 — OTA Release Notes

## Summary

Published an EAS Update to the production channel of the Presentail
mobile app so existing installs pick up the official "Ways to Pay"
brand marks shipped in Task #194 (commit `5a63162`,
`artifacts/presentail/components/PaymentBadges.tsx`).

## Release metadata

- **Branch / channel**: `production`
- **Runtime version**: `1.0.2` (matches the current production binary
  declared in `artifacts/presentail/app.json`)
- **Platforms**: iOS and Android
- **Update group ID**: `ed0f6563-3c5b-41f9-845f-528516b496fa`
  - **iOS update ID**: `019e06df-cac5-77cb-9951-c04f356fb564`
  - **Android update ID**: `019e06df-cac5-7861-80a5-61619301fd2f`
- **Source commit**: `5a631629f8200adf598bafabdaecc56ae8f42ef8`
- **Published at**: 2026-05-08 (UTC)
- **Publish command**:
  ```bash
  pnpm --filter @workspace/presentail exec \
    eas update --branch production \
    --message "Update Ways to Pay logos to official brand marks (Task #194)" \
    --non-interactive
  ```
- **EAS Dashboard**:
  https://expo.dev/accounts/saade01/projects/presentail/updates/ed0f6563-3c5b-41f9-845f-528516b496fa

## Bundle details (from `eas update` output)

- iOS bundle: `_expo/static/js/ios/entry-20fe8c0b46f6cc05f87697aebd09b8ee.hbc` (3.78 MB)
- Android bundle: `_expo/static/js/android/entry-542324748763842cf14cd5abf61e899f.hbc` (3.78 MB)
- Assets: 137 iOS / 137 Android — no new asset uploads (PNG logos
  added in Task #194 were already part of a prior bundle's asset set
  and were re-referenced).

## Verification

- **Server-side / publish verification (performed)**: `eas update`
  exited successfully and reported "Published!" with the IDs above.
  The update is visible on the EAS dashboard under the production
  branch for runtime `1.0.2`, which is the runtime currently
  installed on TestFlight / App Store builds.
- **On-device verification (deferred to the team)**: Confirming a
  real install picks up the new "Ways to Pay" logos on next launch
  must be done from a device that already has the production build
  of Presentail installed. This environment has no such device.
  Recommended check: fully close the app, reopen it twice (Expo
  applies an OTA on the launch *after* it downloads), then open the
  product detail page and confirm the brand-color Visa, Mastercard,
  Amex, Apple Pay, PayPal, Whish, etc. logos render in place of the
  previous text/hand-drawn approximations.

## Rollback

If the update causes issues on device, republish the previous good
update from the EAS dashboard ("Republish" on an earlier update in
the `production` branch for runtime `1.0.2`), or run
`eas update:republish --group <previous-group-id>`.
