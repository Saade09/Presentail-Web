/**
 * ESM customization-hook entry point.
 *
 * Use via:  node --import=<file-url-of-this-file> serve.mjs
 *
 * Registers the sidecar-missing-loader so that any dynamic `import()` of a
 * path ending in `sidecar-cache.mjs` throws ERR_MODULE_NOT_FOUND, simulating
 * a missing build artifact without touching the real file on disk.
 */
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
register(
  pathToFileURL(resolve(__dirname, "sidecar-missing-loader.mjs")).href,
  import.meta.url,
);
