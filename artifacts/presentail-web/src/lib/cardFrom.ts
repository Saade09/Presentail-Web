/**
 * Derives the card "From" label sent to the OS order from the billing
 * sender fields.
 *
 * The field is omitted (undefined) when both names are empty so the OS
 * order record contains no spurious blank string.
 *
 * Max 300 characters — matches the OS field limit.
 */
export function buildCardFrom(
  firstName: string,
  lastName: string,
): string | undefined {
  return (
    [firstName, lastName].filter(Boolean).join(" ").trim().slice(0, 300) ||
    undefined
  );
}
