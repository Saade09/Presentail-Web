/**
 * Join legacy split recipient first/last name fields into the single
 * display-name value used by the checkout's "Recipient name" field.
 *
 * Whitespace-safe: trims each part, drops empties, and never invents a
 * surname. Unicode (Arabic, accents, apostrophes, hyphens) passes through
 * untouched.
 */
export function joinRecipientName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  return [firstName, lastName]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}
