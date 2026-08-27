---
name: Expo static delivery canary
description: Why mobile static assets use dual same-build variants while manifest negotiation remains dynamic
---

Keep Expo's platform-negotiated manifest endpoint on the Node service. Generate Node and static manifest/bundle variants from the same build, and select the static cohort at manifest request time with a zero-percent default.

**Why:** Static hosting cannot choose iOS versus Android from the `expo-platform` request header. Rewriting the only manifest to static URLs would also turn a canary into a full cutover and make rollback require rebuilding.

**How to apply:** Preserve the Node variant and service during rollout. Increase the static cohort only after the published static path passes decoded-byte, Brotli/gzip, immutable-cache, and platform-manifest checks; rollback by returning the cohort to zero and restarting, without rebuilding.