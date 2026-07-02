/**
 * Derives the card "From" label sent to the OS order.
 *
 * Priority:
 *   1. Whatever the shopper typed in the "From" field (trimmed).
 *   2. If blank → fall back to the authenticated user's first + last name.
 *   3. If both are empty → undefined (field omitted from the order payload).
 *
 * Max 300 characters — matches the OS field limit.
 */
export function buildCardFrom(
  typedFrom: string,
  authUser: { firstName?: string; lastName?: string } | null | undefined,
): string | undefined {
  return (
    (
      typedFrom.trim() ||
      [authUser?.firstName, authUser?.lastName].filter(Boolean).join(" ").trim()
    ).slice(0, 300) || undefined
  );
}
