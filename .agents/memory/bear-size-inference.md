---
name: Bear/stuffed-animal size inference relies on embedded cm height
description: How the /category/stuffed-animals size tabs classify bears, and why height parsing beats the LLM
---

# Size inference for the Bears category uses the embedded height, not the LLM

The Presentail OS catalog has no size field, but stuffed-animal product **descriptions embed the physical height** as a literal like `"... 70 cm Height."` / `"... 200 cm Height."`. The size classifier (`artifacts/api-server/src/lib/bearSizeInference.ts`, exposed via `GET /api/categories/stuffed-animals/sizes`) must parse that number first and classify by numeric thresholds — it is far more reliable than keyword guessing or the gpt-5-nano fallback.

Thresholds (cm): `< 45` → small, `45–119` → medium, `>= 120` → life-size. Real data: 70 cm bears = medium, 200 cm bears = life-size.

**Why:** the LLM fallback was silently misclassifying every 70 cm bear as "life-size" (they had no size keyword and no explicit height parse existed), so the Life-Size tab showed 6 bears when only 2 are actually life-size. Keyword substring matching on the marketing description is also unsafe — words like "large"/"big"/"huge" appear as copy ("a big hug") and cause false life-size hits, so those ambiguous words are matched against the curated NAME only, while strong terms ("life-size", "giant", "jumbo", "oversized") may match anywhere.

**How to apply:** for any product attribute the OS catalog encodes in the description text (height, dimensions, piece counts), parse the literal value deterministically before reaching for the LLM. Reserve the LLM for items where no structured signal exists. When you change the classifier, restart `artifacts/api-server: API Server` (not the duplicate `API Server` workflow) to clear the in-process 24h size cache.
