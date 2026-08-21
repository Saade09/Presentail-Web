type Translate = (key: string) => string;

/** Add calendar days without allowing the runtime timezone to shift the date. */
function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Format a market calendar date in the English Midnight helper format. */
export function formatMidnightDeliveryDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const day = date.toLocaleDateString("en-US", { day: "numeric" });
  const month = date.toLocaleDateString("en-US", { month: "short" });
  return `${weekday}, ${day} ${month}`;
}

/**
 * Build the Midnight helper while retaining the legacy `{date}` placeholder
 * used by the existing Arabic and French translations.
 */
export function buildMidnightDeliveryMessage(
  t: Translate,
  selectedIso: string,
  todayIso: string,
): string {
  const promiseDate = addIsoDays(selectedIso, 1);
  const promiseDateStr = formatMidnightDeliveryDate(promiseDate);
  const startPhrase =
    selectedIso === todayIso
      ? "tonight"
      : `on ${formatMidnightDeliveryDate(selectedIso)}`;

  return t("product.midnightArrivesAs")
    .replace("{start}", startPhrase)
    .replace("{end}", promiseDateStr)
    .replace("{date}", promiseDateStr);
}