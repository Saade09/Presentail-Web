/**
 * GitHub Actions workflow-command helpers.
 *
 * Extracted as a standalone module so the annotation format and escaping
 * logic can be unit-tested independently of the scripts that use them.
 */

const TRANSLATIONS_FILE = "artifacts/presentail/lib/translations.ts";

/**
 * Escape a workflow-command *value* (the part after `::`).
 * `%`, CR, and LF are percent-encoded so they cannot break the command syntax.
 */
export function escapeValue(s: string): string {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/**
 * Escape a workflow-command *property* (key=value pairs inside `file=…,title=…`).
 * Extends `escapeValue` by also encoding `:` and `,` which are property delimiters.
 */
export function escapeProp(s: string): string {
  return escapeValue(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

/**
 * Return the fully-formatted `::error` workflow command string (including the
 * trailing newline) without writing it anywhere.  Useful for assertions in tests.
 */
export function formatAnnotation(title: string, message: string): string {
  return `::error file=${escapeProp(TRANSLATIONS_FILE)},title=${escapeProp(title)}::${escapeValue(message)}\n`;
}

/**
 * Emit a GitHub Actions `::error` annotation pointing at the translations file.
 * Reads `GITHUB_ACTIONS` at call time so tests can stub the env before calling.
 * No-op when not running inside GitHub Actions.
 */
export function annotateError(title: string, message: string): void {
  if (process.env["GITHUB_ACTIONS"] === "true") {
    process.stdout.write(formatAnnotation(title, message));
  }
}
