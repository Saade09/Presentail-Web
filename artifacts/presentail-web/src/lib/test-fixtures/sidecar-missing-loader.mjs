/**
 * Node.js ESM loader hooks — makes sidecar-cache.mjs appear missing.
 *
 * Loaded by sidecar-missing-hook.mjs via register().  The resolve() hook
 * intercepts any import whose specifier ends with "sidecar-cache.mjs" and
 * throws ERR_MODULE_NOT_FOUND so the guarded try/catch in serve.mjs activates
 * its graceful no-op fallback instead of actually importing the module.
 */

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith("sidecar-cache.mjs")) {
    const err = new Error(
      `Cannot find module '${specifier}' (injected by test fixture)`,
    );
    err.code = "ERR_MODULE_NOT_FOUND";
    throw err;
  }
  return nextResolve(specifier, context);
}
