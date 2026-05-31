---
name: react-test-renderer + vitest (React Native)
description: How to write component tests for Expo/React Native with vitest — why RNTL fails and what works instead.
---

# react-test-renderer + vitest for React Native components

## The rule
Use `react-test-renderer` + a custom `getByText`/`queryByText` over `toJSON()` traversal. Do NOT try to use `@testing-library/react-native` (RNTL) with vitest.

**Why:** RNTL's compiled `build/index.js` internally `require()`s its own TypeScript source files (`.ts`) via CJS. Node.js/vitest cannot execute those files: react-native's `index.js` contains Flow-typed `import typeof` syntax that Node rejects with `SyntaxError`. No amount of `deps.inline`, Vite alias, or `vi.mock` fully intercepts CJS requires *inside* node_modules before the parser error fires.

## How to apply (see artifacts/presentail/tests/test-utils.tsx)

1. **react-native mock** (`tests/__mocks__/react-native.ts`): make `Text`, `View`, etc. render as *host components* using string types (`React.createElement("Text", props)`). This lets `react-test-renderer`'s `toJSON()` see them.

2. **vitest.config.ts alias**: `"react-native" → tests/__mocks__/react-native.ts`. This intercepts ESM imports processed by Vite (the test files and their direct imports like Price.tsx).

3. **setup.ts vi.mock**: `vi.mock("react-native", async () => import("./__mocks__/react-native"))` intercepts any remaining CJS require() calls.

4. **Wrap create() in act()**: In React 19, `ReactTestRenderer.create()` uses concurrent mode. Without `act()`, `toJSON()` returns `null` because the render hasn't committed yet.
   ```ts
   import { act } from "react";
   let instance!: ReactTestRenderer.ReactTestRenderer;
   act(() => { instance = ReactTestRenderer.create(element); });
   ```

5. **Text search over toJSON()**: `toJSON()` strips composite components and shows only host nodes. Traverse the JSON tree with `getTextContent()` + `findNodeByText()`.

## File locations
- `artifacts/presentail/tests/test-utils.tsx` — renderWithProviders with react-test-renderer
- `artifacts/presentail/tests/__mocks__/react-native.ts` — host-component stubs
- `artifacts/presentail/tests/setup.ts` — global mocks
- `artifacts/presentail/vitest.config.ts` — alias + define

## Required package
`@types/react-test-renderer` as devDependency (react-test-renderer itself is already a dep of react-native dev env).
