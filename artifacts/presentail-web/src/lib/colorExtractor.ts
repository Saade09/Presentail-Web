const COLOR_KEYWORDS = [
  "red",
  "white",
  "pink",
  "yellow",
  "purple",
  "blue",
  "orange",
  "green",
  "black",
  "beige",
  "peach",
  "gold",
  "silver",
  "coral",
  "lilac",
] as const;

export type ColorKeyword = (typeof COLOR_KEYWORDS)[number];

export const COLOR_SWATCHES: Record<ColorKeyword, string> = {
  red: "#ef4444",
  white: "#f1f5f9",
  pink: "#f9a8d4",
  yellow: "#fde047",
  purple: "#a855f7",
  blue: "#3b82f6",
  orange: "#f97316",
  green: "#22c55e",
  black: "#1e293b",
  beige: "#e8d5b7",
  peach: "#ffcba4",
  gold: "#fbbf24",
  silver: "#94a3b8",
  coral: "#f87171",
  lilac: "#c4b5fd",
};

export function extractColor(productName: string): ColorKeyword | null {
  const lower = productName.toLowerCase();
  for (const color of COLOR_KEYWORDS) {
    if (new RegExp(`\\b${color}\\b`).test(lower)) {
      return color;
    }
  }
  return null;
}
