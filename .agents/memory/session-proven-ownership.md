---
name: Session-proven ownership vs emailVerified gate
description: Pattern for letting an authenticated user see/act on their own data even when an account-level trust gate (like emailVerified) would otherwise hide it, without weakening anti-takeover protection.
---

When a resource (e.g. an order) can be linked to a customer either by a
proven session (the caller authenticated as that exact customer) or by a
weaker signal (email/phone matching during a guest-to-account merge), a
blanket "hide until emailVerified" gate is often too broad: it also hides
data from the legitimate owner who is genuinely logged in as themselves,
just before they've clicked the verification link.

The fix is to distinguish *how* a record got associated with a customer row:

- If the association was made because the caller was authenticated **as
  that exact customer** at the time (session-proven ownership), it's safe
  to expose regardless of emailVerified — the session itself is the proof,
  independent of email trust.
- If the association was made only by matching email/phone (e.g. a guest
  order later stitched to a customer row), it must stay gated behind
  emailVerified — otherwise an attacker can register with a victim's
  (unverified) email and read the victim's prior guest orders.

**Why:** the naive fix (just deleting the emailVerified read-gate) reopens
the exact account-takeover hole it existed to close. The naive alternative
(leaving the gate as-is) blocks a real logged-in user from seeing their own
just-created data. Both are wrong; the correct fix moves the check to
*write time* (when the row is created/linked) rather than *read time*.

**How to apply:** at write time, resolve the authenticated caller's
canonical row via the same identity-resolution priority `authenticate()`
uses (session claim → provider ID → local ID), and only null out /
withhold the customer linkage when the row being linked is NOT the
authenticated caller's own row AND the account is unverified. At read time,
the emailVerified re-check becomes unnecessary once every write path
enforces this — document *why* the read-side gate was removed, since it
looks like a regression at a glance.
