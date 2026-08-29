---
name: Upload credential scanning
description: Durable rules for detecting credentials left in ignored upload and scratch files.
---

Scan the contents of ignored upload and scratch locations, including pasted text attachments, rather than relying on tracked files, filenames, or JSON extensions alone. Treat escaped PEM blocks as private-key material too. Findings must report only relative paths and generic categories, never matched lines or values.

**Why:** A valid private key can remain embedded in a pasted text attachment even after obvious service-account JSON uploads are removed. Git ignore rules and CI checkout alone cannot see ignored workspace residue.

**How to apply:** Keep local workspace scanning enabled before pushes, retain CI coverage for tracked upload paths, and distinguish ordinary provenance prose from actual credential-shaped JSON or private-key markers.