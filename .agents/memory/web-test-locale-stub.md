---
name: Web test-utils locale stub
description: renderWithProviders' default t() echoes raw keys; how to assert real user-visible copy in web component tests
---

The web `renderWithProviders` (src/test-utils.tsx) supplies a `DEFAULT_LOCALE` whose `t` returns the key unchanged and never interpolates `{param}` placeholders.

**Why:** Assertions like `expect(title.textContent).toContain("Akkar")` silently fail (you get `"checkout.districtChange.updatedFor"`), and interpolation bugs stay invisible.

**How to apply:** When a test asserts user-visible copy or interpolated params, pass a real translator via the `locale` override — build one from `STRINGS` (`entry.en` + `split/join` param substitution) and pass `locale: { t: realT }`. Tests that only use testids can keep the stub.

Related baseline note: `Checkout.klarnaCardFlow.test.tsx` fails 4/4 on a clean tree (Klarna probe never flips PaymentElement mode) — pre-existing, verify with `git stash` before blaming new work.
