/**
 * Sidecar existence cache helpers.
 *
 * Extracted from serve.mjs so the pure logic can be unit-tested independently
 * of the HTTP server (which reads dist/public/index.html at module load time).
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Walk a directory recursively and collect every path that ends with one of
 * the given suffixes into the provided Set.
 *
 * Silently skips directories that cannot be read (e.g. dist not built yet).
 *
 * @param {string}   dir      - Absolute path of the root directory to walk.
 * @param {string[]} suffixes - File-name suffixes to include (e.g. [".br", ".gz"]).
 * @param {Set<string>} out   - Accumulator set; matching absolute paths are added here.
 */
export function collectSidecars(dir, suffixes, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSidecars(full, suffixes, out);
    } else if (suffixes.some((s) => entry.name.endsWith(s))) {
      out.add(full);
    }
  }
}
