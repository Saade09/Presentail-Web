---
name: pnpm security override verification
description: How to validate pnpm CVE overrides when transitive dependency ranges remain resolved to a vulnerable release.
---

When remediating a pnpm CVE with an override, verify the actual resolved lockfile snapshots and `pnpm audit` findings, rather than assuming a package-major override covers every dependency edge. If a vulnerable release remains, add a narrowly parent-scoped override for the unresolved path and regenerate the root lockfile.

**Why:** Dependencies can request the same package through different ranges or parents. A broad override may update one branch while a different transitive branch remains pinned and continues to be reported by the scanner.

**How to apply:** After `pnpm install`, search every manifest and lockfile for each vulnerable `package@version`, then use `pnpm why` and the audit finding path to identify the remaining parent edge. Prefer the narrow parent-scoped override and repeat the verification until all target findings are absent.