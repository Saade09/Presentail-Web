---
name: Page description generator model parameter
description: pageDescriptionGenerator uses max_completion_tokens not max_tokens; gpt-5.4-mini rejects max_tokens with a 400.
---

# Page Description Generator — OpenAI parameter name

## Rule
`pageDescriptionGenerator.ts` must use `max_completion_tokens`, not `max_tokens`, when calling the OpenAI chat completions API.

**Why:** The `gpt-5.4-mini` model (and o-series / newer GPT-4o models) reject `max_tokens` with HTTP 400 "Unsupported parameter". The correct parameter is `max_completion_tokens`. This caused every AI-generated category and occasion page description to silently fail and serve fallback copy.

**How to apply:** Any new OpenAI call in the API server that targets a recent model should use `max_completion_tokens`. The same constraint applies to banner translation (see `banner-ai-translation.md`) and any future AI feature added to the API server.

## Relevant file
- `artifacts/api-server/src/lib/pageDescriptionGenerator.ts` — the `max_completion_tokens: 200` call site
