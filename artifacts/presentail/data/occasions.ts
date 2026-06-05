export const OCCASION_OPTIONS = [
  { value: "birthday" },
  { value: "love-romance" },
  { value: "anniversary" },
  { value: "wedding" },
  { value: "get-well-soon" },
  { value: "thank-you" },
  { value: "im-sorry" },
  { value: "newborn" },
  { value: "congratulations" },
  { value: "graduation" },
  { value: "condolences" },
] as const;

export type OccasionValue = (typeof OCCASION_OPTIONS)[number]["value"];
