/**
 * Derives the card "From" label sent to the OS order.
 *
 * Uses only whatever the shopper typed in the "From" field (trimmed).
 * Returns undefined when blank so the OS order record contains no
 * spurious empty string.
 *
 * Max 300 characters — matches the OS field limit.
 */
export function buildCardFrom(
  typedFrom: string,
): string | undefined {
  return typedFrom.trim().slice(0, 300) || undefined;
}
