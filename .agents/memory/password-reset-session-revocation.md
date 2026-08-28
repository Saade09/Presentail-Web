---
name: Password-reset session revocation
description: Durable security rule for invalidating server-issued bearer tokens when credentials change.
---

Server-issued bearer tokens must carry the customer’s current integer session
version. Authentication must load the mapped customer row and require an exact
version match. Tokens created before versioning count as version zero so the
first credential reset invalidates them.

**Why:** timestamp invalidation has an unavoidable same-clock-tick boundary:
using one comparison can admit an old token, while the opposite comparison can
reject a token issued immediately after reset. A database increment provides a
strict ordering boundary and works for every replica.

**How to apply:** when a credential-reset operation succeeds, consume the
one-time reset token and increment the session version in the same conditional
database update. Token issuance reads the current version, token validation
fails closed if the customer mapping cannot be loaded, and cross-system reset
flows persist the revocation before changing the upstream credential.
Third-party JWTs that cannot carry the local version need a reset timestamp
boundary checked against their signed issuance time; fail closed if either the
customer mapping or issuance time is unavailable after a reset. Apply this to
every accepted third-party bearer type, including both WordPress and Clerk.