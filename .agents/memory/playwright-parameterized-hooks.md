---
name: Playwright parameterized hooks
description: Prevent country-specific e2e fixtures from leaking between parameterized tests.
---

Keep each parameterized market's `beforeEach` inside its own nested `test.describe`, rather than declaring hooks directly in a loop at the parent suite level.

**Why:** Playwright accumulates parent-level hooks. A loop that registers multiple root hooks applies every market's storage and route fixture to every test, so a later market can silently overwrite the earlier market's responses.

**How to apply:** When a spec loops over countries, locales, or payment variants with different page routes or init scripts, nest the setup and tests together for each variant.